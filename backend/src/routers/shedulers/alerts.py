"""
What this file does: Exposes CRUD endpoints under /schedules/{schedule_id}/alerts for managing notification alerts attached to bulk test schedules.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import BulkTestSchedule, ScheduleAlert
from schema import AlertCreate, AlertResponse, AlertUpdate
from utils import create_response

router = APIRouter(prefix="/schedules", tags=["Schedule Alerts"])


async def _assert_schedule_owner(
    schedule_id: int,
    username: str,
    db: AsyncSession,
) -> BulkTestSchedule:
    """What it does: Fetch the schedule by ID and raise 404/403 if it is missing or belongs to a different user."""
    schedule = await db.get(BulkTestSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if schedule.username != username:
        raise HTTPException(status_code=403, detail="Not your schedule")
    return schedule


@router.post("/{schedule_id}/alerts", response_model=None)
async def create_alert(
    schedule_id: int,
    body: AlertCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /schedules/{schedule_id}/alerts — create a notification alert for the schedule."""
    await _assert_schedule_owner(schedule_id, username, db)
    alert = ScheduleAlert(
        schedule_id=schedule_id,
        type=body.type,
        target=body.target,
        on_failure=body.on_failure,
        on_success=body.on_success,
        on_partial=body.on_partial,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return create_response(data=AlertResponse.model_validate(alert).model_dump())


@router.get("/{schedule_id}/alerts", response_model=None)
async def list_alerts(
    schedule_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /schedules/{schedule_id}/alerts — return all alerts configured for the schedule."""
    await _assert_schedule_owner(schedule_id, username, db)
    alerts = (
        await db.execute(
            select(ScheduleAlert).where(ScheduleAlert.schedule_id == schedule_id)
        )
    ).scalars().all()
    return create_response(data=[AlertResponse.model_validate(a).model_dump() for a in alerts])


@router.put("/{schedule_id}/alerts/{alert_id}", response_model=None)
async def update_alert(
    schedule_id: int,
    alert_id: int,
    body: AlertUpdate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /schedules/{schedule_id}/alerts/{alert_id} — update the trigger flags or target of an existing alert."""
    await _assert_schedule_owner(schedule_id, username, db)
    alert = await db.get(ScheduleAlert, alert_id)
    if not alert or alert.schedule_id != schedule_id:
        raise HTTPException(status_code=404, detail="Alert not found")

    for field, val in body.model_dump(exclude_none=True).items():
        setattr(alert, field, val)

    await db.commit()
    await db.refresh(alert)
    return create_response(data=AlertResponse.model_validate(alert).model_dump())


@router.delete("/{schedule_id}/alerts/{alert_id}", response_model=None)
async def delete_alert(
    schedule_id: int,
    alert_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /schedules/{schedule_id}/alerts/{alert_id} — delete an alert by ID."""
    await _assert_schedule_owner(schedule_id, username, db)
    alert = await db.get(ScheduleAlert, alert_id)
    if not alert or alert.schedule_id != schedule_id:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.delete(alert)
    await db.commit()
    return create_response(data={"deleted": alert_id})
