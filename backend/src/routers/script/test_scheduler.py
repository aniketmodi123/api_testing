import asyncio
from calendar import day_name
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from config import SessionLocal  # async_sessionmaker[AsyncSession]
from models import BulkTestSchedule, BulkTestExecution, BulkTestResult
from routers.runner.runner import bulk_run_cases

CHECK_INTERVAL = 30  # seconds


# ---------------- time helpers ----------------
def _parse_hhmm(value: Optional[str]) -> tuple[int, int]:
    if not value or ":" not in value:
        return (0, 0)
    h, m = value.split(":", 1)
    return int(h), int(m)


async def compute_next_run(schedule: BulkTestSchedule) -> Optional[datetime]:
    now = datetime.now()
    if schedule.type == "once":
        return None
    if schedule.type == "daily":
        hh, mm = _parse_hhmm(schedule.time)
        return (now + timedelta(days=1)).replace(hour=hh, minute=mm, second=0, microsecond=0)
    if schedule.type == "weekly":
        days = [d.lower() for d in (schedule.days_of_week or [])]
        if not days:
            return None
        hh, mm = _parse_hhmm(schedule.time)
        today_idx = now.weekday()
        for offset in range(1, 8):
            idx = (today_idx + offset) % 7
            dn = day_name[idx].lower()
            if any(dn.startswith(d) or dn == d for d in days):
                return (now + timedelta(days=offset)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        return None
    if schedule.type == "monthly":
        day = min(schedule.day_of_month or 1, 28)
        hh, mm = _parse_hhmm(schedule.time)
        year = now.year + (1 if now.month == 12 else 0)
        month = 1 if now.month == 12 else now.month + 1
        return datetime(year, month, day, hh, mm, 0, 0)
    return None


def _accumulate_execution_stats(exec_obj: BulkTestExecution, case_results: List[Dict[str, Any]]):
    total = len(case_results)
    passed = sum(1 for r in case_results if r.get("success"))
    failed = total - passed
    duration = sum(int(r.get("duration_ms") or 0) for r in case_results)
    exec_obj.total_cases = total
    exec_obj.passed = passed
    exec_obj.failed = failed
    exec_obj.duration_ms = duration
    exec_obj.status = "success" if failed == 0 else ("partial" if passed > 0 else "failed")


# ------------- background task (fresh session) -------------
async def run_execution_task(schedule_id: int):
    async with SessionLocal() as db:  # NEW session for this task
        # reload schedule in this session
        schedule = await db.get(BulkTestSchedule, schedule_id)
        if not schedule:
            return

        # create execution row
        now = datetime.now()
        exec_obj = BulkTestExecution(schedule_id=schedule.id, status="running", started_at=now)
        db.add(exec_obj)
        await db.commit()
        await db.refresh(exec_obj)

        try:
            # call your runner with THIS task's session
            raw = await bulk_run_cases(schedule, db=db)
            if not isinstance(raw, dict) or raw.get("response_code") != 200:
                raise RuntimeError(f"bulk_run_cases failed: {raw!r}")

            data = raw.get("data") or {}

            # persist results
            flat_cases: List[Dict[str, Any]] = []
            for key, value in data.items():
                for case_res in value.get("flat", []):
                    db.add(BulkTestResult(
                        execution_id=exec_obj.id,
                        case_id=case_res.get("case_id"),
                        case_name=case_res.get("case"),
                        status_code=case_res.get("status_code"),
                        success=bool(case_res.get("success")),
                        failures=case_res.get("failures"),
                        request=case_res.get("request"),
                        response=case_res.get("response"),
                        duration_ms=int(case_res.get("duration_ms") or 0),
                        created_at=datetime.now(),
                    ))
                    flat_cases.append(case_res)

            _accumulate_execution_stats(exec_obj, flat_cases)
            exec_obj.finished_at = datetime.now()
            await db.commit()

        except Exception as e:
            exec_obj.status = "failed"
            exec_obj.error_message = str(e)
            exec_obj.finished_at = datetime.now()
            await db.commit()


# ------------- engine tick (separate session) -------------
async def run_engine_once():
    async with SessionLocal() as db:  # session for the scheduler tick
        now = datetime.now()
        schedules = (
            await db.execute(
                select(BulkTestSchedule).where(
                    BulkTestSchedule.enabled.is_(True),
                    BulkTestSchedule.next_run <= now,
                )
            )
        ).scalars().all()

        # update schedule timing in THIS transaction
        for sched in schedules:
            sched.last_run = now
            # sched.next_run = await compute_next_run(sched)
            # if sched.type == "once":
            #     sched.enabled = False

        await db.commit()

    # spawn tasks AFTER commit, each with its own session
    for sched in schedules:
        asyncio.create_task(run_execution_task(sched.id))


# ------------- engine loop -------------
async def run_engine():
    while True:
        await run_engine_once()
        await asyncio.sleep(CHECK_INTERVAL)
