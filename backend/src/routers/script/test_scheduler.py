"""
What this file does: Background scheduler engine — polls enabled BulkTestSchedule rows every 30 seconds
with FOR UPDATE SKIP LOCKED row locking, fires run_execution_task for due schedules, advances next_run
via schedule_triggers.next_run_for, reaps stale executions, and dispatches alerts on completion.

Session lifecycle (B4 fix): prepare phase (all DB work) closes session before HTTP execution begins.
Three sessions per task: (1) overlap-guard + exec-row + prepare, (2) results write, (3) handled by _fail_execution.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import SessionLocal
from models import (
    ACTIVE_STATUSES,
    EXEC_STATUS_FAILED,
    EXEC_STATUS_RUNNING,
    BulkTestExecution,
    BulkTestResult,
    BulkTestSchedule,
    ScheduleType,
)
from notification_service import dispatch_alerts
from routers.monitor.crud import refresh_monitor_rollup
from routers.runner.runner import execute_bulk_run, prepare_bulk_run
from schedule_triggers import next_run_for, utcnow_naive
from utils import logs

CHECK_INTERVAL = 30  # seconds
STALE_EXECUTION_TIMEOUT = timedelta(minutes=30)


def _accumulate_execution_stats(exec_obj: BulkTestExecution, case_results: List[Dict[str, Any]]) -> None:
    """Tally pass/fail counts and total duration from case results and write them onto the execution row."""
    total = len(case_results)
    passed = sum(1 for r in case_results if r.get("success"))
    failed = total - passed
    duration = sum(int(r.get("duration_ms") or 0) for r in case_results)
    exec_obj.total_cases = total
    exec_obj.passed = passed
    exec_obj.failed = failed
    exec_obj.duration_ms = duration
    exec_obj.status = "success" if failed == 0 else ("partial" if passed > 0 else "failed")


async def _fail_execution(exec_id: int, schedule_id: int, reason: str) -> None:
    """Mark execution row as failed, refresh monitor rollup, and dispatch alerts."""
    async with SessionLocal() as db:
        ex = await db.get(BulkTestExecution, exec_id)
        if not ex:
            return
        ex.status = EXEC_STATUS_FAILED
        ex.error_message = reason
        ex.finished_at = utcnow_naive()
        await db.commit()
        await refresh_monitor_rollup(db, schedule_id)
        await db.commit()
        await dispatch_alerts(db=db, schedule_id=schedule_id, execution=ex)


async def _reap_stale_executions(db: AsyncSession, now: datetime) -> None:
    """Mark executions stuck in active status past STALE_EXECUTION_TIMEOUT as failed.

    Called at the start of every engine tick. Alerts are NOT dispatched for reaped executions —
    Batch 6 adds EXEC_STATUS_TIMED_OUT and wires alert dispatch for this path.
    """
    stale = (await db.execute(
        select(BulkTestExecution)
        .where(
            BulkTestExecution.status.in_(ACTIVE_STATUSES),
            BulkTestExecution.started_at < now - STALE_EXECUTION_TIMEOUT,
        )
    )).scalars().all()
    for ex in stale:
        ex.status = EXEC_STATUS_FAILED
        ex.error_message = "engine reaper: execution exceeded 30-minute stale threshold"
        ex.finished_at = now


# ------------- background task (fresh session per phase) -------------
async def run_execution_task(schedule_id: int) -> None:
    """
    What it does: Execute one scheduled bulk test run with a 3-phase session lifecycle.

    Phase 1 (DB): overlap-guard, create execution row, prepare all run data — then close session.
    Phase 2 (HTTP): execute_bulk_run with no DB connection held.
    Phase 3 (DB): persist per-case results, update execution stats, fire alerts.

    Notes:
        - Runs as a fire-and-forget asyncio.create_task; all failure paths call _fail_execution.
        - exec_id is captured after db.flush() so it survives session close and is used in all phases.
    """
    exec_id: Optional[int] = None
    plan: Dict[str, Any] = {}

    # Phase 1 — DB work; session closed before any HTTP call
    try:
        async with SessionLocal() as db:
            schedule = await db.get(BulkTestSchedule, schedule_id)
            if not schedule:
                return

            # Overlap guard: skip if any active execution already exists for this schedule
            active = (await db.execute(
                select(BulkTestExecution.id)
                .where(
                    BulkTestExecution.schedule_id == schedule_id,
                    BulkTestExecution.status.in_(ACTIVE_STATUSES),
                )
                .limit(1)
            )).scalar_one_or_none()
            if active is not None:
                return

            now = utcnow_naive()
            exec_obj = BulkTestExecution(
                schedule_id=schedule.id,
                status=EXEC_STATUS_RUNNING,
                started_at=now,
            )
            db.add(exec_obj)
            await db.flush()   # INSERT sent; exec_obj.id set by DB sequence
            exec_id = exec_obj.id  # capture before commit expires the object

            plan = await prepare_bulk_run(db, schedule)
            await db.commit()
        # session closed here — DB connection released before HTTP
    except Exception as e:
        logs(f"scheduler prepare error: schedule_id={schedule_id} error={e}", type="error")
        if exec_id is not None:
            await _fail_execution(exec_id, schedule_id, f"prepare error: {e}")
        return

    # Phase 2 — HTTP execution; no session held
    if "record" not in plan:
        await _fail_execution(exec_id, schedule_id, plan.get("error_message", "prepare failed"))
        return

    try:
        raw = await execute_bulk_run(plan["record"])
    except Exception as e:
        await _fail_execution(exec_id, schedule_id, str(e))
        return

    # Phase 3 — persist results
    data = raw.get("data") or {}
    flat_cases: List[Dict[str, Any]] = []
    for value in data.values():
        for case_res in value.get("flat", []):
            flat_cases.append(case_res)

    async with SessionLocal() as db:
        ex = await db.get(BulkTestExecution, exec_id)
        if not ex:
            return
        now = utcnow_naive()
        for case_res in flat_cases:
            db.add(BulkTestResult(
                execution_id=exec_id,
                case_id=case_res.get("case_id"),
                case_name=case_res.get("case"),
                status_code=case_res.get("status_code"),
                success=bool(case_res.get("success")),
                failures=case_res.get("failures"),
                request=case_res.get("request"),
                response=case_res.get("response"),
                duration_ms=int(case_res.get("duration_ms") or 0),
                created_at=now,
            ))
        _accumulate_execution_stats(ex, flat_cases)
        ex.finished_at = now
        await db.commit()
        await refresh_monitor_rollup(db, schedule_id)
        await db.commit()
        await dispatch_alerts(db=db, schedule_id=schedule_id, execution=ex)


# ------------- engine tick (separate session, row-locked) -------------
async def run_engine_once() -> None:
    """
    What it does: Reap stale executions, query due schedules with FOR UPDATE SKIP LOCKED,
    advance next_run via next_run_for, then launch a background task for each due schedule.

    Notes:
        - FOR UPDATE SKIP LOCKED prevents two engine instances from claiming the same schedule row.
        - next_run_for replaces the old compute_next_run and _seed_first_next_run (removed in B4).
        - Tasks are launched outside the session to avoid holding a DB connection during HTTP execution.
    """
    async with SessionLocal() as db:
        now = utcnow_naive()
        await _reap_stale_executions(db, now)

        schedules = (await db.execute(
            select(BulkTestSchedule)
            .where(
                BulkTestSchedule.enabled.is_(True),
                or_(
                    BulkTestSchedule.next_run.is_(None),
                    BulkTestSchedule.next_run <= now,
                ),
            )
            .with_for_update(skip_locked=True)
        )).scalars().all()

        to_fire: List[int] = []
        for sched in schedules:
            try:
                if sched.next_run is None:
                    # First-run seed: compute and set next_run, but don't fire unless it's already due
                    nxt = next_run_for(sched, after=now)
                    if nxt is None:
                        continue
                    sched.next_run = nxt
                    if sched.next_run > now:
                        continue  # seeded but not yet due — will fire on a later tick

                sched.last_run = now
                sched.next_run = next_run_for(sched, after=now)  # None for "once" (disabled below)
                if sched.type == ScheduleType.once:
                    sched.enabled = False
                to_fire.append(sched.id)
            except Exception as e:
                logs(f"scheduler next_run error: schedule_id={sched.id} error={e}", type="error")

        await db.commit()

    for sid in to_fire:
        asyncio.create_task(run_execution_task(sid))


# ------------- engine loop -------------
async def run_engine() -> None:
    """What it does: Run the scheduler engine indefinitely, calling run_engine_once every CHECK_INTERVAL seconds and logging errors without stopping the loop."""
    while True:
        try:
            await run_engine_once()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logs(f"scheduler tick failed: {e}", type="error")
        await asyncio.sleep(CHECK_INTERVAL)
