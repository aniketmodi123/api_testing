import asyncio
from calendar import day_name
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    BulkTestSchedule,
    BulkTestExecution,
    BulkTestResult,
)
from routers.runner.runner import bulk_run_cases


CHECK_INTERVAL = 30  # seconds between polls


# ---------------------------
# Next-run computation
# ---------------------------
def _parse_hhmm(value: Optional[str]) -> tuple[int, int]:
    if not value or ":" not in value:
        return (0, 0)
    h, m = value.split(":", 1)
    return int(h), int(m)


async def compute_next_run(schedule: BulkTestSchedule) -> Optional[datetime]:
    """
    Compute the next_run for a schedule after it has just run.
    """
    now = datetime.now()

    if schedule.type == "once":
        # one-shot schedules are disabled after first execution
        return None

    if schedule.type == "daily":
        hh, mm = _parse_hhmm(schedule.time)
        # next day at the configured time
        nxt = (now + timedelta(days=1)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        return nxt

    if schedule.type == "weekly":
        # schedule.days_of_week contains strings like ["Mon","Wed"] or full names.
        days = [d.lower() for d in (schedule.days_of_week or [])]
        if not days:
            return None
        hh, mm = _parse_hhmm(schedule.time)
        today_idx = now.weekday()  # 0 = Monday
        # look ahead one full week
        for offset in range(1, 8):
            idx = (today_idx + offset) % 7
            dn = day_name[idx].lower()  # "monday", ...
            # match either by startswith ("mon") or exact full name
            if any(dn.startswith(d) or dn == d for d in days):
                return (now + timedelta(days=offset)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        return None

    if schedule.type == "monthly":
        # next month same day (cap at 28 to avoid invalid dates)
        day = schedule.day_of_month or 1
        day = min(day, 28)
        hh, mm = _parse_hhmm(schedule.time)
        year = now.year + (1 if now.month == 12 else 0)
        month = 1 if now.month == 12 else now.month + 1
        return datetime(year, month, day, hh, mm, 0, 0)

    return None


# ---------------------------
# Helpers to parse bulk_run_cases response
# ---------------------------
def _safe_get(d: Dict[str, Any], key: str, default=None):
    v = d.get(key, default) if isinstance(d, dict) else default
    return v


def _collect_file_results_from_tree(file_tree: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Your bulk_run_cases returns a tree where 'file' nodes are replaced with:
      {
        "file_id": <int>,
        "meta": {...},
        "flat": [ { case-level result }, ... ]
      }

    This walks the tree and returns only those file result nodes.
    """
    bucket: List[Dict[str, Any]] = []

    def walk(node: Dict[str, Any]):
        if not isinstance(node, dict):
            return
        if "file_id" in node and ("flat" in node or "meta" in node):
            bucket.append(node)
            return
        # folder-like: may contain children
        for child in _safe_get(node, "children", []) or []:
            walk(child)

    for root in file_tree or []:
        walk(root)
    return bucket


def _accumulate_execution_stats(exec_obj: BulkTestExecution, case_results: List[Dict[str, Any]]):
    total, passed, failed, duration = 0, 0, 0, 0
    for r in case_results:
        total += 1
        if r.get("success"):
            passed += 1
        else:
            failed += 1
        duration += int(r.get("duration_ms") or 0)

    exec_obj.total_cases = total
    exec_obj.passed = passed
    exec_obj.failed = failed
    exec_obj.duration_ms = duration
    exec_obj.status = "success" if failed == 0 else ("partial" if passed > 0 else "failed")


# ---------------------------
# Run one execution (calls your bulk_run_cases)
# ---------------------------
async def run_execution(db: AsyncSession, schedule: BulkTestSchedule, exec_obj: BulkTestExecution):
    try:
        exec_obj.status = "running"
        exec_obj.started_at = datetime.now()
        await db.commit()

        # bulk_run_cases expects a dict with keys: req, username, workspace_id
        # Your schedule.payload should contain those (by design from earlier steps).
        # Example payload:
        # { "req": <Union[BulkRunnerApi|BulkRunnerSelected] object/dict>,
        #   "username": "email@domain",
        #   "workspace_id": 123 }
        raw = await bulk_run_cases(schedule.payload, db=db)

        # create_response return shape: { "response_code": <int>, "data": {...}, "error_message"?: str }
        if not isinstance(raw, dict):
            raise RuntimeError("bulk_run_cases returned non-dict result")

        rc = raw.get("response_code", 500)
        if rc != 200:
            raise RuntimeError(f"bulk_run_cases failed with response_code={rc}, error={raw.get('error_message')}")

        data = raw.get("data") or {}
        file_tree = data.get("file_tree") or []

        # Extract only file result nodes:
        file_nodes = _collect_file_results_from_tree(file_tree)

        # Persist case-level results
        case_results_flat: List[Dict[str, Any]] = []
        for fnode in file_nodes:
            flat = _safe_get(fnode, "flat", []) or []
            for case_res in flat:
                # store result row
                result = BulkTestResult(
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
                )
                db.add(result)
                case_results_flat.append(case_res)

        # Aggregate stats and finalize
        _accumulate_execution_stats(exec_obj, case_results_flat)
        exec_obj.finished_at = datetime.now()
        await db.commit()

    except Exception as e:
        exec_obj.status = "failed"
        exec_obj.error_message = str(e)
        exec_obj.finished_at = datetime.now()
        await db.commit()


# ---------------------------
# Main scheduler loop
# ---------------------------
async def run_engine(db: AsyncSession):
    """
    Polls for due schedules and launches executions.
    Make sure you run this in a background task on app start,
    or from a separate worker process that shares the DB.
    """
    while True:
        now = datetime.now()

        # fetch due and enabled schedules
        schedules = (
            await db.execute(
                select(BulkTestSchedule).where(
                    BulkTestSchedule.enabled.is_(True),
                    BulkTestSchedule.next_run <= now,
                )
            )
        ).scalars().all()

        for sched in schedules:
            # create execution row
            exec_obj = BulkTestExecution(
                schedule_id=sched.id,
                status="queued",
                started_at=now,
            )
            db.add(exec_obj)
            await db.commit()
            await db.refresh(exec_obj)

            # kick off background runner
            asyncio.create_task(run_execution(db, sched, exec_obj))

            # update schedule next_run/last_run
            sched.last_run = now
            sched.next_run = await compute_next_run(sched)
            if sched.type == "once":
                sched.enabled = False
            await db.commit()

        await asyncio.sleep(CHECK_INTERVAL)
