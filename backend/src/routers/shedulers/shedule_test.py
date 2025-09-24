# routers/scheduler/create.py
from __future__ import annotations

from datetime import datetime, timedelta
from calendar import day_name
from typing import List, Optional

from fastapi import APIRouter, Depends, Header

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import get_user_by_username
from models import BulkTestSchedule, Node, Workspace
from schema import ScheduleCreate
from utils import create_response, value_correction

router = APIRouter(prefix="/schedules", tags=["schedules"])

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
        return s.date_time

    if t == "minutes":
        n = max(20, int(getattr(s, "interval_count", 20) or 20))  # enforce min 20
        base = now.replace(second=0, microsecond=0)
        minute = (base.minute // n + 1) * n
        delta = minute - base.minute
        return base + timedelta(minutes=delta)

    if t == "hourly":
        n = max(1, int(getattr(s, "interval_count", 1) or 1))
        hh, mm = _parse_hhmm(s.time)
        candidate = now.replace(minute=mm, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(hours=1)
        # we keep exact minute; step alignment happens in compute_next_run
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
        date_time=body.date_time,
        time=body.time,
        days_of_week=body.days_of_week,
        day_of_month=body.day_of_month,
        enabled=body.enabled,
        payload=body.payload.dict(),  # store original request
    )

    # interval_count lives on the model (make sure the column exists)
    ic = body.interval_count if body.interval_count is not None else (
        20 if body.type == "minutes" else 1  # sensible defaults
    )
    setattr(sched, "interval_count", ic)

    # 4) Seed next_run
    now = datetime.now()
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
