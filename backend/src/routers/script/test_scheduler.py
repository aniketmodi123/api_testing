"""
What this file does: Background scheduler engine — polls enabled BulkTestSchedule rows every 30 seconds, fires run_execution_task for due schedules, advances next_run, and dispatches alerts on completion.
"""
import asyncio
from calendar import day_name
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy import or_, select
from config import SessionLocal  # async_sessionmaker[AsyncSession]
from models import BulkTestSchedule, BulkTestExecution, BulkTestResult
from routers.runner.runner import bulk_run_cases
from notification_service import dispatch_alerts
from utils import logs

CHECK_INTERVAL = 30  # seconds

def _parse_hhmm(value: Optional[str]) -> tuple[int, int]:
    """What it does: Parse a "HH:MM" string into an (hour, minute) int tuple; returns (0, 0) when value is None or malformed."""
    if not value or ":" not in value:
        return (0, 0)
    h, m = value.split(":", 1)
    return int(h), int(m)

def _seed_first_next_run(s: BulkTestSchedule, now: datetime) -> Optional[datetime]:
    """What it does: Compute the initial next_run timestamp for a schedule when next_run has not yet been set."""
    t = (s.type or "").lower()
    if t == "once":
        return s.date_time  # may be None; engine will ignore until set
    if t == "minutes":
        n = max(20, int(s.interval_count or 20))  # enforce min 20
        # align to the next N-minute boundary from now
        minute = (now.minute // n + 1) * n
        delta = minute - now.minute
        return (now.replace(second=0, microsecond=0) + timedelta(minutes=delta))
    if t == "hourly":
        n = max(1, int(s.interval_count or 1))
        hh, mm = _parse_hhmm(s.time)  # we only use minute component
        candidate = now.replace(minute=mm, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(hours=1)
        # snap to the next hour that matches the every-n-hours cadence
        hours_ahead = ((candidate.hour - now.hour) % n) or n
        return candidate + timedelta(hours=(hours_ahead - 1))
    if t == "daily":
        n = max(1, int(s.interval_count or 1))
        hh, mm = _parse_hhmm(s.time)
        candidate = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        # we’ll fast-forward in compute_next_run, so a 1-day seed is fine
        return candidate
    if t == "weekly":
        n = max(1, int(s.interval_count or 1))
        days = [d.lower() for d in (s.days_of_week or [])]
        if not days:
            return None
        hh, mm = _parse_hhmm(s.time)
        today_idx = now.weekday()
        candidate_today = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        today_name = day_name[today_idx].lower()
        if any(today_name.startswith(d) or today_name == d for d in days) and candidate_today > now:
            return candidate_today
        for offset in range(1, 8):
            idx = (today_idx + offset) % 7
            dn = day_name[idx].lower()
            if any(dn.startswith(d) or dn == d for d in days):
                return (now + timedelta(days=offset)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        return None
    if t == "monthly":
        n = max(1, int(s.interval_count or 1))
        day = min(s.day_of_month or 1, 28)
        hh, mm = _parse_hhmm(s.time)
        candidate = now.replace(day=min(now.day, 28), hour=hh, minute=mm, second=0, microsecond=0)
        if now.day > day or candidate <= now:
            # jump to next month on the requested day
            year = now.year + (1 if now.month == 12 else 0)
            month = 1 if now.month == 12 else now.month + 1
            return datetime(year, month, day, hh, mm)
        return candidate.replace(day=day)
    return None

async def compute_next_run(s: BulkTestSchedule) -> Optional[datetime]:
    """
    What it does: Advance next_run to the next strictly-future trigger time after a schedule has fired.
    Args:
        s: The schedule row to advance; reads type, interval_count, time, days_of_week, day_of_month, next_run.
    Returns:
        datetime: The next trigger time in the future.
        None:
            Returned when:
            - type is ``"once"`` (disabled after first run)
            - type is ``"weekly"`` and days_of_week is empty
            - type is unrecognised
    Steps:
        - Step 1: Return None immediately for ``"once"`` schedules — no repeat
        - Step 2: Determine the base start point from next_run or seed a new one; return None if base cannot be determined
        - Step 3: If base is already in the future, return it as-is (handles first-run case)
        - Step 4: For ``"minutes"`` — fast-forward by integral step multiples until strictly past now
        - Step 5: For ``"hourly"`` — snap to configured minute, then advance by hour-step until past now
        - Step 6: For ``"daily"`` — advance by day-step until past now, keeping configured HH:MM
        - Step 7: For ``"weekly"`` — advance week blocks and find first matching weekday at configured HH:MM past now
        - Step 8: For ``"monthly"`` — advance by month-step count until the target day/time is past now
    """
    now = datetime.now()
    t = (s.type or "").lower()

    if t == "once":
        return None  # disabled after first run

    # base: if we already had a next_run, advance from there; else seed
    base = s.next_run or _seed_first_next_run(s, now)
    if not base:
        return None

    # If base is already in the future (e.g., first run), return it
    if base > now:
        return base

    # Otherwise fast-forward by integral steps to the first strictly-future time
    if t == "minutes":
        step = max(20, int(s.interval_count or 20))  # enforce min 20
        delta_min = ((now - base).total_seconds() // 60) + 1
        steps = int((delta_min + step - 1) // step)  # ceil
        return base + timedelta(minutes=step * steps)

    if t == "hourly":
        step = max(1, int(s.interval_count or 1))
        hh, mm = _parse_hhmm(s.time)
        # advance in hour-steps but keep the configured minute
        cur = base
        if cur.minute != mm:
            cur = cur.replace(minute=mm, second=0, microsecond=0)
        while cur <= now:
            cur += timedelta(hours=step)
        return cur

    if t == "daily":
        step = max(1, int(s.interval_count or 1))
        hh, mm = _parse_hhmm(s.time)
        cur = base.replace(hour=hh, minute=mm, second=0, microsecond=0)
        while cur <= now:
            cur += timedelta(days=step)
        return cur

    if t == "weekly":
        step_weeks = max(1, int(s.interval_count or 1))
        days = [d.lower() for d in (s.days_of_week or [])]
        if not days:
            return None
        hh, mm = _parse_hhmm(s.time)
        cur = base
        # advance by “week blocks” until we can place the next matching weekday > now
        while True:
            # find the earliest matching weekday at hh:mm within/after cur’s week block
            start = cur
            placed = None
            for add in range(0, 7):
                d = start + timedelta(days=add)
                dn = day_name[d.weekday()].lower()
                if any(dn.startswith(x) or dn == x for x in days):
                    candidate = d.replace(hour=hh, minute=mm, second=0, microsecond=0)
                    if candidate > now:
                        placed = candidate
                        break
            if placed:
                return placed
            cur = cur + timedelta(weeks=step_weeks)

    if t == "monthly":
        step_months = max(1, int(s.interval_count or 1))
        day = min(s.day_of_month or 1, 28)
        hh, mm = _parse_hhmm(s.time)

        def add_months(d: datetime, n: int) -> datetime:
            y = d.year + (d.month - 1 + n) // 12
            m = (d.month - 1 + n) % 12 + 1
            dd = min(day, 28)
            return datetime(y, m, dd, hh, mm)

        cur = base
        # normalize day & time
        cur = cur.replace(day=min(cur.day, 28), hour=hh, minute=mm, second=0, microsecond=0)
        while cur <= now:
            cur = add_months(cur, step_months)
        return cur

    return None


def _accumulate_execution_stats(exec_obj: BulkTestExecution, case_results: List[Dict[str, Any]]):
    """What it does: Tally pass/fail counts and total duration from case results and write them onto the execution row."""
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
    """
    What it does: Execute one scheduled bulk test run in an isolated DB session, persist per-case results, update execution stats, and fire alerts on completion.
    Notes:
        - Runs as a fire-and-forget asyncio task; alerts are dispatched in the finally block regardless of success or failure.
    """
    async with SessionLocal() as db:  # NEW session for this task
        schedule = await db.get(BulkTestSchedule, schedule_id)
        if not schedule:
            return

        now = datetime.now()
        exec_obj = BulkTestExecution(schedule_id=schedule.id, status="running", started_at=now)
        db.add(exec_obj)
        await db.commit()
        await db.refresh(exec_obj)

        try:
            # KEEPING YOUR ORIGINAL INPUT CALL:
            raw = await bulk_run_cases(schedule, db=db)

            if not isinstance(raw, dict) or raw.get("response_code") != 200:
                raise RuntimeError(f"bulk_run_cases failed: {raw!r}")

            data = raw.get("data") or {}

            # ---------- DO NOT CHANGE THIS LOGIC ----------
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
            # ---------- END KEEPED LOGIC ----------

            _accumulate_execution_stats(exec_obj, flat_cases)
            exec_obj.finished_at = datetime.now()
            await db.commit()

        except Exception as e:
            exec_obj.status = "failed"
            exec_obj.error_message = str(e)
            exec_obj.finished_at = datetime.now()
            await db.commit()

        finally:
            # Fire-and-forget alerts regardless of success/failure
            await dispatch_alerts(db=db, schedule_id=schedule_id, execution=exec_obj)


# ------------- engine tick (separate session) -------------
async def run_engine_once():
    """
    What it does: Query all due enabled schedules in a single DB session, advance their next_run, then launch a background task for each that was due.
    Notes:
        - Disables ``"once"`` schedules after firing. Tasks are launched outside the session to avoid holding a DB connection during HTTP execution.
    """
    async with SessionLocal() as db:
        now = datetime.now()
        schedules = (
            await db.execute(
                select(BulkTestSchedule)
                .where(
                    BulkTestSchedule.enabled.is_(True),
                    or_(
                        BulkTestSchedule.next_run == None,  # seed first run
                        BulkTestSchedule.next_run <= now,   # due
                    ),
                )
            )
        ).scalars().all()

        for sched in schedules:
            # seed first run if needed
            if sched.next_run is None:
                sched.next_run = _seed_first_next_run(sched, now)
                # if still None (bad config), skip scheduling
                if sched.next_run is None:
                    continue
            # if due, mark last_run and compute the *next* occurrence
            if sched.next_run <= now:
                sched.last_run = now
                sched.next_run = await compute_next_run(sched)
                if sched.type == "once":
                    sched.enabled = False

        await db.commit()

    # Launch tasks *only* for those that were due (next_run <= now when we looked)
    for sched in schedules:
        if sched.last_run == now:   # indicates we just scheduled it this tick
            asyncio.create_task(run_execution_task(sched.id))

# ------------- engine loop -------------
async def run_engine():
    """What it does: Run the scheduler engine indefinitely, calling run_engine_once every CHECK_INTERVAL seconds and logging errors without stopping the loop."""
    while True:
        try:
            logs("scheduler tick")
            await run_engine_once()
            logs(f"scheduler tick done, waiting {CHECK_INTERVAL}s")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logs(f"scheduler tick failed: {e}", type="error")
        await asyncio.sleep(CHECK_INTERVAL)
