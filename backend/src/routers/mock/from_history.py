"""
What this file does: Provides endpoints to create mock routes from captured RequestHistory rows or BulkTestResult snapshots; auth headers are stripped from the captured response before saving.
"""
import json
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import has_min_role, resolve_workspace_access, write_audit
from config import get_db
from models import (
    BulkTestExecution,
    BulkTestResult,
    BulkTestSchedule,
    MockRoute,
    MockServer,
    RequestHistory,
)
from utils import create_response

from .crud import MockRouteResponse, _route_dict

router = APIRouter()

# headers that may carry auth credentials — never carry these into a mock response
_STRIP_HEADERS = {"authorization", "x-api-key", "cookie", "set-cookie", "x-auth-token"}


def _sanitize_headers(headers: Optional[dict]) -> Optional[dict]:
    """What it does: Remove auth/credential headers from a captured header dict before storing in a mock route."""
    if not headers:
        return None
    return {k: v for k, v in headers.items() if k.lower() not in _STRIP_HEADERS} or None


class FromHistoryBody(BaseModel):
    """Request body for creating a mock route from a RequestHistory row.

    Attributes:
        history_id: ID of the RequestHistory record to copy from.
        path: Optional override for the route path; defaults to the captured request URL path.
        priority: Match priority for the created route.
    """

    history_id: int
    path: Optional[str] = None
    priority: int = 0


class FromResultBody(BaseModel):
    """Request body for creating a mock route from a BulkTestResult row.

    Attributes:
        result_id: ID of the BulkTestResult record to copy from.
        path: Optional override for the route path; defaults to the API endpoint recorded in the result.
        priority: Match priority for the created route.
    """

    result_id: int
    path: Optional[str] = None
    priority: int = 0


@router.post("/mock/{server_id}/route/from-history")
async def create_route_from_history(
    server_id: int,
    payload: FromHistoryBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /mock/{server_id}/route/from-history — create a mock route from a captured request history entry.

    Notes:
        - Authorization, X-Api-Key, Cookie, and Set-Cookie headers are stripped from the captured response before saving.
    """
    server_row = (
        await db.execute(select(MockServer.id, MockServer.workspace_id).where(MockServer.id == server_id))
    ).first()
    if not server_row:
        return create_response(404, error_message="Mock server not found")

    access = await resolve_workspace_access(db, username, server_row.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    history = (
        await db.execute(
            select(
                RequestHistory.username,
                RequestHistory.workspace_id,
                RequestHistory.method,
                RequestHistory.url,
                RequestHistory.response_status,
                RequestHistory.response_headers,
                RequestHistory.response_body,
            ).where(RequestHistory.id == payload.history_id)
        )
    ).first()
    if not history:
        return create_response(404, error_message="History entry not found")

    # cross-tenant guard: only copy history captured by this user or within the server's workspace
    if history.username != username and history.workspace_id != server_row.workspace_id:
        return create_response(403, error_message="Access denied")

    route_path = payload.path or urlparse(history.url).path or "/"

    route = MockRoute(
        server_id=server_id,
        method=history.method.upper(),
        path=route_path,
        status_code=history.response_status or 200,
        response_headers=_sanitize_headers(history.response_headers),
        response_body=history.response_body,
        delay_ms=0,
        priority=payload.priority,
    )
    db.add(route)
    await db.flush()
    await write_audit(db, username, "mock_route.create", "mock_route", route.id, workspace_id=server_row.workspace_id)
    await db.commit()
    return create_response(200, data=_route_dict(route), schema=MockRouteResponse)


@router.post("/mock/{server_id}/route/from-result")
async def create_route_from_result(
    server_id: int,
    payload: FromResultBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /mock/{server_id}/route/from-result — create a mock route from a bulk test result snapshot.

    Notes:
        - Authorization, X-Api-Key, Cookie, and Set-Cookie headers are stripped from the captured response before saving.
    """
    server_row = (
        await db.execute(select(MockServer.id, MockServer.workspace_id).where(MockServer.id == server_id))
    ).first()
    if not server_row:
        return create_response(404, error_message="Mock server not found")

    access = await resolve_workspace_access(db, username, server_row.workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    # fetch the result joined to its owning schedule's workspace for the cross-tenant guard
    row = (
        await db.execute(
            select(BulkTestResult, BulkTestSchedule.workspace_id)
            .join(BulkTestExecution, BulkTestResult.execution_id == BulkTestExecution.id)
            .join(BulkTestSchedule, BulkTestExecution.schedule_id == BulkTestSchedule.id)
            .where(BulkTestResult.id == payload.result_id)
        )
    ).first()
    if not row:
        return create_response(404, error_message="Test result not found")
    result, result_workspace_id = row

    # cross-tenant guard: only copy results produced within the server's workspace
    if result_workspace_id != server_row.workspace_id:
        return create_response(403, error_message="Access denied")

    req_snapshot = result.request or {}
    resp_snapshot = result.response or {}

    method = req_snapshot.get("method", "GET").upper()
    route_path = payload.path or req_snapshot.get("url", "/")
    if route_path and route_path.startswith("http"):
        route_path = urlparse(route_path).path or "/"

    status_code = resp_snapshot.get("status_code") or result.status_code or 200
    raw_headers = resp_snapshot.get("headers")
    body = resp_snapshot.get("body")
    if isinstance(body, dict):
        body = json.dumps(body)

    route = MockRoute(
        server_id=server_id,
        method=method,
        path=route_path,
        status_code=status_code,
        response_headers=_sanitize_headers(raw_headers),
        response_body=str(body) if body is not None else None,
        delay_ms=0,
        priority=payload.priority,
    )
    db.add(route)
    await db.flush()
    await write_audit(db, username, "mock_route.create", "mock_route", route.id, workspace_id=server_row.workspace_id)
    await db.commit()
    return create_response(200, data=_route_dict(route), schema=MockRouteResponse)
