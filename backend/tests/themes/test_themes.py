"""
What this file does: Endpoint tests for the user-owned /themes CRUD + activate routes,
covering happy paths, auth rejection, Pydantic validation, duplicate-name conflict, and
not-found handling.
"""


async def _seed_user(make_user, auth_headers, email="themer@example.com"):
    """What it does: Insert a user and return that user's valid auth headers."""
    await make_user(email=email)
    return await auth_headers(email=email)


# ---------------------------------------------------------------- create

async def test_create_theme_happy(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)

    resp = await client.post(
        "/themes",
        headers=headers,
        json={"name": "Midnight", "token_map": {"--bg": "#000"}},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["response_code"] == 201
    assert body["data"]["name"] == "Midnight"
    assert body["data"]["token_map"] == {"--bg": "#000"}
    assert body["data"]["is_active"] is False


async def test_create_theme_missing_auth(client):
    resp = await client.post("/themes", json={"name": "X", "token_map": {"--bg": "#000"}})
    assert resp.status_code == 401


async def test_create_theme_missing_name_is_422(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)

    resp = await client.post("/themes", headers=headers, json={"token_map": {"--bg": "#000"}})
    assert resp.status_code == 422


async def test_create_duplicate_name_is_409(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)
    payload = {"name": "Dupe", "token_map": {"--bg": "#111"}}

    first = await client.post("/themes", headers=headers, json=payload)
    assert first.status_code == 201

    second = await client.post("/themes", headers=headers, json=payload)
    assert second.status_code == 409
    assert second.json()["response_code"] == 409


# ---------------------------------------------------------------- list

async def test_list_themes_happy(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)
    await client.post("/themes", headers=headers, json={"name": "Old", "token_map": {"--a": "1"}})
    await client.post("/themes", headers=headers, json={"name": "New", "token_map": {"--b": "2"}})

    resp = await client.get("/themes", headers=headers)

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] == 2
    # Both themes present. The route orders by created_at desc, but two rows created in
    # the same sub-millisecond tie, so strict ordering is not asserted here.
    assert {t["name"] for t in data["themes"]} == {"Old", "New"}


async def test_list_themes_missing_auth(client):
    resp = await client.get("/themes")
    assert resp.status_code == 401


# ---------------------------------------------------------------- update

async def test_update_theme_happy(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)
    created = await client.post(
        "/themes", headers=headers, json={"name": "Before", "token_map": {"--bg": "#000"}}
    )
    theme_id = created.json()["data"]["id"]

    resp = await client.put(
        f"/themes/{theme_id}",
        headers=headers,
        json={"name": "After", "token_map": {"--bg": "#fff"}},
    )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["name"] == "After"
    assert data["token_map"] == {"--bg": "#fff"}


async def test_update_theme_missing_auth(client):
    resp = await client.put("/themes/1", json={"name": "After"})
    assert resp.status_code == 401


async def test_update_nonexistent_theme_is_404(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)
    resp = await client.put("/themes/999999", headers=headers, json={"name": "Nope"})
    assert resp.status_code == 404


# ---------------------------------------------------------------- delete

async def test_delete_theme_happy(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)
    created = await client.post(
        "/themes", headers=headers, json={"name": "Doomed", "token_map": {"--bg": "#000"}}
    )
    theme_id = created.json()["data"]["id"]

    resp = await client.delete(f"/themes/{theme_id}", headers=headers)
    assert resp.status_code == 204

    # gone from the list
    listing = await client.get("/themes", headers=headers)
    assert listing.json()["data"]["total"] == 0


async def test_delete_theme_missing_auth(client):
    resp = await client.delete("/themes/1")
    assert resp.status_code == 401


async def test_delete_nonexistent_theme_is_404(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)
    resp = await client.delete("/themes/999999", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------- activate

async def test_activate_theme_happy_and_active_reflects(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)

    # initially no active theme
    pre = await client.get("/themes/active", headers=headers)
    assert pre.status_code == 200
    assert pre.json()["data"]["theme"] is None

    created = await client.post(
        "/themes", headers=headers, json={"name": "Pickme", "token_map": {"--bg": "#abc"}}
    )
    theme_id = created.json()["data"]["id"]

    resp = await client.put(f"/themes/{theme_id}/activate", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["is_active"] is True

    # GET /active now returns that theme
    active = await client.get("/themes/active", headers=headers)
    assert active.status_code == 200
    assert active.json()["data"]["theme"]["id"] == theme_id
    assert active.json()["data"]["theme"]["name"] == "Pickme"


async def test_activate_is_sole_active(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)
    a = await client.post("/themes", headers=headers, json={"name": "A", "token_map": {"--a": "1"}})
    b = await client.post("/themes", headers=headers, json={"name": "B", "token_map": {"--b": "2"}})
    a_id = a.json()["data"]["id"]
    b_id = b.json()["data"]["id"]

    await client.put(f"/themes/{a_id}/activate", headers=headers)
    await client.put(f"/themes/{b_id}/activate", headers=headers)

    active = await client.get("/themes/active", headers=headers)
    assert active.json()["data"]["theme"]["id"] == b_id

    # only one theme is active in the list
    listing = await client.get("/themes", headers=headers)
    actives = [t for t in listing.json()["data"]["themes"] if t["is_active"]]
    assert len(actives) == 1
    assert actives[0]["id"] == b_id


async def test_activate_theme_missing_auth(client):
    resp = await client.put("/themes/1/activate")
    assert resp.status_code == 401


async def test_activate_nonexistent_theme_is_404(client, make_user, auth_headers):
    headers = await _seed_user(make_user, auth_headers)
    resp = await client.put("/themes/999999/activate", headers=headers)
    assert resp.status_code == 404
