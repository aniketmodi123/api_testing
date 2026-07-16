"""
What this file does: Single source of truth for schedule trigger-time computation.
Pure functions — no DB, no I/O. Imported by both the CRUD router and the engine.
Replaces the two divergent _seed_first_next_run copies and the engine's compute_next_run.
"""
from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Optional
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from models import BulkTestSchedule

__all__ = ["utcnow_naive", "to_utc_naive", "compute_next_run", "next_run_for"]

_UTC: ZoneInfo = ZoneInfo("UTC")


def utcnow_naive() -> datetime:
    """Return current UTC time as a naive datetime (tzinfo stripped)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_utc_naive(dt: datetime, tz_name: Optional[str]) -> datetime:
    """Convert *dt* to naive UTC.

    Aware dt  → astimezone(UTC), strip tzinfo.
    Naive dt  → interpret as wall-clock time in *tz_name* (default UTC), convert, strip.
    """
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    tz: ZoneInfo = ZoneInfo(tz_name) if tz_name else _UTC
    return dt.replace(tzinfo=tz).astimezone(timezone.utc).replace(tzinfo=None)


def _parse_hhmm(value: Optional[str]) -> tuple[int, int]:
    """Parse "HH:MM" string; raises ValueError on malformed input.

    Bad legacy rows let this propagate — the engine catches per-schedule and quarantines.
    """
    if not value or ":" not in value:
        raise ValueError(f"time must be HH:MM, got {value!r}")
    h_str, m_str = value.split(":", 1)
    if not (h_str.isdigit() and m_str.isdigit()):
        raise ValueError(f"time must be HH:MM with numeric parts, got {value!r}")
    hh, mm = int(h_str), int(m_str)
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        raise ValueError(f"time {value!r} is not a valid clock time")
    return hh, mm


def _local_to_utc_naive(local_naive: datetime, tz: ZoneInfo) -> datetime:
    """Convert naive local datetime to naive UTC using fold=0 semantics.

    Fall-back (ambiguous): fold=0 = first occurrence (pre-transition offset). Plan §3.
    Spring-forward (gap): fold=0 = pre-transition offset — fires at local_naive interpreted
    in the old timezone, which lands after the gap ends. This is equivalent to the Quartz
    COALESCE behavior: the wall time is honoured in the zone it was defined in.
    """
    return local_naive.replace(tzinfo=tz, fold=0).astimezone(timezone.utc).replace(tzinfo=None)


def compute_next_run(
    *,
    schedule_type: str,
    after: datetime,
    tz_name: Optional[str],
    interval_count: int = 1,
    anchor: Optional[datetime] = None,
    date_time: Optional[datetime] = None,
    time_hhmm: Optional[str] = None,
    days_of_week: Optional[list[str]] = None,
    day_of_month: Optional[int] = None,
) -> Optional[datetime]:
    """Compute the next trigger instant strictly after *after* (naive UTC).

    Args:
        schedule_type: ``"once"``|``"minutely"``|``"hourly"``|``"daily"``|``"weekly"``|``"monthly"``
        after:         naive UTC; result will be strictly > this value
        tz_name:       IANA timezone name or None (treated as UTC)
        interval_count: repetition interval — N minutes / hours / days / weeks / months
        anchor:        naive UTC cadence origin (start_from or created_at); defaults to utcnow_naive()
        date_time:     naive UTC; the exact fire time for ``"once"``
        time_hhmm:     ``"HH:MM"`` wall-clock time for hourly / daily / weekly / monthly
        days_of_week:  canonical full lowercase weekday names for ``"weekly"``
        day_of_month:  1–31 for ``"monthly"``

    Returns:
        naive UTC datetime strictly > *after*, or None when the schedule will never fire again.

    Raises:
        ValueError: when *time_hhmm* is malformed (engine caller should catch and quarantine the row)
    """
    st = (schedule_type or "").lower()
    _anchor = anchor if anchor is not None else utcnow_naive()
    tz: ZoneInfo = ZoneInfo(tz_name) if tz_name else _UTC

    # ── once ──────────────────────────────────────────────────────────────────
    if st == "once":
        if date_time is not None and date_time > after:
            return date_time
        return None

    # ── minutely ──────────────────────────────────────────────────────────────
    if st == "minutely":
        step = timedelta(minutes=max(20, interval_count))
        step_sec = step.total_seconds()
        diff_sec = (after - _anchor).total_seconds()
        k = int(diff_sec // step_sec) + 1 if diff_sec >= 0 else 1
        result = (_anchor + step * k).replace(second=0, microsecond=0)
        # Guard: zeroing seconds may push result back to <= after
        while result <= after:
            k += 1
            result = (_anchor + step * k).replace(second=0, microsecond=0)
        return result

    # ── hourly ────────────────────────────────────────────────────────────────
    if st == "hourly":
        step_hours = max(1, interval_count)
        _, mm = _parse_hhmm(time_hhmm)  # hour component is intentionally ignored (per spec)
        anchor_aware = _anchor.replace(tzinfo=timezone.utc).astimezone(tz)
        anchor_snapped = anchor_aware.replace(minute=mm, second=0, microsecond=0)
        after_aware = after.replace(tzinfo=timezone.utc)
        diff_sec = (after_aware - anchor_snapped).total_seconds()
        step_sec = step_hours * 3600
        k = int(diff_sec // step_sec) + 1 if diff_sec >= 0 else 1
        candidate = anchor_snapped + timedelta(hours=step_hours * k)
        utc_cand = candidate.astimezone(timezone.utc).replace(tzinfo=None)
        # Guard against DST boundary nudging candidate to <= after
        while utc_cand <= after:
            k += 1
            candidate = anchor_snapped + timedelta(hours=step_hours * k)
            utc_cand = candidate.astimezone(timezone.utc).replace(tzinfo=None)
        return utc_cand

    # ── daily ─────────────────────────────────────────────────────────────────
    if st == "daily":
        step_days = max(1, interval_count)
        hh, mm = _parse_hhmm(time_hhmm)
        anchor_local = _anchor.replace(tzinfo=timezone.utc).astimezone(tz)
        anchor_date = anchor_local.date()
        after_local = after.replace(tzinfo=timezone.utc).astimezone(tz)
        after_date = after_local.date()
        days_since = max(0, (after_date - anchor_date).days)
        k_floor = (days_since // step_days) * step_days
        # Try the cadence day that contains after, then the next cadence day
        for delta in (k_floor, k_floor + step_days):
            cand_date = anchor_date + timedelta(days=delta)
            utc_cand = _local_to_utc_naive(
                datetime(cand_date.year, cand_date.month, cand_date.day, hh, mm, 0), tz
            )
            if utc_cand > after:
                return utc_cand
        return None  # unreachable in practice; satisfies mypy

    # ── weekly ────────────────────────────────────────────────────────────────
    if st == "weekly":
        step_weeks = max(1, interval_count)
        if not days_of_week:
            return None
        hh, mm = _parse_hhmm(time_hhmm)
        anchor_local = _anchor.replace(tzinfo=timezone.utc).astimezone(tz)
        anchor_week_monday = anchor_local.date() - timedelta(days=anchor_local.weekday())
        after_local = after.replace(tzinfo=timezone.utc).astimezone(tz)
        after_date = after_local.date()
        # Scan 2 full cadence windows + 1 extra week to guarantee a hit
        scan_limit = 7 * step_weeks * 2 + 7
        for offset in range(scan_limit):
            d = after_date + timedelta(days=offset)
            if d.strftime("%A").lower() not in days_of_week:
                continue
            weeks_since = (d - anchor_week_monday).days // 7
            if weeks_since % step_weeks != 0:
                continue
            utc_cand = _local_to_utc_naive(
                datetime(d.year, d.month, d.day, hh, mm, 0), tz
            )
            if utc_cand > after:
                return utc_cand
        return None

    # ── monthly ───────────────────────────────────────────────────────────────
    if st == "monthly":
        step_months = max(1, interval_count)
        if not day_of_month:
            return None
        hh, mm = _parse_hhmm(time_hhmm)
        anchor_local = _anchor.replace(tzinfo=timezone.utc).astimezone(tz)
        # Absolute month index: year*12 + (month-1)
        anchor_abs = anchor_local.year * 12 + (anchor_local.month - 1)
        after_local = after.replace(tzinfo=timezone.utc).astimezone(tz)
        after_abs = after_local.year * 12 + (after_local.month - 1)
        months_since = max(0, after_abs - anchor_abs)
        k = (months_since // step_months) * step_months
        # Try the cadence month containing after, then the next
        for delta in (k, k + step_months):
            abs_month = anchor_abs + delta
            year = abs_month // 12
            month = abs_month % 12 + 1
            day = min(day_of_month, calendar.monthrange(year, month)[1])
            utc_cand = _local_to_utc_naive(datetime(year, month, day, hh, mm, 0), tz)
            if utc_cand > after:
                return utc_cand
        return None

    return None


def next_run_for(schedule: BulkTestSchedule, after: datetime) -> Optional[datetime]:
    """Thin ORM adapter: unpack BulkTestSchedule row and call compute_next_run.

    Uses start_from as cadence anchor when set, falls back to created_at (fixes B12).
    """
    stype = schedule.type.value if hasattr(schedule.type, "value") else str(schedule.type)
    anchor: Optional[datetime] = getattr(schedule, "start_from", None) or getattr(schedule, "created_at", None)
    return compute_next_run(
        schedule_type=stype,
        after=after,
        tz_name=getattr(schedule, "timezone", None),
        interval_count=int(schedule.interval_count or 1),
        anchor=anchor,
        date_time=schedule.date_time,
        time_hhmm=schedule.time,
        days_of_week=schedule.days_of_week,
        day_of_month=schedule.day_of_month,
    )
