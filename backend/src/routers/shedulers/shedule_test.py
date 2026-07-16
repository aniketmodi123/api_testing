"""
What this file does: Exposes CRUD endpoints under /schedules for creating, reading, updating,
and deleting bulk test schedules and their execution records.

B4/B5 changes: replaced _seed_first_next_run with next_run_for from schedule_triggers;
all datetime.now() replaced with utcnow_naive; added timezone support; days_of_week
canonicalized to full lowercase; past once rejected; new endpoints: detail, enable toggle,
run-now, paginated executions list, execution detail.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from common_querys import verify_schedule_nodes
from config import get_db
from models import (
    ACTIVE_STATUSES,
    BulkTestExecution,
    BulkTestResult,
    BulkTestSchedule,
    ScheduleType,
    User,
)
from routers.script.test_scheduler import run_execution_task
from schedule_triggers import next_run_for, to_utc_naive, utcnow_naive
from schema import ScheduleCreate
from utils import create_response, value_correction

router = APIRouter(prefix="/schedules", tags=["schedules"])

# Canonical weekday names expected by schedule_triggers.py (strftime("%A").lower())
_DOW_MAP: dict[str, str] = {
    "mon": "monday", "tue": "tuesday", "wed": "wednesday",
    "thu": "thursday", "fri": "friday", "sat": "saturday", "sun": "sunday",
}


def _canonicalize_days(days: Optional[List[str]]) -> Optional[List[str]]:
    """Normalize day abbreviations or names to full lowercase, deduplicating preserving order."""
    if not days:
        return days
    result: List[str] = []
    for d in days:
        canonical = _DOW_MAP.get(d.lower()[:3])
        if canonical is None:
            raise ValueError(f"Invalid day_of_week value: {d!r}")
        if canonical not in result:
            result.append(canonical)
    return result


def _sched_dict(sched: BulkTestSchedule, exec_count: Optional[int] = None) -> dict:
    d: dict = {
        "id": sched.id,
        "name": sched.name,
        "type": sched.type,
        "enabled": sched.enabled,
        "interval_count": sched.interval_count,
        "date_time": sched.date_time,
        "time": sched.time,
        "days_of_week": sched.days_of_week,
        "day_of_month": sched.day_of_month,
        "timezone": sched.timezone,
        "next_run": sched.next_run,
        "last_run": sched.last_run,
        "created_at": sched.created_at,
        "updated_at": sched.updated_at,
    }
    if exec_count is not None:
        d["executions_count"] = exec_count
    return d


class _EnableBody(BaseModel):
    enabled: bool


# ── literal path first to avoid /{schedule_id} capture ────────────────────────

@router.get("/executions/running", summary="Get all running bulk test executions for user workspace")
async def get_running_executions(
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /schedules/executions/running — return all running or queued executions across the user's workspace schedules."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    schedule_ids = [
        row[0] for row in (await db.execute(
            select(BulkTestSchedule.id)
            .where(and_(
                BulkTestSchedule.username == username,
                BulkTestSchedule.workspace_id == workspace_id,
            ))
        )).fetchall()
    ]
    if not schedule_ids:
        return create_response(200, value_correction([]))

    rows = (await db.execute(
        select(BulkTestExecution, BulkTestSchedule.name.label("schedule_name"))
        .join(BulkTestSchedule, BulkTestSchedule.id == BulkTestExecution.schedule_id)
        .where(and_(
            BulkTestExecution.schedule_id.in_(schedule_ids),
            BulkTestExecution.status.in_(ACTIVE_STATUSES),
        ))
        .order_by(BulkTestExecution.started_at.desc())
    )).all()

    data = [
        {
            "id": exec_obj.id,
            "schedule_id": exec_obj.schedule_id,
            "schedule_name": schedule_name,
            "status": exec_obj.status,
            "started_at": exec_obj.started_at,
            "finished_at": exec_obj.finished_at,
            "total_cases": exec_obj.total_cases,
            "passed": exec_obj.passed,
            "failed": exec_obj.failed,
            "duration_ms": exec_obj.duration_ms,
            "error_message": exec_obj.error_message,
        }
        for exec_obj, schedule_name in rows
    ]
    return create_response(200, value_correction(data))


# ── schedule collection endpoints ──────────────────────────────────────────────

@router.post("", summary="Create a bulk test schedule")
async def create_schedule(
    body: ScheduleCreate,
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /schedules — create a bulk test schedule, validate file ownership, seed next_run, and return the saved schedule."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    file_ids: List[int] = []
    if body.payload.type == "api":
        file_ids = body.payload.apis
    else:
        file_ids = [a.file_id for a in body.payload.apis]

    if file_ids:
        allowed = await verify_schedule_nodes(db, file_ids, user_id)
        missing = [fid for fid in file_ids if fid not in allowed]
        if missing:
            return create_response(403, error_message=f"File(s) not found or access denied: {missing}")

    now = utcnow_naive()

    # Reject once schedules with a past date_time
    if body.type == "once":
        dt_utc = to_utc_naive(body.date_time, body.timezone)
        if dt_utc <= now:
            return create_response(400, error_message="date_time must be in the future for type=once")

    try:
        days = _canonicalize_days(body.days_of_week)
    except ValueError as exc:
        return create_response(400, error_message=str(exc))

    ic = body.interval_count if body.interval_count is not None else (20 if body.type == "minutely" else 1)

    sched = BulkTestSchedule(
        name=body.name,
        username=username,
        workspace_id=workspace_id,
        type=ScheduleType(body.type),
        date_time=to_utc_naive(body.date_time, body.timezone) if body.date_time else None,
        time=body.time,
        days_of_week=days,
        day_of_month=body.day_of_month,
        timezone=body.timezone,
        enabled=body.enabled,
        payload=body.payload.dict(),
        interval_count=ic,
    )
    sched.next_run = next_run_for(sched, after=now)

    db.add(sched)
    await db.commit()

    return create_response(201, value_correction(_sched_dict(sched)))


@router.get("", summary="Get bulk test schedules")
async def get_schedules(
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /schedules — return all schedules for the user's workspace ordered by creation date, each including execution count."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    rows = (await db.execute(
        select(BulkTestSchedule, func.count(BulkTestExecution.id).label("exec_count"))
        .outerjoin(BulkTestExecution, BulkTestExecution.schedule_id == BulkTestSchedule.id)
        .where(and_(
            BulkTestSchedule.username == username,
            BulkTestSchedule.workspace_id == workspace_id,
        ))
        .group_by(BulkTestSchedule.id)
        .order_by(BulkTestSchedule.created_at.desc())
    )).all()

    return create_response(200, value_correction([_sched_dict(sched, exec_count=count) for sched, count in rows]))


# ── schedule item endpoints ────────────────────────────────────────────────────

@router.get("/{schedule_id}", summary="Get a single bulk test schedule")
async def get_schedule(
    schedule_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /schedules/{schedule_id} — return schedule detail with execution count."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    row = (await db.execute(
        select(BulkTestSchedule, func.count(BulkTestExecution.id).label("exec_count"))
        .outerjoin(BulkTestExecution, BulkTestExecution.schedule_id == BulkTestSchedule.id)
        .where(and_(BulkTestSchedule.id == schedule_id, BulkTestSchedule.username == username))
        .group_by(BulkTestSchedule.id)
    )).first()

    if row is None:
        return create_response(404, error_message="Schedule not found or access denied")

    sched, count = row
    return create_response(200, value_correction(_sched_dict(sched, exec_count=count)))


@router.put("/{schedule_id}", summary="Update a bulk test schedule")
async def update_schedule(
    schedule_id: int,
    body: ScheduleCreate,
    username: str = Header(...),
    workspace_id: int = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /schedules/{schedule_id} — update schedule fields, re-validate file ownership, and recalculate next_run."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    schedule = (await db.execute(
        select(BulkTestSchedule)
        .where(and_(
            BulkTestSchedule.id == schedule_id,
            BulkTestSchedule.username == username,
            BulkTestSchedule.workspace_id == workspace_id,
        ))
    )).scalar_one_or_none()
    if schedule is None:
        return create_response(404, error_message="Schedule not found or access denied")

    file_ids: List[int] = []
    if body.payload.type == "api":
        file_ids = body.payload.apis
    else:
        file_ids = [a.file_id for a in body.payload.apis]

    if file_ids:
        allowed = await verify_schedule_nodes(db, file_ids, user_id)
        missing = [fid for fid in file_ids if fid not in allowed]
        if missing:
            return create_response(403, error_message=f"File(s) not found or access denied: {missing}")

    now = utcnow_naive()

    if body.type == "once":
        dt_utc = to_utc_naive(body.date_time, body.timezone)
        if dt_utc <= now:
            return create_response(400, error_message="date_time must be in the future for type=once")

    try:
        days = _canonicalize_days(body.days_of_week)
    except ValueError as exc:
        return create_response(400, error_message=str(exc))

    ic = body.interval_count if body.interval_count is not None else (20 if body.type == "minutely" else 1)

    schedule.name = body.name
    schedule.type = ScheduleType(body.type)
    schedule.date_time = to_utc_naive(body.date_time, body.timezone) if body.date_time else None
    schedule.time = body.time
    schedule.days_of_week = days
    schedule.day_of_month = body.day_of_month
    schedule.timezone = body.timezone
    schedule.enabled = body.enabled
    schedule.payload = body.payload.dict()
    schedule.interval_count = ic
    schedule.next_run = next_run_for(schedule, after=now)
    schedule.updated_at = now

    await db.commit()

    return create_response(200, value_correction(_sched_dict(schedule)))


@router.patch("/{schedule_id}/enable", summary="Enable or disable a bulk test schedule")
async def set_schedule_enabled(
    schedule_id: int,
    body: _EnableBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PATCH /schedules/{schedule_id}/enable — toggle enabled; recomputes next_run when re-enabling a stale schedule."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    schedule = (await db.execute(
        select(BulkTestSchedule)
        .where(and_(BulkTestSchedule.id == schedule_id, BulkTestSchedule.username == username))
    )).scalar_one_or_none()
    if schedule is None:
        return create_response(404, error_message="Schedule not found or access denied")

    now = utcnow_naive()
    schedule.enabled = body.enabled
    if body.enabled and (schedule.next_run is None or schedule.next_run <= now):
        # Re-enabling a paused/expired schedule — recompute so engine picks it up correctly
        schedule.next_run = next_run_for(schedule, after=now)
    schedule.updated_at = now

    await db.commit()

    return create_response(200, value_correction(_sched_dict(schedule)))


@router.post("/{schedule_id}/run-now", summary="Trigger an immediate bulk test run for a schedule")
async def run_schedule_now(
    schedule_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /schedules/{schedule_id}/run-now — fire run_execution_task immediately; returns 202 while task runs in background."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    owns = await db.scalar(
        select(BulkTestSchedule.id)
        .where(and_(BulkTestSchedule.id == schedule_id, BulkTestSchedule.username == username))
    )
    if owns is None:
        return create_response(404, error_message="Schedule not found or access denied")

    asyncio.create_task(run_execution_task(schedule_id))
    return create_response(202, message="Execution triggered")


@router.delete("/{schedule_id}", summary="Delete a bulk test schedule and all its executions/results")
async def delete_schedule(
    schedule_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /schedules/{schedule_id} — delete a schedule and all its cascaded executions and results."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    owns = await db.scalar(
        select(BulkTestSchedule.id)
        .where(and_(BulkTestSchedule.id == schedule_id, BulkTestSchedule.username == username))
    )
    if owns is None:
        return create_response(404, error_message="Schedule not found or access denied")

    # FK ondelete="CASCADE" on BulkTestExecution.schedule_id and BulkTestResult.execution_id
    await db.execute(delete(BulkTestSchedule).where(BulkTestSchedule.id == schedule_id))
    await db.commit()

    return create_response(200, message="Schedule and all related data deleted successfully")


# ── execution sub-resource endpoints ──────────────────────────────────────────

@router.get("/{schedule_id}/executions", summary="List bulk test executions for a schedule (paginated)")
async def list_schedule_executions(
    schedule_id: int,
    username: str = Header(...),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """GET /schedules/{schedule_id}/executions — paginated execution summaries (no per-case results; use detail endpoint for those)."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    owns = await db.scalar(
        select(BulkTestSchedule.id)
        .where(and_(BulkTestSchedule.id == schedule_id, BulkTestSchedule.username == username))
    )
    if owns is None:
        return create_response(404, error_message="Schedule not found or access denied")

    total: int = await db.scalar(
        select(func.count(BulkTestExecution.id))
        .where(BulkTestExecution.schedule_id == schedule_id)
    ) or 0

    executions = (await db.execute(
        select(BulkTestExecution)
        .where(BulkTestExecution.schedule_id == schedule_id)
        .order_by(BulkTestExecution.started_at.desc())
        .limit(limit)
        .offset(offset)
    )).scalars().all()

    data = [
        {
            "id": ex.id,
            "schedule_id": ex.schedule_id,
            "status": ex.status,
            "started_at": ex.started_at,
            "finished_at": ex.finished_at,
            "total_cases": ex.total_cases,
            "passed": ex.passed,
            "failed": ex.failed,
            "duration_ms": ex.duration_ms,
            "error_message": ex.error_message,
        }
        for ex in executions
    ]
    return create_response(200, value_correction(data), pagination={"page": offset // limit + 1, "rows": len(data), "total_rows": total})


@router.get("/{schedule_id}/executions/{execution_id}", summary="Get a single execution with per-case results")
async def get_execution_detail(
    schedule_id: int,
    execution_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /schedules/{schedule_id}/executions/{execution_id} — return full execution with all BulkTestResult records."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    owns = await db.scalar(
        select(BulkTestSchedule.id)
        .where(and_(BulkTestSchedule.id == schedule_id, BulkTestSchedule.username == username))
    )
    if owns is None:
        return create_response(404, error_message="Schedule not found or access denied")

    ex = (await db.execute(
        select(BulkTestExecution)
        .where(and_(
            BulkTestExecution.id == execution_id,
            BulkTestExecution.schedule_id == schedule_id,
        ))
        .options(selectinload(BulkTestExecution.results))
    )).scalar_one_or_none()

    if ex is None:
        return create_response(404, error_message="Execution not found")

    data = {
        "id": ex.id,
        "schedule_id": ex.schedule_id,
        "status": ex.status,
        "started_at": ex.started_at,
        "finished_at": ex.finished_at,
        "total_cases": ex.total_cases,
        "passed": ex.passed,
        "failed": ex.failed,
        "duration_ms": ex.duration_ms,
        "error_message": ex.error_message,
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
            for res in (ex.results or [])
        ],
    }
    return create_response(200, value_correction(data))


@router.delete("/{schedule_id}/executions/{execution_id}", summary="Delete a single bulk test execution and its results")
async def delete_schedule_execution(
    schedule_id: int,
    execution_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /schedules/{schedule_id}/executions/{execution_id} — delete an execution and its results; reject if still active."""
    user_id: Optional[int] = await db.scalar(select(User.id).where(User.username == username))
    if user_id is None:
        return create_response(400, error_message="User not found")

    owns = await db.scalar(
        select(BulkTestSchedule.id)
        .where(and_(BulkTestSchedule.id == schedule_id, BulkTestSchedule.username == username))
    )
    if owns is None:
        return create_response(404, error_message="Schedule not found or access denied")

    exec_obj = (await db.execute(
        select(BulkTestExecution)
        .where(and_(
            BulkTestExecution.id == execution_id,
            BulkTestExecution.schedule_id == schedule_id,
        ))
    )).scalar_one_or_none()
    if exec_obj is None:
        return create_response(404, error_message="Execution not found")

    if exec_obj.status in ACTIVE_STATUSES:
        return create_response(400, error_message="Cannot delete an execution that is still active")

    # FK ondelete="CASCADE" on BulkTestResult.execution_id cascades results automatically
    await db.execute(delete(BulkTestExecution).where(BulkTestExecution.id == execution_id))
    await db.commit()

    return create_response(200, message="Execution and related results deleted successfully")
