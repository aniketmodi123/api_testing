"""
What this file does: Exposes GET /api/ws-ticket (mints a short-lived auth ticket) and the
WebSocket endpoint /api/ws-proxy that bidirectionally relays messages between the frontend
client and a target WebSocket URL.
"""
import asyncio
import logging
from dateutil.relativedelta import relativedelta
from jose import JWTError, jwt

from fastapi import APIRouter, Depends, Header, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ssrf import assert_safe_url
from config import JWT_ALGORITHM, JWT_SECRET_KEY, get_db
from models import User
from utils import create_access_token, create_response
from schema import WsTicketResponse

try:
    import websockets as _websockets
except ImportError:
    _websockets = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
router = APIRouter()

_TICKET_SCOPE = "ws_proxy"
_TICKET_TTL_SECONDS = 30


@router.get("/ws-ticket")
async def issue_ws_ticket(username: str = Header(...), db: AsyncSession = Depends(get_db)):
    """GET /api/ws-ticket — mint a 30s-lived ticket so the WebSocket proxy (which the global
    JWT middleware never sees, since BaseHTTPMiddleware skips websocket scope) can verify the
    caller without the browser's native WebSocket API needing to send custom headers."""
    exists = await db.scalar(select(User.id).where(User.username == username))
    if exists is None:
        return create_response(400, error_message="User not found")

    ticket = await create_access_token(
        {"username": username, "scope": _TICKET_SCOPE},
        expires_delta=relativedelta(seconds=_TICKET_TTL_SECONDS),
    )
    return create_response(200, data={"ticket": ticket}, schema=WsTicketResponse)


def _verify_ticket(ticket: str) -> bool:
    """What it does: Return True when ticket is a non-expired JWT minted with ws_proxy scope.

    Notes:
        - No persistent single-use tracking — the 30s TTL is the only replay defense. A wider
          window would need a DB-backed burn (e.g. the Cache blacklist table); deferred since
          this proxy only lets the ticket holder relay to a target THEY choose, not read other
          users' data.
    """
    try:
        payload = jwt.decode(ticket, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return False
    return payload.get("scope") == _TICKET_SCOPE and bool(payload.get("username"))


@router.websocket("/ws-proxy")
async def websocket_proxy(ws: WebSocket, target_url: str, ticket: str):
    """Bidirectional WebSocket proxy — relays messages between frontend and target_url."""
    await ws.accept()

    if not _verify_ticket(ticket):
        await ws.send_text('{"error":"Unauthorized: invalid or expired ticket"}')
        await ws.close(code=1008)
        return

    if _websockets is None:
        await ws.send_text('{"error":"websockets library not installed on server"}')
        await ws.close()
        return

    try:
        assert_safe_url(target_url)
        async with _websockets.connect(target_url, open_timeout=10) as target:

            async def relay_to_target():
                try:
                    while True:
                        msg = await ws.receive_text()
                        await target.send(msg)
                except (WebSocketDisconnect, Exception):
                    pass

            async def relay_to_client():
                try:
                    async for msg in target:
                        text = msg if isinstance(msg, str) else msg.decode("utf-8", errors="replace")
                        await ws.send_text(text)
                except Exception:
                    pass

            await asyncio.gather(relay_to_target(), relay_to_client())

    except Exception as e:
        logger.warning("ws_proxy error for %s: %s", target_url, e)
        try:
            await ws.send_text(f'{{"error":"Connection failed: {str(e)}"}}')
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass
