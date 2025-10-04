# routers/scheduler/create.py
from __future__ import annotations

from datetime import datetime, timedelta
from calendar import day_name
from typing import List, Optional

from fastapi import APIRouter, Depends, Header

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import get_db
from common_querys import get_user_by_username
from models import BulkTestSchedule, Node, Workspace, BulkTestExecution, ScheduleType
from schema import ScheduleCreate
from utils import create_response, value_correction

router = APIRouter(prefix="/schedules", tags=["schedules"])

# -----------------------------
# Helper Functions
# -----------------------------

def ensure_naive_datetime(dt: Optional[datetime]) -> Optional[datetime]:
    """Ensure datetime is timezone-naive for database compatibility"""
    if dt is None:
        return None
    if hasattr(dt, 'tzinfo') and dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt

# -----------------------------
# Helpers
# -----------------------------

async def verify_nodes(db: AsyncSession, node_ids: List[int], user_id: int):
    if not node_ids:
        return []
    result = await db.execute(
        select(Node)
        .join(Workspace, Node.workspace_id == Workspace.id)
        .where(and_(Node.id.in_(node_ids), Workspace.user_id == user_id))
    )
    return result.scalars().all()

def _parse_hhmm(value: Optional[str]) -> tuple[int, int]:
    if not value or ":" not in value:
        return (0, 0)
    h, m = value.split(":", 1)
    return int(h), int(m)

def _seed_first_next_run(s: BulkTestSchedule, now: datetime) -> Optional[datetime]:
    t = (s.type or "").lower()
    if t == "once":
        # Use the requested time. If it's in the past, we still store it;
        # the engine will ignore until updated/enabled again.
        # Ensure timezone-naive datetime
        return ensure_naive_datetime(s.date_time)

    if t == "minutely":
        n = max(20, int(getattr(s, "interval_count", 20) or 20))  # enforce min 20, but use dynamic value
        base = now.replace(second=0, microsecond=0)
        return base + timedelta(minutes=n)

    if t == "hourly":
        n = max(1, int(getattr(s, "interval_count", 1) or 1))  # dynamic interval
        hh, mm = _parse_hhmm(s.time)
        candidate = now.replace(minute=mm, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(hours=n)  # use dynamic interval
        return candidate

    if t == "daily":
        hh, mm = _parse_hhmm(s.time)
        candidate = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate <= now:
            candidate = (now + timedelta(days=1)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        return candidate

    if t == "weekly":
        days = [d.lower() for d in (s.days_of_week or [])]
        if not days:
            return None
        hh, mm = _parse_hhmm(s.time)
        today_idx = now.weekday()
        today_name = day_name[today_idx].lower()
        today_ok = any(today_name.startswith(d) or today_name == d for d in days)
        candidate_today = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if today_ok and candidate_today > now:
            return candidate_today
        for offset in range(1, 8):
            idx = (today_idx + offset) % 7
            dn = day_name[idx].lower()
            if any(dn.startswith(d) or dn == d for d in days):
                return (now + timedelta(days=offset)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        return None

    if t == "monthly":
        day = min(s.day_of_month or 1, 28)
        hh, mm = _parse_hhmm(s.time)
        if now.day == day:
            candidate = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
            if candidate > now:
                return candidate
        year = now.year + (1 if now.month == 12 else 0)
        month = 1 if now.month == 12 else now.month + 1
        return datetime(year, month, day, hh, mm, 0, 0)

    return None



@router.post("", summary="Create a bulk test schedule")
async def create_schedule(
    body: ScheduleCreate,
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    # 1) Verify user exists
    user = await get_user_by_username(db, username)
    if not user:
        return create_response(400, error_message="User not found")

    # 2) Verify payload ownership (only when we can extract file ids)
    file_ids: List[int] = []
    if body.payload.type == "api":
        file_ids = body.payload.apis
    else:
        file_ids = [a.file_id for a in body.payload.apis]

    if file_ids:
        nodes = await verify_nodes(db, file_ids, user.id)
        allowed = {n.id for n in nodes}
        missing = [fid for fid in file_ids if fid not in allowed]
        if missing:
            return create_response(206, error_message=f"File(s) not found or access denied: {missing}")

    # 3) Build schedule row
    sched = BulkTestSchedule(
        name=body.name,
        username=username,
        workspace_id=workspace_id,
        type=body.type,
        date_time=ensure_naive_datetime(body.date_time),
        time=body.time,
        days_of_week=body.days_of_week,
        day_of_month=body.day_of_month,
        enabled=body.enabled,
        payload=body.payload.dict(),  # store original request
    )

    # interval_count lives on the model (make sure the column exists)
    ic = body.interval_count if body.interval_count is not None else (
        20 if body.type == "minutely" else 1  # 20 min default for minutely, 1 for others
    )
    setattr(sched, "interval_count", ic)

    # 4) Seed next_run
    now = datetime.now()  # This is already timezone-naive
    sched.next_run = _seed_first_next_run(sched, now)

    # 5) Persist
    db.add(sched)
    await db.commit()
    await db.refresh(sched)

    # 6) Response
    data = {
        "id": sched.id,
        "name": sched.name,
        "type": sched.type,
        "enabled": sched.enabled,
        "interval_count": getattr(sched, "interval_count", None),
        "date_time": sched.date_time,
        "time": sched.time,
        "days_of_week": sched.days_of_week,
        "day_of_month": sched.day_of_month,
        "next_run": sched.next_run,
        "created_at": sched.created_at if hasattr(sched, "created_at") else None,
        "updated_at": sched.updated_at if hasattr(sched, "updated_at") else None,
    }
    return create_response(200, value_correction(data))


@router.get("", summary="Get bulk test schedules")
async def get_schedules(
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    # 1) Verify user exists
    user = await get_user_by_username(db, username)
    if not user:
        return create_response(400, error_message="User not found")

    # 2) Get schedules for this user and workspace
    result = await db.execute(
        select(BulkTestSchedule)
        .where(
            and_(
                BulkTestSchedule.username == username,
                BulkTestSchedule.workspace_id == workspace_id
            )
        )
        .options(selectinload(BulkTestSchedule.executions))
        .order_by(BulkTestSchedule.created_at.desc())
    )
    schedules = result.scalars().all()

    # 3) Format response
    data = []
    for sched in schedules:
        schedule_data = {
            "id": sched.id,
            "name": sched.name,
            "type": sched.type,
            "enabled": sched.enabled,
            "interval_count": getattr(sched, "interval_count", None),
            "date_time": sched.date_time,
            "time": sched.time,
            "days_of_week": sched.days_of_week,
            "day_of_month": sched.day_of_month,
            "next_run": sched.next_run,
            "last_run": sched.last_run,
            "created_at": sched.created_at if hasattr(sched, "created_at") else None,
            "updated_at": sched.updated_at if hasattr(sched, "updated_at") else None,
            "executions_count": len(sched.executions) if sched.executions else 0,
        }
        data.append(schedule_data)

    return create_response(200, value_correction(data))


@router.get("/{schedule_id}/executions", summary="Get bulk test executions for a schedule")
async def get_schedule_executions(
    schedule_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    # 1) Verify user exists
    user = await get_user_by_username(db, username)
    if not user:
        return create_response(400, error_message="User not found")

    # 2) Verify schedule ownership
    sched_result = await db.execute(
        select(BulkTestSchedule)
        .where(
            and_(
                BulkTestSchedule.id == schedule_id,
                BulkTestSchedule.username == username
            )
        )
    )
    schedule = sched_result.scalar_one_or_none()
    if not schedule:
        return create_response(404, error_message="Schedule not found or access denied")

    # 3) Get executions for this schedule
    exec_result = await db.execute(
        select(BulkTestExecution)
        .where(BulkTestExecution.schedule_id == schedule_id)
        .options(selectinload(BulkTestExecution.results))
        .order_by(BulkTestExecution.started_at.desc())
    )
    executions = exec_result.scalars().all()

    # 4) Format response
    data = []
    for exec_obj in executions:
        exec_data = {
            "id": exec_obj.id,
            "schedule_id": exec_obj.schedule_id,
            "status": exec_obj.status,
            "started_at": exec_obj.started_at,
            "finished_at": exec_obj.finished_at,
            "total_cases": exec_obj.total_cases,
            "passed": exec_obj.passed,
            "failed": exec_obj.failed,
            "duration_ms": exec_obj.duration_ms,
            "error_message": exec_obj.error_message,
            "results": [
                {
                    "id": res.id,
                    "case_id": res.case_id,
                    "case_name": res.case_name,
                    "status_code": res.status_code,
                    "success": res.success,
                    "failures": res.failures,
                    "request": res.request,
                    "response": res.response,
                    "duration_ms": res.duration_ms,
                    "created_at": res.created_at,
                }
                for res in (exec_obj.results or [])
            ] if exec_obj.results else []
        }
        data.append(exec_data)

    return create_response(200, value_correction(data))


@router.get("/executions/running", summary="Get all running bulk test executions for user workspace")
async def get_running_executions(
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    # 1) Verify user exists
    user = await get_user_by_username(db, username)
    if not user:
        return create_response(400, error_message="User not found")

    # 2) Get all schedules for this user and workspace
    schedules_result = await db.execute(
        select(BulkTestSchedule.id)
        .where(
            and_(
                BulkTestSchedule.username == username,
                BulkTestSchedule.workspace_id == workspace_id
            )
        )
    )
    schedule_ids = [row[0] for row in schedules_result.fetchall()]

    if not schedule_ids:
        return create_response(200, value_correction([]))

    # 3) Get running/queued executions for these schedules
    exec_result = await db.execute(
        select(BulkTestExecution)
        .where(
            and_(
                BulkTestExecution.schedule_id.in_(schedule_ids),
                BulkTestExecution.status.in_(["running", "queued"])
            )
        )
        .options(selectinload(BulkTestExecution.schedule))
        .order_by(BulkTestExecution.started_at.desc())
    )
    executions = exec_result.scalars().all()

    # 4) Format response
    data = []
    for exec_obj in executions:
        exec_data = {
            "id": exec_obj.id,
            "schedule_id": exec_obj.schedule_id,
            "schedule_name": exec_obj.schedule.name if exec_obj.schedule else "Unknown",
            "status": exec_obj.status,
            "started_at": exec_obj.started_at,
            "finished_at": exec_obj.finished_at,
            "total_cases": exec_obj.total_cases,
            "passed": exec_obj.passed,
            "failed": exec_obj.failed,
            "duration_ms": exec_obj.duration_ms,
            "error_message": exec_obj.error_message,
        }
        data.append(exec_data)

    return create_response(200, value_correction(data))


@router.delete("/{schedule_id}", summary="Delete a bulk test schedule and all its executions/results")
async def delete_schedule(
    schedule_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    # 1) Verify user exists
    user = await get_user_by_username(db, username)
    if not user:
        return create_response(400, error_message="User not found")

    # 2) Verify schedule ownership
    sched_result = await db.execute(
        select(BulkTestSchedule)
        .where(
            and_(
                BulkTestSchedule.id == schedule_id,
                BulkTestSchedule.username == username
            )
        )
    )
    schedule = sched_result.scalar_one_or_none()
    if not schedule:
        return create_response(404, error_message="Schedule not found or access denied")

    # 3) Delete all related results first (due to foreign key constraints)
    from models import BulkTestResult

    # Get all execution IDs for this schedule
    exec_result = await db.execute(
        select(BulkTestExecution.id)
        .where(BulkTestExecution.schedule_id == schedule_id)
    )
    execution_ids = [row[0] for row in exec_result.fetchall()]

    if execution_ids:
        # Delete all results for these executions
        await db.execute(
            BulkTestResult.__table__.delete().where(BulkTestResult.execution_id.in_(execution_ids))
        )

        # Delete all executions for this schedule
        await db.execute(
            BulkTestExecution.__table__.delete().where(BulkTestExecution.schedule_id == schedule_id)
        )

    # 4) Delete the schedule itself
    await db.execute(
        BulkTestSchedule.__table__.delete().where(BulkTestSchedule.id == schedule_id)
    )

    # 5) Commit the transaction
    await db.commit()

    return create_response(200, {"message": "Schedule and all related data deleted successfully"})


@router.put("/{schedule_id}", summary="Update a bulk test schedule")
async def update_schedule(
    schedule_id: int,
    body: ScheduleCreate,
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    # 1) Verify user exists
    user = await get_user_by_username(db, username)
    if not user:
        return create_response(400, error_message="User not found")

    # 2) Verify schedule ownership
    sched_result = await db.execute(
        select(BulkTestSchedule)
        .where(
            and_(
                BulkTestSchedule.id == schedule_id,
                BulkTestSchedule.username == username,
                BulkTestSchedule.workspace_id == workspace_id
            )
        )
    )
    schedule = sched_result.scalar_one_or_none()
    if not schedule:
        return create_response(404, error_message="Schedule not found or access denied")

    # 3) Verify payload ownership (same as create)
    file_ids: List[int] = []
    if body.payload.type == "api":
        file_ids = body.payload.apis
    else:
        file_ids = [a.file_id for a in body.payload.apis]

    if file_ids:
        nodes = await verify_nodes(db, file_ids, user.id)
        allowed = {n.id for n in nodes}
        missing = [fid for fid in file_ids if fid not in allowed]
        if missing:
            return create_response(206, error_message=f"File(s) not found or access denied: {missing}")

    # 4) Update schedule fields
    schedule.name = body.name
    schedule.type = ScheduleType(body.type)  # Convert string to enum
    schedule.date_time = ensure_naive_datetime(body.date_time)
    schedule.time = body.time
    schedule.days_of_week = body.days_of_week
    schedule.day_of_month = body.day_of_month
    schedule.enabled = body.enabled
    schedule.payload = body.payload.dict()

    # Update interval_count
    ic = body.interval_count if body.interval_count is not None else (
        20 if body.type == "minutely" else 1  # 20 min default for minutely
    )
    setattr(schedule, "interval_count", ic)

    # 5) Recalculate next_run based on new schedule
    now = datetime.now()
    schedule.next_run = _seed_first_next_run(schedule, now)
    schedule.updated_at = now

    # 6) Persist changes
    await db.commit()
    await db.refresh(schedule)

    # 7) Response
    data = {
        "id": schedule.id,
        "name": schedule.name,
        "type": schedule.type,
        "enabled": schedule.enabled,
        "interval_count": getattr(schedule, "interval_count", None),
        "date_time": schedule.date_time,
        "time": schedule.time,
        "days_of_week": schedule.days_of_week,
        "day_of_month": schedule.day_of_month,
        "next_run": schedule.next_run,
        "created_at": schedule.created_at,
        "updated_at": schedule.updated_at,
    }
    return create_response(200, value_correction(data))
