"""
What this file does: Exposes CRUD endpoints under /history for saving, listing, retrieving, and deleting HTTP request history entries per user.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from pydantic import BaseModel
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from models import RequestHistory, User
from utils import create_response

router = APIRouter(prefix="/history", tags=["history"])

MAX_RESPONSE_BODY_BYTES = 50 * 1024  # 50 KB
MAX_PAGE_SIZE = 200


class HistoryCreateRequest(BaseModel):
    """Request body for POST /history.
    Attributes:
        file_id: Node ID of the file that made the request; None when called outside a file context.
        workspace_id: Workspace the file belongs to; None when not associated with a workspace.
        method: HTTP method (e.g., GET, POST).
        url: Full request URL.
        headers: Request headers sent; None when not captured.
        params: Query parameters sent; None when not captured.
        body: Raw request body string; None for requests without a body.
        response_status: HTTP status code returned by the target; None when the request failed before a response.
        response_body: Raw response body string, truncated to 50 KB on save; None when not captured.
        response_headers: Response headers returned by the target; None when not captured.
        execution_time_ms: Round-trip time in milliseconds; None when not measured.
    """
    file_id: Optional[int] = None
    workspace_id: Optional[int] = None
    method: str
    url: str
    headers: Optional[dict] = None
    params: Optional[dict] = None
    body: Optional[str] = None
    response_status: Optional[int] = None
    response_body: Optional[str] = None
    response_headers: Optional[dict] = None
    execution_time_ms: Optional[int] = None


class HistorySaveResponse(BaseModel):
    """Id of the history entry created by POST /history.

    Attributes:
        id: Primary key of the newly stored history entry.
    """

    id: int


class HistoryListItem(BaseModel):
    """Summary row returned by GET /history (no request/response bodies).

    Attributes:
        id: Primary key of the entry.
        file_id: File node the request was made from; None for ad-hoc requests.
        workspace_id: Workspace context; None when not associated with a workspace.
        method: HTTP method of the recorded request.
        url: Full request URL.
        response_status: HTTP status returned by the target; None on connection failure.
        execution_time_ms: Round-trip time in milliseconds; None when not measured.
        created_at: ISO timestamp when the entry was recorded; None if unset.
    """

    id: int
    file_id: Optional[int] = None
    workspace_id: Optional[int] = None
    method: str
    url: str
    response_status: Optional[int] = None
    execution_time_ms: Optional[int] = None
    created_at: Optional[str] = None


class HistoryDetailResponse(HistoryListItem):
    """Full history entry including request and response bodies.

    Attributes:
        headers: Request headers sent; None when not captured.
        params: Query parameters sent; None when not captured.
        body: Raw request body string; None when no body was sent.
        response_body: Raw response body string; None when no body was received.
        response_headers: Response headers returned by the target; None when not captured.
    """

    headers: Optional[dict] = None
    params: Optional[dict] = None
    body: Optional[str] = None
    response_body: Optional[str] = None
    response_headers: Optional[dict] = None


def _truncate_body(body: Optional[str]) -> Optional[str]:
    """What it does: Cap the body string at 50 KB and append a truncation marker when it exceeds the limit."""
    if not body:
        return body
    encoded = body.encode("utf-8", errors="replace")
    if len(encoded) > MAX_RESPONSE_BODY_BYTES:
        return encoded[:MAX_RESPONSE_BODY_BYTES].decode("utf-8", errors="replace") + "\n[truncated]"
    return body


@router.post("")
async def save_history(
    payload: HistoryCreateRequest,
    x_username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /history — persist a request/response history entry for the authenticated user."""
    user_exists = (await db.execute(select(User.id).where(User.email == x_username))).scalar_one_or_none()
    if user_exists is None:
        return create_response(401, error_message="User not found")

    entry = RequestHistory(
        file_id=payload.file_id,
        workspace_id=payload.workspace_id,
        username=x_username,
        method=payload.method.upper(),
        url=payload.url,
        headers=payload.headers,
        params=payload.params,
        body=payload.body,
        response_status=payload.response_status,
        response_body=_truncate_body(payload.response_body),
        response_headers=payload.response_headers,
        execution_time_ms=payload.execution_time_ms,
    )
    db.add(entry)
    await db.commit()
    return create_response(201, data={"id": entry.id}, schema=HistorySaveResponse)


@router.get("")
async def list_history(
    file_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    x_username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /history — return paginated history entries for the user, optionally filtered by file_id, capped at 200 per page."""
    user_exists = (await db.execute(select(User.id).where(User.email == x_username))).scalar_one_or_none()
    if user_exists is None:
        return create_response(401, error_message="User not found")

    stmt = (
        select(
            RequestHistory.id,
            RequestHistory.file_id,
            RequestHistory.workspace_id,
            RequestHistory.method,
            RequestHistory.url,
            RequestHistory.response_status,
            RequestHistory.execution_time_ms,
            RequestHistory.created_at,
        )
        .where(RequestHistory.username == x_username)
        .order_by(desc(RequestHistory.created_at))
        .limit(min(limit, MAX_PAGE_SIZE))
        .offset(offset)
    )
    if file_id is not None:
        stmt = stmt.where(RequestHistory.file_id == file_id)

    entries = (await db.execute(stmt)).fetchall()

    data = [
        {
            "id": e.id,
            "file_id": e.file_id,
            "workspace_id": e.workspace_id,
            "method": e.method,
            "url": e.url,
            "response_status": e.response_status,
            "execution_time_ms": e.execution_time_ms,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]
    return create_response(200, data=data, schema=HistoryListItem)


@router.get("/{history_id}")
async def get_history_entry(
    history_id: int,
    x_username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /history/{history_id} — return the full detail of a single history entry including request body and response body."""
    user_exists = (await db.execute(select(User.id).where(User.email == x_username))).scalar_one_or_none()
    if user_exists is None:
        return create_response(401, error_message="User not found")

    result = await db.execute(
        select(RequestHistory).where(
            RequestHistory.id == history_id,
            RequestHistory.username == x_username,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return create_response(404, error_message="History entry not found")

    return create_response(200, data={
        "id": entry.id,
        "file_id": entry.file_id,
        "workspace_id": entry.workspace_id,
        "method": entry.method,
        "url": entry.url,
        "headers": entry.headers,
        "params": entry.params,
        "body": entry.body,
        "response_status": entry.response_status,
        "response_body": entry.response_body,
        "response_headers": entry.response_headers,
        "execution_time_ms": entry.execution_time_ms,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }, schema=HistoryDetailResponse)


@router.delete("/{history_id}")
async def delete_history_entry(
    history_id: int,
    x_username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /history/{history_id} — delete a single history entry owned by the authenticated user."""
    user_exists = (await db.execute(select(User.id).where(User.email == x_username))).scalar_one_or_none()
    if user_exists is None:
        return create_response(401, error_message="User not found")

    result = await db.execute(
        delete(RequestHistory).where(
            RequestHistory.id == history_id,
            RequestHistory.username == x_username,
        )
    )
    if result.rowcount == 0:
        return create_response(404, error_message="History entry not found")

    await db.commit()
    return create_response(200, message="History entry deleted")


@router.delete("/file/{file_id}")
async def clear_file_history(
    file_id: int,
    x_username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /history/file/{file_id} — delete all history entries for a file owned by the authenticated user."""
    user_exists = (await db.execute(select(User.id).where(User.email == x_username))).scalar_one_or_none()
    if user_exists is None:
        return create_response(401, error_message="User not found")

    result = await db.execute(
        delete(RequestHistory).where(
            RequestHistory.file_id == file_id,
            RequestHistory.username == x_username,
        )
    )
    await db.commit()
    return create_response(200, message=f"Cleared {result.rowcount} history entries")
