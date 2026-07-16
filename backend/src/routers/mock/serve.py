"""
What this file does: Serves public mock responses at /m/{public_token}/{path} with no authentication required; matches incoming requests against registered routes by method and path template.
"""
import asyncio
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select

from config import SessionLocal
from models import MockRoute, MockServer
from utils import resolve_variables

router = APIRouter()

# in-memory rate limit state: {public_token: [timestamp, ...]}
_rate_buckets: Dict[str, List[float]] = defaultdict(list)


def _match_path(route_path: str, incoming: str) -> bool:
    """What it does: Check whether a route path template matches an incoming path; {param} segments are wildcards."""
    route_parts = [p for p in route_path.split("/") if p]
    req_parts = [p for p in incoming.split("/") if p]
    if len(route_parts) != len(req_parts):
        return False
    for rp, ip in zip(route_parts, req_parts):
        if rp.startswith("{") and rp.endswith("}"):
            continue
        if rp != ip:
            return False
    return True


def _check_rate_limit(token: str, limit: int) -> bool:
    """What it does: Return True when the request is within the per-minute rate limit; prune old timestamps in-place."""
    if limit == 0:
        return True
    now = time.monotonic()
    window = _rate_buckets[token]
    # keep only timestamps within the last 60 seconds
    _rate_buckets[token] = [t for t in window if now - t < 60]
    if len(_rate_buckets[token]) >= limit:
        return False
    _rate_buckets[token].append(now)
    return True


def _build_response(route: MockRoute) -> Response:
    """What it does: Build an HTTP Response from a MockRoute, resolving dynamic tokens in the body."""
    body = route.response_body or ""
    if body:
        dyn_vars: Dict[str, Any] = {}
        body = resolve_variables(body, dyn_vars)

    headers: Dict[str, str] = {}
    if route.response_headers and isinstance(route.response_headers, dict):
        headers = {str(k): str(v) for k, v in route.response_headers.items()}

    # try to detect JSON so we can set content-type correctly
    content_type = headers.pop("content-type", headers.pop("Content-Type", None))
    if content_type is None:
        stripped = body.strip() if body else ""
        if stripped.startswith("{") or stripped.startswith("["):
            content_type = "application/json"
        else:
            content_type = "text/plain"

    return Response(
        content=body,
        status_code=route.status_code,
        headers=headers,
        media_type=content_type,
    )


@router.api_route("/m/{public_token}/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def serve_mock(public_token: str, path: str, request: Request):
    """ANY /m/{public_token}/{path} — serve a matched mock route response; no authentication required."""
    async with SessionLocal() as db:
        server = (
            await db.execute(
                select(MockServer).where(MockServer.public_token == public_token)
            )
        ).scalar_one_or_none()

        if not server:
            return JSONResponse({"error": "Mock server not found"}, status_code=404)
        if not server.enabled:
            return JSONResponse({"error": "Mock server is disabled"}, status_code=503)

        if not _check_rate_limit(public_token, server.rate_limit):
            return JSONResponse({"error": "Rate limit exceeded"}, status_code=429)

        incoming_method = request.method.upper()
        incoming_path = path.lstrip("/") if path else ""

        # DB-side method filter + priority sort; Python-side path template matching
        routes = (
            await db.execute(
                select(MockRoute)
                .where(MockRoute.server_id == server.id, MockRoute.method == incoming_method)
                .order_by(MockRoute.priority.desc())
            )
        ).scalars().all()

        matched = [r for r in routes if _match_path(r.path.lstrip("/"), incoming_path)]
        if not matched:
            return JSONResponse({"error": "No matching route"}, status_code=404)

        best = matched[0]

        if best.delay_ms > 0:
            await asyncio.sleep(best.delay_ms / 1000)

        return _build_response(best)
