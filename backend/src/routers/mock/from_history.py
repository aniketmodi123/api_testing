"""
What this file does: Provides endpoints to create mock routes from captured RequestHistory rows or BulkTestResult snapshots; auth headers are stripped from the captured response before saving.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username
from config import get_db
from models import BulkTestResult, MockRoute, MockServer, RequestHistory
from utils import ExceptionHandler, create_response

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
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        server = (await db.execute(select(MockServer).where(MockServer.id == server_id))).scalar_one_or_none()
        if not server:
            return create_response(206, error_message="Mock server not found")

        access = await can_access_workspace(db, server.workspace_id, user.id, min_role="editor")
        if not access:
            return create_response(403, error_message="Access denied")

        history = (
            await db.execute(select(RequestHistory).where(RequestHistory.id == payload.history_id))
        ).scalar_one_or_none()
        if not history:
            return create_response(206, error_message="History entry not found")

        # derive path from URL if not overridden
        route_path = payload.path
        if not route_path:
            from urllib.parse import urlparse
            route_path = urlparse(history.url).path or "/"

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
        await db.commit()
        await db.refresh(route)
        return create_response(200, data=_route_dict(route))
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


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
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        server = (await db.execute(select(MockServer).where(MockServer.id == server_id))).scalar_one_or_none()
        if not server:
            return create_response(206, error_message="Mock server not found")

        access = await can_access_workspace(db, server.workspace_id, user.id, min_role="editor")
        if not access:
            return create_response(403, error_message="Access denied")

        result = (
            await db.execute(select(BulkTestResult).where(BulkTestResult.id == payload.result_id))
        ).scalar_one_or_none()
        if not result:
            return create_response(206, error_message="Test result not found")

        req_snapshot = result.request or {}
        resp_snapshot = result.response or {}

        method = req_snapshot.get("method", "GET").upper()
        route_path = payload.path or req_snapshot.get("url", "/")
        if route_path and route_path.startswith("http"):
            from urllib.parse import urlparse
            route_path = urlparse(route_path).path or "/"

        status_code = resp_snapshot.get("status_code") or result.status_code or 200
        raw_headers = resp_snapshot.get("headers")
        body = resp_snapshot.get("body")
        if isinstance(body, dict):
            import json
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
        await db.commit()
        await db.refresh(route)
        return create_response(200, data=_route_dict(route))
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
