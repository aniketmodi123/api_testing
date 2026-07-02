"""
What this file does: Exposes GET /api/sse-proxy?target_url= that proxies a remote SSE stream
to the client as a streaming response; SSRF-guarded.
"""
import logging
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from ssrf import assert_safe_url
from http_client import get_http_client, OUTBOUND_VERIFY_TLS

logger = logging.getLogger(__name__)
router = APIRouter()


async def _stream_sse(target_url: str):
    """What it does: Open a streaming GET to target_url and yield each raw SSE line."""
    client = get_http_client()
    async with client.stream("GET", target_url, headers={"Accept": "text/event-stream"},
                             timeout=None) as resp:
        async for line in resp.aiter_lines():
            yield (line + "\n").encode()


@router.get("/sse-proxy")
async def sse_proxy(target_url: str = Query(...)):
    """GET /api/sse-proxy — stream a remote SSE source to the client; SSRF-guarded."""
    try:
        assert_safe_url(target_url)
    except ValueError as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"error_message": str(e)})

    return StreamingResponse(
        _stream_sse(target_url),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
