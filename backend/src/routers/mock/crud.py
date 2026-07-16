"""
What this file does: Provides CRUD endpoints for mock servers and their routes; all routes require editor+ workspace access.
"""
import secrets
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import has_min_role, resolve_workspace_access, write_audit
from config import get_db
from models import MockRoute, MockServer
from utils import create_response

router = APIRouter()


# ---------- Pydantic schemas ----------

class CreateServerBody(BaseModel):
    """Request body for creating a new mock server.

    Attributes:
        workspace_id: Workspace to create the server in.
        name: Display name.
        description: Optional description; ``None`` when not provided.
        rate_limit: Requests per minute; ``0`` disables limiting.
    """

    workspace_id: int
    name: str
    description: Optional[str] = None
    rate_limit: int = 60


class UpdateServerBody(BaseModel):
    """Request body for updating a mock server's settings.

    Attributes:
        name: New display name; ``None`` to leave unchanged.
        description: New description; ``None`` to leave unchanged.
        enabled: Toggle server on/off; ``None`` to leave unchanged.
        rate_limit: New rate limit; ``None`` to leave unchanged.
    """

    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    rate_limit: Optional[int] = None


class CreateRouteBody(BaseModel):
    """Request body for adding a route to a mock server.

    Attributes:
        method: HTTP method — ``"GET"``, ``"POST"``, ``"PUT"``, ``"PATCH"``, or ``"DELETE"``.
        path: URL path template; ``{param}`` segments act as wildcards.
        status_code: HTTP status code to return; defaults to 200.
        response_headers: JSON dict of response headers; ``None`` for none.
        response_body: Response body string; supports ``{{$uuid}}`` / ``{{$randomInt}}`` tokens; ``None`` for empty.
        delay_ms: Milliseconds to wait before responding; defaults to 0.
        priority: Match priority when paths overlap; higher wins.
    """

    method: str
    path: str
    status_code: int = 200
    response_headers: Optional[dict] = None
    response_body: Optional[str] = None
    delay_ms: int = 0
    priority: int = 0


class UpdateRouteBody(BaseModel):
    """Request body for updating an existing mock route.

    Attributes:
        method: New HTTP method; ``None`` to leave unchanged.
        path: New path template; ``None`` to leave unchanged.
        status_code: New status code; ``None`` to leave unchanged.
        response_headers: New response headers; ``None`` to leave unchanged.
        response_body: New response body; ``None`` to leave unchanged.
        delay_ms: New delay; ``None`` to leave unchanged.
        priority: New priority; ``None`` to leave unchanged.
    """

    method: Optional[str] = None
    path: Optional[str] = None
    status_code: Optional[int] = None
    response_headers: Optional[dict] = None
    response_body: Optional[str] = None
    delay_ms: Optional[int] = None
    priority: Optional[int] = None


# ---------- Response schemas ----------

class MockRouteResponse(BaseModel):
    """Serialized mock route returned by route create/update and server-detail endpoints.

    Attributes:
        id: Route primary key.
        server_id: Owning mock server id.
        method: HTTP method the route matches.
        path: URL path template; ``{param}`` segments are wildcards.
        status_code: HTTP status code the route returns.
        response_headers: Stored response header dict; ``None`` when none set.
        response_body: Stored response body string; ``None`` when empty.
        delay_ms: Milliseconds the server waits before responding.
        priority: Match priority when paths overlap; higher wins.
        created_at: Creation timestamp as an ISO string.
    """

    id: int
    server_id: int
    method: str
    path: str
    status_code: int
    response_headers: Optional[dict] = None
    response_body: Optional[str] = None
    delay_ms: int
    priority: int
    created_at: str


class MockServerResponse(BaseModel):
    """Serialized mock server returned by server create/list/get/update endpoints.

    Attributes:
        id: Server primary key.
        workspace_id: Owning workspace id.
        name: Display name.
        description: Free-text description; ``None`` when not set.
        public_token: Unguessable token used in the public serve URL.
        enabled: ``True`` when the server accepts traffic.
        rate_limit: Max requests per minute; ``0`` disables limiting.
        created_at: Creation timestamp as an ISO string.
        updated_at: Last-modification timestamp as an ISO string.
        routes: Server's routes; populated only by the server-detail endpoint, ``None`` otherwise.
    """

    id: int
    workspace_id: int
    name: str
    description: Optional[str] = None
    public_token: str
    enabled: bool
    rate_limit: int
    created_at: str
    updated_at: str
    routes: Optional[List[MockRouteResponse]] = None


_ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def _server_dict(server: MockServer, include_routes: bool = False) -> dict:
    """What it does: Serialize a MockServer to a response dict, optionally including its routes."""
    d = {
        "id": server.id,
        "workspace_id": server.workspace_id,
        "name": server.name,
        "description": server.description,
        "public_token": server.public_token,
        "enabled": server.enabled,
        "rate_limit": server.rate_limit,
        "created_at": str(server.created_at),
        "updated_at": str(server.updated_at),
    }
    if include_routes:
        d["routes"] = [_route_dict(r) for r in (server.routes or [])]
    return d


def _route_dict(route: MockRoute) -> dict:
    """What it does: Serialize a MockRoute to a response dict."""
    return {
        "id": route.id,
        "server_id": route.server_id,
        "method": route.method,
        "path": route.path,
        "status_code": route.status_code,
        "response_headers": route.response_headers,
        "response_body": route.response_body,
        "delay_ms": route.delay_ms,
        "priority": route.priority,
        "created_at": str(route.created_at),
    }


# ---------- Server endpoints ----------

@router.post("/mock")
async def create_mock_server(
    payload: CreateServerBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /mock — create a new mock server with an unguessable public token."""
    access = await resolve_workspace_access(db, username, payload.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    server = MockServer(
        workspace_id=payload.workspace_id,
        name=payload.name,
        description=payload.description,
        public_token=secrets.token_hex(32),
        rate_limit=payload.rate_limit,
    )
    db.add(server)
    await db.flush()
    await write_audit(db, username, "mock_server.create", "mock_server", server.id, workspace_id=payload.workspace_id)
    await db.commit()
    return create_response(200, data=_server_dict(server), schema=MockServerResponse)


@router.get("/mock")
async def list_mock_servers(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /mock — list all mock servers for a workspace."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not access.can_access:
        return create_response(403, error_message="Access denied")

    servers = (
        await db.execute(select(MockServer).where(MockServer.workspace_id == workspace_id))
    ).scalars().all()
    return create_response(200, data=[_server_dict(s) for s in servers], schema=MockServerResponse)


@router.get("/mock/{server_id}")
async def get_mock_server(
    server_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /mock/{server_id} — return server detail including all routes."""
    server = (
        await db.execute(select(MockServer).where(MockServer.id == server_id))
    ).scalar_one_or_none()
    if not server:
        return create_response(404, error_message="Mock server not found")

    access = await resolve_workspace_access(db, username, server.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not access.can_access:
        return create_response(403, error_message="Access denied")

    routes = (
        await db.execute(
            select(MockRoute)
            .where(MockRoute.server_id == server_id)
            .order_by(MockRoute.priority.desc())
        )
    ).scalars().all()
    data = _server_dict(server)
    data["routes"] = [_route_dict(r) for r in routes]
    return create_response(200, data=data, schema=MockServerResponse)


@router.put("/mock/{server_id}")
async def update_mock_server(
    server_id: int,
    payload: UpdateServerBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /mock/{server_id} — update name, description, enabled flag, or rate limit."""
    server = (await db.execute(select(MockServer).where(MockServer.id == server_id))).scalar_one_or_none()
    if not server:
        return create_response(404, error_message="Mock server not found")

    access = await resolve_workspace_access(db, username, server.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    if payload.name is not None:
        server.name = payload.name
    if payload.description is not None:
        server.description = payload.description
    if payload.enabled is not None:
        server.enabled = payload.enabled
    if payload.rate_limit is not None:
        server.rate_limit = payload.rate_limit

    server.updated_at = datetime.now()
    await write_audit(db, username, "mock_server.update", "mock_server", server_id, workspace_id=server.workspace_id)
    await db.commit()
    return create_response(200, data=_server_dict(server), schema=MockServerResponse)


@router.delete("/mock/{server_id}")
async def delete_mock_server(
    server_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /mock/{server_id} — delete server and all its routes (DB-level cascade via ON DELETE CASCADE)."""
    row = (
        await db.execute(select(MockServer.id, MockServer.workspace_id).where(MockServer.id == server_id))
    ).first()
    if not row:
        return create_response(404, error_message="Mock server not found")

    access = await resolve_workspace_access(db, username, row.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    await write_audit(db, username, "mock_server.delete", "mock_server", server_id, workspace_id=row.workspace_id)
    await db.execute(delete(MockServer).where(MockServer.id == server_id))
    await db.commit()
    return create_response(200, message="Mock server deleted")


# ---------- Route endpoints ----------

@router.post("/mock/{server_id}/route")
async def add_mock_route(
    server_id: int,
    payload: CreateRouteBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /mock/{server_id}/route — add a new route to a mock server."""
    row = (
        await db.execute(select(MockServer.id, MockServer.workspace_id).where(MockServer.id == server_id))
    ).first()
    if not row:
        return create_response(404, error_message="Mock server not found")

    access = await resolve_workspace_access(db, username, row.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    method = payload.method.upper()
    if method not in _ALLOWED_METHODS:
        return create_response(400, error_message=f"Method must be one of {sorted(_ALLOWED_METHODS)}")

    route = MockRoute(
        server_id=server_id,
        method=method,
        path=payload.path.rstrip("/") or "/",
        status_code=payload.status_code,
        response_headers=payload.response_headers,
        response_body=payload.response_body,
        delay_ms=max(0, payload.delay_ms),
        priority=payload.priority,
    )
    db.add(route)
    await db.flush()
    await write_audit(db, username, "mock_route.create", "mock_route", route.id, workspace_id=row.workspace_id)
    await db.commit()
    return create_response(200, data=_route_dict(route), schema=MockRouteResponse)


@router.put("/mock/{server_id}/route/{route_id}")
async def update_mock_route(
    server_id: int,
    route_id: int,
    payload: UpdateRouteBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /mock/{server_id}/route/{route_id} — update an existing mock route."""
    row = (
        await db.execute(
            select(MockRoute, MockServer.workspace_id)
            .join(MockServer, MockServer.id == MockRoute.server_id)
            .where(MockRoute.id == route_id, MockRoute.server_id == server_id)
        )
    ).first()
    if not row:
        return create_response(404, error_message="Route not found")
    route, workspace_id = row

    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    if payload.method is not None:
        m = payload.method.upper()
        if m not in _ALLOWED_METHODS:
            return create_response(400, error_message=f"Method must be one of {sorted(_ALLOWED_METHODS)}")
        route.method = m
    if payload.path is not None:
        route.path = payload.path.rstrip("/") or "/"
    if payload.status_code is not None:
        route.status_code = payload.status_code
    if payload.response_headers is not None:
        route.response_headers = payload.response_headers
    if payload.response_body is not None:
        route.response_body = payload.response_body
    if payload.delay_ms is not None:
        route.delay_ms = max(0, payload.delay_ms)
    if payload.priority is not None:
        route.priority = payload.priority

    await write_audit(db, username, "mock_route.update", "mock_route", route_id, workspace_id=workspace_id)
    await db.commit()
    return create_response(200, data=_route_dict(route), schema=MockRouteResponse)


@router.delete("/mock/{server_id}/route/{route_id}")
async def delete_mock_route(
    server_id: int,
    route_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /mock/{server_id}/route/{route_id} — delete a route from a mock server."""
    row = (
        await db.execute(
            select(MockRoute.id, MockServer.workspace_id)
            .join(MockServer, MockServer.id == MockRoute.server_id)
            .where(MockRoute.id == route_id, MockRoute.server_id == server_id)
        )
    ).first()
    if not row:
        return create_response(404, error_message="Route not found")

    access = await resolve_workspace_access(db, username, row.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    await write_audit(db, username, "mock_route.delete", "mock_route", row.id, workspace_id=row.workspace_id)
    await db.execute(delete(MockRoute).where(MockRoute.id == row.id))
    await db.commit()
    return create_response(200, message="Route deleted")
