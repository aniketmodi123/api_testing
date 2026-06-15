"""
What this file does: Exposes a WebSocket endpoint at /api/ws-proxy that bidirectionally relays messages between the frontend client and a target WebSocket URL.
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws-proxy")
async def websocket_proxy(ws: WebSocket, target_url: str):
    """Bidirectional WebSocket proxy — relays messages between frontend and target_url."""
    await ws.accept()

    try:
        import websockets
    except ImportError:
        await ws.send_text('{"error":"websockets library not installed on server"}')
        await ws.close()
        return

    try:
        async with websockets.connect(target_url) as target:

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
