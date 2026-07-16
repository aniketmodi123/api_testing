"""
What this file does: Integration tests for /schedules CRUD and execution management endpoints.
Covers happy path, auth failures, invalid input, and edge cases (past once, bad timezone,
blocked delete of running execution, run-now 202).
All tests use the in-memory SQLite DB wired by conftest.py fixtures.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict

import pytest

from models import (
    ACTIVE_STATUSES,
    BulkTestExecution,
    BulkTestSchedule,
    ScheduleType,
    User,
)
from schedule_triggers import utcnow_naive

import routers.shedulers.shedule_test as sched_module


# ── shared helpers ─────────────────────────────────────────────────────────────

def _future_dt() -> str:
    """ISO string 1 year from now."""
    return (utcnow_naive() + timedelta(days=365)).isoformat()


DAILY_PAYLOAD: Dict[str, Any] = {
    "name": "daily-run",
    "type": "daily",
    "time": "09:00",
    "enabled": True,
    "payload": {"type": "api", "apis": []},
}

MINUTELY_PAYLOAD: Dict[str, Any] = {
    "name": "fast-run",
    "type": "minutely",
    "interval_count": 20,
    "enabled": True,
    "payload": {"type": "api", "apis": []},
}


async def _seed_schedule(db, username: str = "u@test.com", ws_id: int = 1) -> BulkTestSchedule:
    sched = BulkTestSchedule(
        name="seeded", username=username, workspace_id=ws_id,
        type=ScheduleType.minutely, interval_count=20,
        payload={"type": "api", "apis": []}, enabled=True,
    )
    db.add(sched)
    await db.commit()
    await db.refresh(sched)
    return sched


async def _seed_execution(db, schedule_id: int, status: str = "success") -> BulkTestExecution:
    ex = BulkTestExecution(
        schedule_id=schedule_id, status=status,
        started_at=utcnow_naive(),
    )
    db.add(ex)
    await db.commit()
    await db.refresh(ex)
    return ex


# ── create schedule ───────────────────────────────────────────────────────────

class TestCreateSchedule:
    async def test_minutely_happy_path(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.post("/schedules", json=MINUTELY_PAYLOAD, headers=headers)

        assert resp.status_code == 200
        body = resp.json()
        assert body["response_code"] == 201
        data = body["data"]
        assert data["name"] == "fast-run"
        assert data["type"] == "minutely"
        assert data["interval_count"] == 20

    async def test_daily_happy_path(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.post("/schedules", json=DAILY_PAYLOAD, headers=headers)

        assert resp.status_code == 200
        assert resp.json()["response_code"] == 201

    async def test_once_future_ok(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.post("/schedules", json={
            "name": "once-run",
            "type": "once",
            "date_time": _future_dt(),
            "enabled": True,
            "payload": {"type": "api", "apis": []},
        }, headers=headers)

        assert resp.status_code == 200
        assert resp.json()["response_code"] == 201

    async def test_once_past_rejected(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        past = (utcnow_naive() - timedelta(days=1)).isoformat()
        resp = await client.post("/schedules", json={
            "name": "past-once",
            "type": "once",
            "date_time": past,
            "enabled": True,
            "payload": {"type": "api", "apis": []},
        }, headers=headers)

        assert resp.status_code == 200
        assert resp.json()["response_code"] == 400

    async def test_invalid_timezone_rejected(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.post("/schedules", json={
            **MINUTELY_PAYLOAD,
            "timezone": "Not/ATimezone",
        }, headers=headers)

        assert resp.status_code == 422

    async def test_invalid_day_of_week_rejected(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.post("/schedules", json={
            "name": "weekly-run",
            "type": "weekly",
            "time": "09:00",
            "days_of_week": ["Funday"],  # invalid
            "enabled": True,
            "payload": {"type": "api", "apis": []},
        }, headers=headers)

        assert resp.status_code == 200
        assert resp.json()["response_code"] == 400

    async def test_days_of_week_canonicalized(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.post("/schedules", json={
            "name": "weekly-run",
            "type": "weekly",
            "time": "09:00",
            "days_of_week": ["Mon", "Wed"],
            "enabled": True,
            "payload": {"type": "api", "apis": []},
        }, headers=headers)

        assert resp.json()["response_code"] == 201
        assert resp.json()["data"]["days_of_week"] == ["monday", "wednesday"]

    async def test_missing_auth_rejected(self, client):
        resp = await client.post("/schedules", json=MINUTELY_PAYLOAD)
        assert resp.status_code == 401

    async def test_unknown_user_rejected(self, client, auth_headers):
        # Token valid but user not in DB
        headers = {**(await auth_headers("ghost@test.com")), "workspace-id": "1"}
        resp = await client.post("/schedules", json=MINUTELY_PAYLOAD, headers=headers)
        assert resp.json()["response_code"] == 400


# ── list schedules ────────────────────────────────────────────────────────────

class TestListSchedules:
    async def test_empty_for_new_workspace(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get("/schedules", headers=headers)

        assert resp.status_code == 200
        assert resp.json()["response_code"] == 200
        assert resp.json()["data"] == []

    async def test_returns_created_schedule(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        await _seed_schedule(db, username="u@test.com", ws_id=1)
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get("/schedules", headers=headers)

        assert resp.json()["response_code"] == 200
        items = resp.json()["data"]
        assert len(items) == 1
        assert items[0]["name"] == "seeded"
        assert "executions_count" in items[0]

    async def test_workspace_isolation(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        await _seed_schedule(db, username="u@test.com", ws_id=99)  # different workspace
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get("/schedules", headers=headers)

        assert resp.json()["data"] == []


# ── get single schedule ───────────────────────────────────────────────────────

class TestGetSchedule:
    async def test_get_existing(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get(f"/schedules/{sched.id}", headers=headers)

        assert resp.json()["response_code"] == 200
        assert resp.json()["data"]["id"] == sched.id
        assert "executions_count" in resp.json()["data"]

    async def test_get_missing_returns_404(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get("/schedules/99999", headers=headers)

        assert resp.json()["response_code"] == 404

    async def test_get_other_users_schedule_returns_404(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        await make_user(email="other@test.com")
        other_sched = await _seed_schedule(db, username="other@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get(f"/schedules/{other_sched.id}", headers=headers)

        assert resp.json()["response_code"] == 404


# ── update schedule ───────────────────────────────────────────────────────────

class TestUpdateSchedule:
    async def test_update_happy_path(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.put(f"/schedules/{sched.id}", json={
            **DAILY_PAYLOAD,
            "name": "updated-name",
        }, headers=headers)

        assert resp.json()["response_code"] == 200
        assert resp.json()["data"]["name"] == "updated-name"
        assert resp.json()["data"]["type"] == "daily"

    async def test_update_not_found(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.put("/schedules/99999", json=DAILY_PAYLOAD, headers=headers)

        assert resp.json()["response_code"] == 404


# ── enable toggle ─────────────────────────────────────────────────────────────

class TestEnableToggle:
    async def test_disable_schedule(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.patch(f"/schedules/{sched.id}/enable",
                                  json={"enabled": False}, headers=headers)

        assert resp.json()["response_code"] == 200
        assert resp.json()["data"]["enabled"] is False

    async def test_re_enable_schedule(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        sched.enabled = False
        await db.commit()
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.patch(f"/schedules/{sched.id}/enable",
                                  json={"enabled": True}, headers=headers)

        assert resp.json()["response_code"] == 200
        assert resp.json()["data"]["enabled"] is True

    async def test_toggle_not_found(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.patch("/schedules/99999/enable",
                                  json={"enabled": True}, headers=headers)

        assert resp.json()["response_code"] == 404


# ── run-now ───────────────────────────────────────────────────────────────────

class TestRunNow:
    async def test_run_now_returns_202(self, client, make_user, auth_headers, db, monkeypatch):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        fired: list[int] = []

        async def _fake_run(schedule_id: int) -> None:
            fired.append(schedule_id)

        monkeypatch.setattr(sched_module, "run_execution_task", _fake_run)

        resp = await client.post(f"/schedules/{sched.id}/run-now", headers=headers)

        assert resp.json()["response_code"] == 202
        # Give the event loop a tick to execute the background task
        await asyncio.sleep(0)
        assert sched.id in fired

    async def test_run_now_not_found(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.post("/schedules/99999/run-now", headers=headers)

        assert resp.json()["response_code"] == 404


# ── delete schedule ───────────────────────────────────────────────────────────

class TestDeleteSchedule:
    async def test_delete_happy_path(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.delete(f"/schedules/{sched.id}", headers=headers)

        assert resp.json()["response_code"] == 200

        # Confirm gone
        resp2 = await client.get(f"/schedules/{sched.id}", headers=headers)
        assert resp2.json()["response_code"] == 404

    async def test_delete_not_found(self, client, make_user, auth_headers):
        await make_user(email="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.delete("/schedules/99999", headers=headers)

        assert resp.json()["response_code"] == 404


# ── executions list (paginated) ───────────────────────────────────────────────

class TestExecutionsList:
    async def test_empty_list(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get(f"/schedules/{sched.id}/executions", headers=headers)

        assert resp.json()["response_code"] == 200
        assert resp.json()["data"]["executions"] == []
        assert resp.json()["data"]["total"] == 0

    async def test_paginated_results(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        for _ in range(5):
            await _seed_execution(db, sched.id)
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get(
            f"/schedules/{sched.id}/executions?limit=2&offset=0",
            headers=headers,
        )

        data = resp.json()["data"]
        assert data["total"] == 5
        assert len(data["executions"]) == 2

    async def test_offset(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        for _ in range(3):
            await _seed_execution(db, sched.id)
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get(
            f"/schedules/{sched.id}/executions?limit=10&offset=2",
            headers=headers,
        )

        data = resp.json()["data"]
        assert data["total"] == 3
        assert len(data["executions"]) == 1


# ── execution detail ──────────────────────────────────────────────────────────

class TestExecutionDetail:
    async def test_get_execution_detail(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        ex = await _seed_execution(db, sched.id)
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get(
            f"/schedules/{sched.id}/executions/{ex.id}",
            headers=headers,
        )

        assert resp.json()["response_code"] == 200
        data = resp.json()["data"]
        assert data["id"] == ex.id
        assert "results" in data

    async def test_execution_not_found(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get(
            f"/schedules/{sched.id}/executions/99999",
            headers=headers,
        )

        assert resp.json()["response_code"] == 404


# ── delete execution ──────────────────────────────────────────────────────────

class TestDeleteExecution:
    async def test_delete_completed_execution_ok(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        ex = await _seed_execution(db, sched.id, status="success")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.delete(
            f"/schedules/{sched.id}/executions/{ex.id}",
            headers=headers,
        )

        assert resp.json()["response_code"] == 200

    async def test_delete_running_execution_blocked(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        ex = await _seed_execution(db, sched.id, status="running")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.delete(
            f"/schedules/{sched.id}/executions/{ex.id}",
            headers=headers,
        )

        assert resp.json()["response_code"] == 409

    async def test_delete_queued_execution_blocked(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        ex = await _seed_execution(db, sched.id, status="queued")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.delete(
            f"/schedules/{sched.id}/executions/{ex.id}",
            headers=headers,
        )

        assert resp.json()["response_code"] == 409


# ── running executions ────────────────────────────────────────────────────────

class TestRunningExecutions:
    async def test_empty_when_none_active(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        await _seed_execution(db, sched.id, status="success")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get("/schedules/executions/running", headers=headers)

        assert resp.json()["response_code"] == 200
        assert resp.json()["data"] == []

    async def test_returns_active_executions(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com")
        await _seed_execution(db, sched.id, status="running")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}

        resp = await client.get("/schedules/executions/running", headers=headers)

        items = resp.json()["data"]
        assert len(items) == 1
        assert items[0]["status"] == "running"

    async def test_excludes_other_workspace(self, client, make_user, auth_headers, db):
        await make_user(email="u@test.com")
        sched = await _seed_schedule(db, username="u@test.com", ws_id=99)  # ws 99
        await _seed_execution(db, sched.id, status="running")
        headers = {**(await auth_headers("u@test.com")), "workspace-id": "1"}  # querying ws 1

        resp = await client.get("/schedules/executions/running", headers=headers)

        assert resp.json()["data"] == []
