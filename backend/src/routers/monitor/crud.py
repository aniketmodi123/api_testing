"""
What this file does: Provides CRUD endpoints for monitors — named rollup views over bulk test schedules showing uptime %, p95 latency, and last run status.
"""

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username, write_audit
from config import get_db
from models import BulkTestExecution, BulkTestSchedule, Monitor, Workspace
from utils import ExceptionHandler, create_response

router = APIRouter()

_WINDOW_DAYS = 30
_COMPLETED_STATUSES = ("success", "partial", "failed")


async def _compute_rollup(db: AsyncSession, schedule_id: int) -> dict:
    """What it does: Compute uptime_pct, p95_latency_ms, and last_status from the last 30 days of completed executions."""
    cutoff = datetime.now() - timedelta(days=_WINDOW_DAYS)
    rows = (
        await db.execute(
            select(BulkTestExecution)
            .where(
                BulkTestExecution.schedule_id == schedule_id,
                BulkTestExecution.finished_at >= cutoff,
                BulkTestExecution.status.in_(list(_COMPLETED_STATUSES)),
            )
            .order_by(BulkTestExecution.finished_at.desc())
        )
    ).scalars().all()

    if not rows:
        return {"uptime_pct": None, "p95_latency_ms": None, "last_status": None}

    non_failed = sum(1 for r in rows if r.status != "failed")
    uptime_pct = round(non_failed / len(rows) * 100, 2)

    durations = sorted(r.duration_ms for r in rows)
    p95_idx = int(len(durations) * 0.95)
    p95_latency_ms = durations[min(p95_idx, len(durations) - 1)]

    last_status = rows[0].status

    return {
        "uptime_pct": uptime_pct,
        "p95_latency_ms": p95_latency_ms,
        "last_status": last_status,
    }


async def refresh_monitor_rollup(db: AsyncSession, schedule_id: int) -> None:
    """What it does: Recompute and persist the rollup fields on the Monitor row for the given schedule, if a monitor exists."""
    monitor = (
        await db.execute(select(Monitor).where(Monitor.schedule_id == schedule_id))
    ).scalar_one_or_none()
    if not monitor:
        return

    rollup = await _compute_rollup(db, schedule_id)
    monitor.uptime_pct = rollup["uptime_pct"]
    monitor.p95_latency_ms = rollup["p95_latency_ms"]
    monitor.last_status = rollup["last_status"]
    await db.flush()


@router.post("/workspace/{workspace_id}/monitor")
async def create_monitor(
    workspace_id: int,
    name: str,
    schedule_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /workspace/{workspace_id}/monitor — create a monitor wrapping an existing bulk test schedule.

    Notes:
        - Each schedule can have at most one monitor (enforced by unique constraint on schedule_id).
        - The schedule must belong to the same workspace as the monitor.
    """
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        access = await can_access_workspace(db, workspace_id, user.id, min_role="editor")
        if not access:
            return create_response(403, error_message="Editor access required")

        schedule = (
            await db.execute(
                select(BulkTestSchedule).where(
                    BulkTestSchedule.id == schedule_id,
                    BulkTestSchedule.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if not schedule:
            return create_response(206, error_message="Schedule not found in this workspace")

        existing = (
            await db.execute(select(Monitor).where(Monitor.schedule_id == schedule_id))
        ).scalar_one_or_none()
        if existing:
            return create_response(409, error_message="A monitor already exists for this schedule")

        monitor = Monitor(workspace_id=workspace_id, schedule_id=schedule_id, name=name)
        db.add(monitor)
        await db.flush()

        rollup = await _compute_rollup(db, schedule_id)
        monitor.uptime_pct = rollup["uptime_pct"]
        monitor.p95_latency_ms = rollup["p95_latency_ms"]
        monitor.last_status = rollup["last_status"]

        await write_audit(db, username, "monitor.create", "monitor", monitor.id, workspace_id=workspace_id)
        await db.commit()
        await db.refresh(monitor)

        return create_response(201, data=_monitor_dict(monitor))
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.get("/workspace/{workspace_id}/monitors")
async def list_monitors(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /workspace/{workspace_id}/monitors — list all monitors for the workspace with current uptime and p95."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        access = await can_access_workspace(db, workspace_id, user.id, min_role="viewer")
        if not access:
            return create_response(403, error_message="Access denied")

        monitors = (
            await db.execute(
                select(Monitor).where(Monitor.workspace_id == workspace_id)
            )
        ).scalars().all()

        return create_response(200, data=[_monitor_dict(m) for m in monitors])
    except Exception as e:
        return ExceptionHandler(e)


@router.get("/monitor/{monitor_id}")
async def get_monitor(
    monitor_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /monitor/{monitor_id} — return monitor detail with p95/uptime rollup and the last 50 completed executions as a latency series."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        monitor = (
            await db.execute(select(Monitor).where(Monitor.id == monitor_id))
        ).scalar_one_or_none()
        if not monitor:
            return create_response(206, error_message="Monitor not found")

        access = await can_access_workspace(db, monitor.workspace_id, user.id, min_role="viewer")
        if not access:
            return create_response(403, error_message="Access denied")

        executions = (
            await db.execute(
                select(BulkTestExecution)
                .where(
                    BulkTestExecution.schedule_id == monitor.schedule_id,
                    BulkTestExecution.status.in_(list(_COMPLETED_STATUSES)),
                )
                .order_by(BulkTestExecution.finished_at.desc())
                .limit(50)
            )
        ).scalars().all()

        series = [
            {
                "execution_id": e.id,
                "started_at": str(e.started_at) if e.started_at else None,
                "finished_at": str(e.finished_at) if e.finished_at else None,
                "status": e.status,
                "duration_ms": e.duration_ms,
                "total_cases": e.total_cases,
                "passed": e.passed,
                "failed": e.failed,
            }
            for e in executions
        ]

        return create_response(200, data={**_monitor_dict(monitor), "latency_series": series})
    except Exception as e:
        return ExceptionHandler(e)


@router.put("/monitor/{monitor_id}")
async def update_monitor(
    monitor_id: int,
    name: Optional[str] = None,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /monitor/{monitor_id} — update the monitor display name."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        monitor = (
            await db.execute(select(Monitor).where(Monitor.id == monitor_id))
        ).scalar_one_or_none()
        if not monitor:
            return create_response(206, error_message="Monitor not found")

        access = await can_access_workspace(db, monitor.workspace_id, user.id, min_role="editor")
        if not access:
            return create_response(403, error_message="Editor access required")

        if name is not None:
            monitor.name = name

        await write_audit(db, username, "monitor.update", "monitor", monitor_id, workspace_id=monitor.workspace_id)
        await db.commit()
        await db.refresh(monitor)

        return create_response(200, data=_monitor_dict(monitor))
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.delete("/monitor/{monitor_id}")
async def delete_monitor(
    monitor_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /monitor/{monitor_id} — delete the monitor row (does not delete the underlying schedule)."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        monitor = (
            await db.execute(select(Monitor).where(Monitor.id == monitor_id))
        ).scalar_one_or_none()
        if not monitor:
            return create_response(206, error_message="Monitor not found")

        access = await can_access_workspace(db, monitor.workspace_id, user.id, min_role="admin")
        if not access:
            return create_response(403, error_message="Admin access required")

        workspace_id = monitor.workspace_id
        await db.delete(monitor)
        await write_audit(db, username, "monitor.delete", "monitor", monitor_id, workspace_id=workspace_id)
        await db.commit()

        return create_response(200, message="Monitor deleted")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


def _monitor_dict(m: Monitor) -> dict:
    """What it does: Serialize a Monitor ORM row to a plain dict for API responses."""
    return {
        "id": m.id,
        "workspace_id": m.workspace_id,
        "schedule_id": m.schedule_id,
        "name": m.name,
        "uptime_pct": float(m.uptime_pct) if m.uptime_pct is not None else None,
        "p95_latency_ms": m.p95_latency_ms,
        "last_status": m.last_status,
        "updated_at": str(m.updated_at) if m.updated_at else None,
    }
