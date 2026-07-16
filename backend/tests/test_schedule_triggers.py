"""
What this file does: Table-driven unit tests for schedule_triggers.compute_next_run.
All tests use frozen 'after' values — no real-time dependency.
Covers §9.1 of the scheduler rebuild plan.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import pytest

# Make src importable without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from schedule_triggers import compute_next_run, to_utc_naive, utcnow_naive


# ── helpers ──────────────────────────────────────────────────────────────────

def utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0, second: int = 0) -> datetime:
    """Build a naive UTC datetime for use as after/anchor/expected values."""
    return datetime(year, month, day, hour, minute, second)


# ── minutely ─────────────────────────────────────────────────────────────────

class TestMinutely:
    def test_basic_interval_20_after_25min(self):
        anchor = utc(2024, 1, 1, 10, 0)
        after  = utc(2024, 1, 1, 10, 25)
        result = compute_next_run(
            schedule_type="minutely", after=after, tz_name=None,
            interval_count=20, anchor=anchor,
        )
        assert result == utc(2024, 1, 1, 10, 40)

    def test_interval_clamped_to_20(self):
        anchor = utc(2024, 1, 1, 10, 0)
        after  = utc(2024, 1, 1, 10, 5)
        result = compute_next_run(
            schedule_type="minutely", after=after, tz_name=None,
            interval_count=5, anchor=anchor,  # 5 < 20; must clamp
        )
        # Clamped to 20-min step: next is 10:20
        assert result == utc(2024, 1, 1, 10, 20)

    def test_after_exactly_on_boundary(self):
        anchor = utc(2024, 1, 1, 10, 0)
        after  = utc(2024, 1, 1, 10, 20)   # exactly on the 20-min mark
        result = compute_next_run(
            schedule_type="minutely", after=after, tz_name=None,
            interval_count=20, anchor=anchor,
        )
        assert result == utc(2024, 1, 1, 10, 40)

    def test_downtime_catch_up(self):
        # after is 6 hours past anchor — should produce single value strictly > after
        anchor = utc(2024, 1, 1,  8, 0)
        after  = utc(2024, 1, 1, 14, 7)
        result = compute_next_run(
            schedule_type="minutely", after=after, tz_name=None,
            interval_count=20, anchor=anchor,
        )
        assert result is not None
        assert result > after
        # Must be on a 20-min boundary relative to anchor
        diff_min = (result - anchor).total_seconds() / 60
        assert diff_min % 20 == 0


# ── hourly ────────────────────────────────────────────────────────────────────

class TestHourly:
    def test_every_2h_at_15_after_09(self):
        anchor = utc(2024, 1, 1, 8, 15)   # snapped to :15
        after  = utc(2024, 1, 1, 9,  0)
        result = compute_next_run(
            schedule_type="hourly", after=after, tz_name=None,
            interval_count=2, anchor=anchor, time_hhmm="08:15",
        )
        assert result == utc(2024, 1, 1, 10, 15)

    def test_interval_1h(self):
        anchor = utc(2024, 1, 1, 6, 30)
        after  = utc(2024, 1, 1, 7, 29)
        result = compute_next_run(
            schedule_type="hourly", after=after, tz_name=None,
            interval_count=1, anchor=anchor, time_hhmm="06:30",
        )
        assert result == utc(2024, 1, 1, 7, 30)

    def test_hour_component_of_time_ignored(self):
        # time_hhmm="14:45" — only :45 used, hour 14 ignored
        anchor = utc(2024, 1, 1, 0, 45)
        after  = utc(2024, 1, 1, 1, 44)
        result = compute_next_run(
            schedule_type="hourly", after=after, tz_name=None,
            interval_count=1, anchor=anchor, time_hhmm="14:45",
        )
        assert result == utc(2024, 1, 1, 1, 45)


# ── daily ─────────────────────────────────────────────────────────────────────

class TestDaily:
    def test_kolkata_before_fire_time(self):
        # 14:30 IST = 09:00 UTC; after = 08:45 UTC (= 14:15 IST) → same day
        anchor = utc(2024, 1, 1, 0, 0)
        after  = utc(2024, 1, 1, 8, 45)
        result = compute_next_run(
            schedule_type="daily", after=after, tz_name="Asia/Kolkata",
            interval_count=1, anchor=anchor, time_hhmm="14:30",
        )
        assert result == utc(2024, 1, 1, 9, 0)

    def test_kolkata_after_fire_time(self):
        # after = 09:30 UTC (= 15:00 IST) → fire tomorrow at 09:00 UTC
        anchor = utc(2024, 1, 1, 0, 0)
        after  = utc(2024, 1, 1, 9, 30)
        result = compute_next_run(
            schedule_type="daily", after=after, tz_name="Asia/Kolkata",
            interval_count=1, anchor=anchor, time_hhmm="14:30",
        )
        assert result == utc(2024, 1, 2, 9, 0)

    def test_every_3_days(self):
        anchor = utc(2024, 1, 1, 0, 0)
        after  = utc(2024, 1, 4, 12, 0)   # after first cadence day (Jan 4 at 00:00)
        result = compute_next_run(
            schedule_type="daily", after=after, tz_name=None,
            interval_count=3, anchor=anchor, time_hhmm="08:00",
        )
        # Cadence days: Jan 1, Jan 4, Jan 7 …; Jan 4 08:00 < 12:00, so Jan 7 08:00
        assert result == utc(2024, 1, 7, 8, 0)


# ── weekly ────────────────────────────────────────────────────────────────────

class TestWeekly:
    def test_mon_thu_after_tuesday(self):
        # after falls on a Tuesday → next match is Thursday
        anchor = utc(2024, 1, 1, 0, 0)   # 2024-01-01 is a Monday
        after  = utc(2024, 1, 2, 10, 0)  # Tuesday
        result = compute_next_run(
            schedule_type="weekly", after=after, tz_name=None,
            interval_count=1, anchor=anchor,
            time_hhmm="09:00", days_of_week=["monday", "thursday"],
        )
        assert result == utc(2024, 1, 4, 9, 0)  # Thursday 09:00

    def test_biweekly_skips_next_week(self):
        # interval=2; anchor week W (Jan 1–7, 2024); after in week W+1 → first match in W+2
        anchor = utc(2024, 1, 1, 0, 0)  # Monday of week W
        after  = utc(2024, 1, 9, 0, 0)  # Tuesday of week W+1
        result = compute_next_run(
            schedule_type="weekly", after=after, tz_name=None,
            interval_count=2, anchor=anchor,
            time_hhmm="09:00", days_of_week=["monday"],
        )
        # Week W+2 Monday = Jan 15
        assert result == utc(2024, 1, 15, 9, 0)

    def test_no_days_of_week_returns_none(self):
        result = compute_next_run(
            schedule_type="weekly", after=utc(2024, 1, 1), tz_name=None,
            interval_count=1, anchor=utc(2024, 1, 1),
            time_hhmm="09:00", days_of_week=[],
        )
        assert result is None


# ── monthly ───────────────────────────────────────────────────────────────────

class TestMonthly:
    def test_day_31_in_february_clamped(self):
        # day_of_month=31 in Feb → should clamp to 28 (non-leap 2024... wait 2024 IS leap)
        # Use 2025 (non-leap)
        anchor = utc(2025, 1, 1, 0, 0)
        after  = utc(2025, 1, 31, 12, 0)
        result = compute_next_run(
            schedule_type="monthly", after=after, tz_name=None,
            interval_count=1, anchor=anchor,
            time_hhmm="10:00", day_of_month=31,
        )
        # Feb 2025 has 28 days → clamped to Feb 28
        assert result == utc(2025, 2, 28, 10, 0)

    def test_day_31_in_february_leap_clamped_to_29(self):
        anchor = utc(2024, 1, 1, 0, 0)
        after  = utc(2024, 1, 31, 12, 0)
        result = compute_next_run(
            schedule_type="monthly", after=after, tz_name=None,
            interval_count=1, anchor=anchor,
            time_hhmm="10:00", day_of_month=31,
        )
        # Feb 2024 is a leap year → clamped to Feb 29
        assert result == utc(2024, 2, 29, 10, 0)

    def test_interval_3_from_january(self):
        # every 3 months from Jan → Apr, Jul, Oct
        anchor = utc(2024, 1, 15, 0, 0)
        after  = utc(2024, 1, 16, 0, 0)
        result = compute_next_run(
            schedule_type="monthly", after=after, tz_name=None,
            interval_count=3, anchor=anchor,
            time_hhmm="09:00", day_of_month=15,
        )
        assert result == utc(2024, 4, 15, 9, 0)

    def test_interval_3_second_hit(self):
        anchor = utc(2024, 1, 15, 0, 0)
        after  = utc(2024, 4, 15, 9, 0)   # exactly at April boundary
        result = compute_next_run(
            schedule_type="monthly", after=after, tz_name=None,
            interval_count=3, anchor=anchor,
            time_hhmm="09:00", day_of_month=15,
        )
        assert result == utc(2024, 7, 15, 9, 0)

    def test_april_30_clamps_correctly(self):
        # day_of_month=31, month=April → 30 days → clamped to 30
        anchor = utc(2024, 3, 1, 0, 0)
        after  = utc(2024, 3, 31, 12, 0)
        result = compute_next_run(
            schedule_type="monthly", after=after, tz_name=None,
            interval_count=1, anchor=anchor,
            time_hhmm="08:00", day_of_month=31,
        )
        assert result == utc(2024, 4, 30, 8, 0)


# ── once ──────────────────────────────────────────────────────────────────────

class TestOnce:
    def test_future_date_time_returned(self):
        future = utc(2024, 6, 1, 12, 0)
        result = compute_next_run(
            schedule_type="once", after=utc(2024, 1, 1), tz_name=None,
            date_time=future,
        )
        assert result == future

    def test_past_date_time_returns_none(self):
        past = utc(2024, 1, 1, 8, 0)
        result = compute_next_run(
            schedule_type="once", after=utc(2024, 6, 1), tz_name=None,
            date_time=past,
        )
        assert result is None

    def test_none_date_time_returns_none(self):
        result = compute_next_run(
            schedule_type="once", after=utc(2024, 1, 1), tz_name=None,
            date_time=None,
        )
        assert result is None


# ── DST ───────────────────────────────────────────────────────────────────────

class TestDST:
    def test_spring_forward_berlin_daily_230(self):
        # Berlin spring-forward 2024: clocks skip from 02:00→03:00 on Mar 31 (01:00 UTC).
        # 02:30 CET doesn't exist. fold=0 (pre-transition, CET=UTC+1): 02:30-01:00 = 01:30 UTC.
        # This lands at 03:30 CEST — valid, after the gap. Quartz-style: honour the old-TZ wall time.
        anchor = utc(2024, 3, 30, 0, 0)
        after  = utc(2024, 3, 30, 23, 0)  # just before Mar 31 in UTC
        result = compute_next_run(
            schedule_type="daily", after=after, tz_name="Europe/Berlin",
            interval_count=1, anchor=anchor, time_hhmm="02:30",
        )
        assert result is not None
        assert result > after
        # fold=0 (CET = UTC+1): 02:30 CET = 01:30 UTC = 03:30 CEST (valid, post-gap)
        assert result == utc(2024, 3, 31, 1, 30)

    def test_fall_back_berlin_daily_230(self):
        # Berlin fall-back 2024: clocks repeat 02:00→03:00 on Oct 27
        # A daily 02:30 schedule should use the first occurrence (CET, UTC+1) = 01:30 UTC
        anchor = utc(2024, 10, 26, 0, 0)
        after  = utc(2024, 10, 26, 23, 0)
        result = compute_next_run(
            schedule_type="daily", after=after, tz_name="Europe/Berlin",
            interval_count=1, anchor=anchor, time_hhmm="02:30",
        )
        assert result is not None
        assert result > after
        # First occurrence of 02:30 on Oct 27 = CEST (UTC+2) → 00:30 UTC
        # Second occurrence = CET (UTC+1) → 01:30 UTC
        # fold=0 → first occurrence → 00:30 UTC
        assert result == utc(2024, 10, 27, 0, 30)


# ── error handling ────────────────────────────────────────────────────────────

class TestErrors:
    def test_malformed_time_no_colon_raises(self):
        with pytest.raises(ValueError, match="HH:MM"):
            compute_next_run(
                schedule_type="daily", after=utc(2024, 1, 1), tz_name=None,
                interval_count=1, anchor=utc(2024, 1, 1), time_hhmm="9am",
            )

    def test_malformed_time_none_raises(self):
        with pytest.raises((ValueError, TypeError)):
            compute_next_run(
                schedule_type="daily", after=utc(2024, 1, 1), tz_name=None,
                interval_count=1, anchor=utc(2024, 1, 1), time_hhmm=None,
            )

    def test_unknown_schedule_type_returns_none(self):
        result = compute_next_run(
            schedule_type="quarterly", after=utc(2024, 1, 1), tz_name=None,
        )
        assert result is None

    def test_weekly_empty_days_returns_none(self):
        result = compute_next_run(
            schedule_type="weekly", after=utc(2024, 1, 1), tz_name=None,
            interval_count=1, anchor=utc(2024, 1, 1),
            time_hhmm="09:00", days_of_week=None,
        )
        assert result is None


# ── downtime / coalesce ───────────────────────────────────────────────────────

class TestCoalesce:
    def test_minutely_far_past_anchor(self):
        # after is 3 days past anchor — result is single step > after, not all missed steps
        anchor = utc(2024, 1, 1, 0, 0)
        after  = utc(2024, 1, 4, 7, 37)
        result = compute_next_run(
            schedule_type="minutely", after=after, tz_name=None,
            interval_count=20, anchor=anchor,
        )
        assert result is not None
        assert result > after
        # Only ONE result (coalesced) — not hours of backfill
        next_after = compute_next_run(
            schedule_type="minutely", after=result, tz_name=None,
            interval_count=20, anchor=anchor,
        )
        assert next_after is not None
        assert (next_after - result).total_seconds() == 20 * 60

    def test_daily_far_past_anchor(self):
        anchor = utc(2024, 1, 1, 0, 0)
        after  = utc(2024, 6, 15, 10, 0)
        result = compute_next_run(
            schedule_type="daily", after=after, tz_name=None,
            interval_count=1, anchor=anchor, time_hhmm="09:00",
        )
        assert result is not None
        assert result > after


# ── utcnow_naive / to_utc_naive ───────────────────────────────────────────────

class TestHelpers:
    def test_utcnow_naive_is_naive(self):
        now = utcnow_naive()
        assert now.tzinfo is None

    def test_to_utc_naive_strips_aware(self):
        aware = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
        result = to_utc_naive(aware, None)
        assert result.tzinfo is None
        assert result == datetime(2024, 1, 1, 12, 0)

    def test_to_utc_naive_localizes_naive(self):
        # 14:30 IST naive → 09:00 UTC naive
        naive = datetime(2024, 1, 1, 14, 30)
        result = to_utc_naive(naive, "Asia/Kolkata")
        assert result.tzinfo is None
        assert result == datetime(2024, 1, 1, 9, 0)
