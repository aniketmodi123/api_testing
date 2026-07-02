"""
What this file does: Regression + endpoint tests for the /schedules/{id}/alerts CRUD routes,
proving the create_response(response_code, ...) fix (previously these 500'd on every call)
and covering ownership (403), not-found (404), and missing-auth (401).
"""
from models import BulkTestSchedule


async def _seed_schedule(db, owner="owner@example.com"):
    """What it does: Insert a minimal enabled daily BulkTestSchedule owned by ``owner`` and return it."""
    sched = BulkTestSchedule(
        name="s",
        username=owner,
        workspace_id=1,
        type="daily",
        time="10:00",
        enabled=True,
        payload={"type": "api", "apis": []},
    )
    db.add(sched)
    await db.commit()
    await db.refresh(sched)
    return sched


# ---------------------------------------------------------------- create (regression)

async def test_create_alert_happy_not_500(client, db, make_user, auth_headers):
    email = "owner@example.com"
    await make_user(email=email)
    headers = await auth_headers(email=email)
    sched = await _seed_schedule(db, owner=email)

    resp = await client.post(
        f"/schedules/{sched.id}/alerts",
        headers=headers,
        json={"type": "email", "target": "alert@x.com"},
    )

    # Regression: must NOT 500 — the create_response call now carries a response_code.
    assert resp.status_code == 201
    body = resp.json()
    assert body["response_code"] == 201
    assert body["data"]["type"] == "email"
    assert body["data"]["target"] == "alert@x.com"
    assert body["data"]["schedule_id"] == sched.id
    # defaults from AlertCreate
    assert body["data"]["on_failure"] is True
    assert body["data"]["on_success"] is False
    assert body["data"]["on_partial"] is True


# ---------------------------------------------------------------- list

async def test_list_alerts_returns_created(client, db, make_user, auth_headers):
    email = "owner@example.com"
    await make_user(email=email)
    headers = await auth_headers(email=email)
    sched = await _seed_schedule(db, owner=email)

    await client.post(
        f"/schedules/{sched.id}/alerts",
        headers=headers,
        json={"type": "webhook", "target": "https://hook.x/y"},
    )

    resp = await client.get(f"/schedules/{sched.id}/alerts", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 1
    assert data[0]["type"] == "webhook"
    assert data[0]["target"] == "https://hook.x/y"


# ---------------------------------------------------------------- update

async def test_update_alert_changes_target(client, db, make_user, auth_headers):
    email = "owner@example.com"
    await make_user(email=email)
    headers = await auth_headers(email=email)
    sched = await _seed_schedule(db, owner=email)

    created = await client.post(
        f"/schedules/{sched.id}/alerts",
        headers=headers,
        json={"type": "email", "target": "old@x.com"},
    )
    alert_id = created.json()["data"]["id"]

    resp = await client.put(
        f"/schedules/{sched.id}/alerts/{alert_id}",
        headers=headers,
        json={"target": "new@x.com"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["target"] == "new@x.com"


# ---------------------------------------------------------------- delete

async def test_delete_alert_happy(client, db, make_user, auth_headers):
    email = "owner@example.com"
    await make_user(email=email)
    headers = await auth_headers(email=email)
    sched = await _seed_schedule(db, owner=email)

    created = await client.post(
        f"/schedules/{sched.id}/alerts",
        headers=headers,
        json={"type": "email", "target": "del@x.com"},
    )
    alert_id = created.json()["data"]["id"]

    resp = await client.delete(f"/schedules/{sched.id}/alerts/{alert_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["response_code"] == 200

    # gone — create_response omits the data key entirely for an empty list
    listing = await client.get(f"/schedules/{sched.id}/alerts", headers=headers)
    assert listing.json().get("data") in (None, [])


# ---------------------------------------------------------------- auth / ownership / not-found

async def test_create_alert_missing_auth(client):
    resp = await client.post(
        "/schedules/1/alerts", json={"type": "email", "target": "a@x.com"}
    )
    assert resp.status_code == 401


async def test_create_alert_not_owner_is_403(client, db, make_user, auth_headers):
    await make_user(email="owner@b.com")
    await make_user(email="other@b.com")
    headers = await auth_headers(email="other@b.com")
    sched = await _seed_schedule(db, owner="owner@b.com")

    resp = await client.post(
        f"/schedules/{sched.id}/alerts",
        headers=headers,
        json={"type": "email", "target": "a@x.com"},
    )
    assert resp.status_code == 403
    assert resp.json()["response_code"] == 403


async def test_create_alert_schedule_not_found_is_404(client, make_user, auth_headers):
    email = "owner@example.com"
    await make_user(email=email)
    headers = await auth_headers(email=email)

    resp = await client.post(
        "/schedules/999999/alerts",
        headers=headers,
        json={"type": "email", "target": "a@x.com"},
    )
    # The app's process-time middleware normalises ALL 404 responses to
    # {"error_message": "Not found"} (main.py), stripping the response_code key — so the
    # contract verified here is the HTTP status plus that normalised body.
    assert resp.status_code == 404
    assert resp.json() == {"error_message": "Not found"}
