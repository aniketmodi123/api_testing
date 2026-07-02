"""
What this file does: Smoke test proving the Sprint 8c backend test infra works — auth
middleware, in-memory DB, and seeded fixtures all wire together against a real route.
"""


async def test_authed_request_passes_middleware_and_hits_db(client, make_user, auth_headers):
    # Arrange: a user must exist (list_themes resolves the user) + a valid token.
    await make_user(email="tester@example.com")
    headers = await auth_headers(email="tester@example.com")

    # Act
    resp = await client.get("/themes", headers=headers)

    # Assert: route reached, empty theme list for a fresh user.
    assert resp.status_code == 200
    body = resp.json()
    assert body["response_code"] == 200
    assert body["data"]["themes"] == []
    assert body["data"]["total"] == 0


async def test_missing_auth_is_rejected(client):
    # No Authorization/username headers → AuthMiddleware blocks before the route.
    resp = await client.get("/themes")
    assert resp.status_code == 401
