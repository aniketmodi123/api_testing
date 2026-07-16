"""
What this file does: Unit tests for the scheduler engine helper functions —
_accumulate_execution_stats, _reap_stale_executions, and _fail_execution.

run_engine_once is NOT tested here: it uses FOR UPDATE SKIP LOCKED which
SQLAlchemy's SQLite dialect does not support. Those tests require PostgreSQL.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict

import pytest

import routers.script.test_scheduler as engine_module
from models import (
    ACTIVE_STATUSES,
    BulkTestExecution,
    BulkTestSchedule,
    ScheduleType,
)
from routers.script.test_scheduler import (
    _accumulate_execution_stats,
    _fail_execution,
    _reap_stale_executions,
)
from schedule_triggers import utcnow_naive


def _dt(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute)


def _sched(db_session_unused=None) -> Dict[str, Any]:
    return dict(
        name="test-sched",
        username="u",
        workspace_id=1,
        type=ScheduleType.minutely,
        interval_count=20,
        payload={"type": "api", "apis": []},
        enabled=True,
    )


# ── helpers ───────────────────────────────────────────────────────────────────

async def _noop_refresh(db: Any, schedule_id: int) -> None:
    pass


async def _noop_dispatch(db: Any, schedule_id: int, execution: Any) -> None:
    pass


# ── _accumulate_execution_stats ───────────────────────────────────────────────

class TestAccumulateStats:
    def test_all_pass(self):
        ex = BulkTestExecution()
        _accumulate_execution_stats(ex, [
            {"success": True, "duration_ms": 100},
            {"success": True, "duration_ms": 200},
        ])
        assert ex.total_cases == 2
        assert ex.passed == 2
        assert ex.failed == 0
        assert ex.duration_ms == 300
        assert ex.status == "success"

    def test_all_fail(self):
        ex = BulkTestExecution()
        _accumulate_execution_stats(ex, [{"success": False, "duration_ms": 50}])
        assert ex.status == "failed"
        assert ex.passed == 0
        assert ex.failed == 1

    def test_partial(self):
        ex = BulkTestExecution()
        _accumulate_execution_stats(ex, [{"success": True}, {"success": False}])
        assert ex.status == "partial"
        assert ex.passed == 1
        assert ex.failed == 1

    def test_empty_input(self):
        ex = BulkTestExecution()
        _accumulate_execution_stats(ex, [])
        assert ex.total_cases == 0
        assert ex.status == "success"  # 0 failed = success

    def test_missing_duration_treated_as_zero(self):
        ex = BulkTestExecution()
        _accumulate_execution_stats(ex, [{"success": True}])  # no duration_ms key
        assert ex.duration_ms == 0

    def test_none_duration_treated_as_zero(self):
        ex = BulkTestExecution()
        _accumulate_execution_stats(ex, [{"success": True, "duration_ms": None}])
        assert ex.duration_ms == 0


# ── _reap_stale_executions ────────────────────────────────────────────────────

class TestReapStaleExecutions:
    async def test_stale_running_marked_failed(self, db):
        sched = BulkTestSchedule(**_sched())
        db.add(sched)
        await db.flush()

        now = _dt(2024, 1, 1, 12, 0)
        stale_at = now - timedelta(minutes=31)
        ex = BulkTestExecution(schedule_id=sched.id, status="running", started_at=stale_at)
        db.add(ex)
        await db.commit()

        await _reap_stale_executions(db, now)
        await db.refresh(ex)

        assert ex.status == "failed"
        assert ex.finished_at is not None
        assert "reaper" in (ex.error_message or "")

    async def test_stale_queued_also_reaped(self, db):
        sched = BulkTestSchedule(**_sched())
        db.add(sched)
        await db.flush()

        now = _dt(2024, 1, 1, 12, 0)
        stale_at = now - timedelta(minutes=31)
        ex = BulkTestExecution(schedule_id=sched.id, status="queued", started_at=stale_at)
        db.add(ex)
        await db.commit()

        await _reap_stale_executions(db, now)
        await db.refresh(ex)

        assert ex.status == "failed"

    async def test_fresh_running_untouched(self, db):
        sched = BulkTestSchedule(**_sched())
        db.add(sched)
        await db.flush()

        now = _dt(2024, 1, 1, 12, 0)
        ex = BulkTestExecution(
            schedule_id=sched.id, status="running",
            started_at=now - timedelta(minutes=5),
        )
        db.add(ex)
        await db.commit()

        await _reap_stale_executions(db, now)
        await db.refresh(ex)

        assert ex.status == "running"

    async def test_terminal_success_untouched(self, db):
        sched = BulkTestSchedule(**_sched())
        db.add(sched)
        await db.flush()

        now = _dt(2024, 1, 1, 12, 0)
        ex = BulkTestExecution(
            schedule_id=sched.id, status="success",
            started_at=now - timedelta(hours=2),
        )
        db.add(ex)
        await db.commit()

        await _reap_stale_executions(db, now)
        await db.refresh(ex)

        assert ex.status == "success"

    async def test_terminal_failed_untouched(self, db):
        sched = BulkTestSchedule(**_sched())
        db.add(sched)
        await db.flush()

        now = _dt(2024, 1, 1, 12, 0)
        ex = BulkTestExecution(
            schedule_id=sched.id, status="failed",
            started_at=now - timedelta(hours=2),
        )
        db.add(ex)
        await db.commit()

        await _reap_stale_executions(db, now)
        await db.refresh(ex)

        assert ex.status == "failed"
        assert ex.error_message is None  # reaper didn't overwrite

    async def test_exactly_30_min_not_stale(self, db):
        sched = BulkTestSchedule(**_sched())
        db.add(sched)
        await db.flush()

        now = _dt(2024, 1, 1, 12, 0)
        ex = BulkTestExecution(
            schedule_id=sched.id, status="running",
            started_at=now - timedelta(minutes=30),
        )
        db.add(ex)
        await db.commit()

        await _reap_stale_executions(db, now)
        await db.refresh(ex)

        # started_at < now - 30min is False when diff == 30min exactly
        assert ex.status == "running"


# ── _fail_execution ───────────────────────────────────────────────────────────

class TestFailExecution:
    async def test_marks_failed_with_reason(self, session_factory, monkeypatch):
        monkeypatch.setattr(engine_module, "SessionLocal", session_factory)
        monkeypatch.setattr(engine_module, "refresh_monitor_rollup", _noop_refresh)
        monkeypatch.setattr(engine_module, "dispatch_alerts", _noop_dispatch)

        async with session_factory() as db:
            sched = BulkTestSchedule(**_sched())
            db.add(sched)
            await db.flush()
            ex = BulkTestExecution(
                schedule_id=sched.id, status="running", started_at=utcnow_naive(),
            )
            db.add(ex)
            await db.commit()
            exec_id = ex.id
            schedule_id = sched.id

        await _fail_execution(exec_id, schedule_id, "test reason")

        async with session_factory() as db:
            result = await db.get(BulkTestExecution, exec_id)
            assert result.status == "failed"
            assert result.error_message == "test reason"
            assert result.finished_at is not None

    async def test_nonexistent_exec_id_silent(self, session_factory, monkeypatch):
        monkeypatch.setattr(engine_module, "SessionLocal", session_factory)
        monkeypatch.setattr(engine_module, "refresh_monitor_rollup", _noop_refresh)
        monkeypatch.setattr(engine_module, "dispatch_alerts", _noop_dispatch)
        # Should not raise — engine reaper may call with stale IDs
        await _fail_execution(99999, 99999, "never-fires")

    async def test_finished_at_set_to_utcnow(self, session_factory, monkeypatch):
        monkeypatch.setattr(engine_module, "SessionLocal", session_factory)
        monkeypatch.setattr(engine_module, "refresh_monitor_rollup", _noop_refresh)
        monkeypatch.setattr(engine_module, "dispatch_alerts", _noop_dispatch)

        async with session_factory() as db:
            sched = BulkTestSchedule(**_sched())
            db.add(sched)
            await db.flush()
            ex = BulkTestExecution(
                schedule_id=sched.id, status="running",
                started_at=_dt(2024, 1, 1, 10, 0),
            )
            db.add(ex)
            await db.commit()
            exec_id = ex.id
            schedule_id = sched.id

        await _fail_execution(exec_id, schedule_id, "timeout")

        async with session_factory() as db:
            result = await db.get(BulkTestExecution, exec_id)
            assert result.finished_at > _dt(2024, 1, 1, 10, 0)
