"""
What this file does: Auth for the remote (HTTP) MCP server. The server is a pure OAuth2 *resource
server* — it does NOT run an authorization server or a browser login flow. Clients authenticate
with a Personal Access Token (PAT) sent as `Authorization: Bearer apipat_...`, which works in every
MCP-capable agent/IDE (Claude, Cursor, VS Code, Antigravity, Codex, CI) via a plain headers config.

Two pieces:
- ApiPilotTokenVerifier: validates a bearer PAT by exchanging it (via the platform's POST /pat/token)
  for a short-lived JWT, cached and silently re-exchanged near expiry. The JWT + email are carried on
  the returned token so tool calls can authenticate to the platform.
- A self-serve token page (GET / + POST /issue-token): log in once, mint a PAT, copy a paste-ready
  client config. This is the only UI; there is no /authorize redirect flow.
"""

import base64
import binascii
import html
import json
import logging
import time
from typing import Dict, Optional, Tuple

import httpx
from mcp.server.auth.provider import AccessToken, TokenVerifier
from starlette.requests import Request
from starlette.responses import HTMLResponse, Response

logger = logging.getLogger(__name__)

# Personal Access Tokens carry this prefix (must match the backend). Any bearer token without it
# is not one of ours and is rejected.
PAT_PREFIX = "apipat_"
# Re-exchange a PAT's cached JWT this many seconds before it expires, so calls never see a 401.
PAT_REFRESH_MARGIN_SECONDS = 120
# Fallback access-token lifetime when the platform JWT carries no readable `exp`.
DEFAULT_TOKEN_TTL_SECONDS = 6 * 24 * 3600  # 6 days (platform JWT is 7)

REQUEST_TIMEOUT_SECONDS = 30.0


class PlatformAccessToken(AccessToken):
    """Access token bound to a platform JWT + owning email, used to auth platform calls.

    The extra fields are never rendered to the client — the SDK passes the object through
    unchanged (see mcp/server/auth/provider.py:103).
    """

    platform_token: str
    username: str


def _jwt_exp(token: str) -> Optional[int]:
    """What it does: Read `exp` (unix seconds) from a JWT payload without verifying the signature.

    Verification is the platform's job; we only need the lifetime to align our token's expiry with
    the wrapped JWT. Returns None if the payload can't be decoded.
    """
    try:
        payload_b64 = token.split(".")[1]
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
    except (IndexError, ValueError, binascii.Error):
        return None
    exp = payload.get("exp")
    return int(exp) if isinstance(exp, (int, float)) else None


class _SignInError(Exception):
    """Carries a user-safe message for a failed platform login."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ApiPilotTokenVerifier(TokenVerifier):
    """Resource-server token verifier: validates a bearer PAT and exposes the token-issuing page.

    A PAT is long-lived (until revoked); the underlying platform JWT is refreshed transparently, so
    pasting a PAT once keeps a client connected indefinitely.
    """

    def __init__(self, platform_base_url: str, public_url: str) -> None:
        self._platform_base_url = platform_base_url.rstrip("/")
        self._public_url = public_url.rstrip("/")
        # PAT -> wrapped JWT. Rebuildable from the PAT on demand, so a restart just re-exchanges.
        self._pat_cache: Dict[str, PlatformAccessToken] = {}

    async def verify_token(self, token: str) -> Optional[PlatformAccessToken]:
        """Validate a bearer token; only PATs are accepted."""
        if not token.startswith(PAT_PREFIX):
            return None
        return await self._load_pat(token)

    async def _load_pat(self, pat: str) -> Optional[PlatformAccessToken]:
        """What it does: Resolve a PAT to a live access token, re-exchanging its JWT when stale."""
        now = int(time.time())
        cached = self._pat_cache.get(pat)
        if cached is not None and cached.expires_at and cached.expires_at > now + PAT_REFRESH_MARGIN_SECONDS:
            return cached

        exchanged = await self._exchange_pat(pat)
        if exchanged is None:
            self._pat_cache.pop(pat, None)
            return None
        platform_token, username = exchanged
        expires_at = _jwt_exp(platform_token) or (now + DEFAULT_TOKEN_TTL_SECONDS)
        access = PlatformAccessToken(
            token=pat,
            client_id="pat",
            scopes=[],
            expires_at=expires_at,
            platform_token=platform_token,
            username=username,
        )
        self._pat_cache[pat] = access
        return access

    async def _exchange_pat(self, pat: str) -> Optional[Tuple[str, str]]:
        """What it does: POST a PAT to the platform and return (jwt, email), or None if rejected."""
        try:
            async with httpx.AsyncClient(base_url=self._platform_base_url, timeout=REQUEST_TIMEOUT_SECONDS) as c:
                resp = await c.post("/pat/token", json={"token": pat})
        except httpx.HTTPError as exc:
            logger.error("PAT exchange transport error: %s", exc)
            return None
        if resp.status_code != 200:
            return None
        try:
            data = (resp.json() or {}).get("data") or {}
        except ValueError:
            return None
        jwt, username = data.get("access_token"), data.get("username")
        if jwt and username:
            return jwt, username
        return None

    # ---------- token-issuing page (the only UI) ----------

    def register_routes(self, mcp) -> None:
        """Mount the self-serve token page (public) on the FastMCP instance."""
        mcp.custom_route("/", methods=["GET"], include_in_schema=False)(self._token_page_get)
        mcp.custom_route("/issue-token", methods=["POST"], include_in_schema=False)(self._issue_token_post)

    async def _token_page_get(self, request: Request) -> Response:
        return HTMLResponse(_render_token_page())

    async def _issue_token_post(self, request: Request) -> Response:
        """Log the user in, mint a PAT on their behalf, and show it with a paste-ready config."""
        form = await request.form()
        email = str(form.get("email", "")).strip()
        password = str(form.get("password", ""))
        if not email or not password:
            return HTMLResponse(_render_token_page(error="Enter both email and password."), status_code=400)

        try:
            jwt = await self._platform_sign_in(email, password)
            pat = await self._create_pat(jwt, email, name="mcp-client")
        except _SignInError as exc:
            return HTMLResponse(_render_token_page(error=exc.message), status_code=401)

        return HTMLResponse(_render_token_result(pat, self._public_url))

    async def _platform_sign_in(self, email: str, password: str) -> str:
        """What it does: POST credentials to the platform and return the platform JWT, or raise.

        Never logs the password. Raises _SignInError with a user-safe message on any failure.
        """
        try:
            async with httpx.AsyncClient(base_url=self._platform_base_url, timeout=REQUEST_TIMEOUT_SECONDS) as c:
                resp = await c.post("/sign_in", json={"email": email, "password": password})
        except httpx.HTTPError as exc:
            logger.error("Platform sign_in transport error for %s: %s", email, exc)
            raise _SignInError("Could not reach the platform. Try again shortly.")

        try:
            envelope = resp.json()
        except ValueError:
            logger.error("Platform sign_in non-JSON response (status %s) for %s", resp.status_code, email)
            raise _SignInError("Unexpected response from the platform.")

        if resp.status_code >= 400 or not isinstance(envelope, dict) or envelope.get("error_message"):
            msg = (isinstance(envelope, dict) and envelope.get("error_message")) or "Invalid email or password."
            raise _SignInError(str(msg))

        token = (envelope.get("data") or {}).get("access_token")
        if not token:
            logger.error("Platform sign_in ok but no access_token for %s", email)
            raise _SignInError("Login succeeded but no session was issued.")
        return token

    async def _create_pat(self, jwt: str, email: str, name: str) -> str:
        """What it does: Create a PAT via the platform on the user's behalf and return the raw token."""
        try:
            async with httpx.AsyncClient(base_url=self._platform_base_url, timeout=REQUEST_TIMEOUT_SECONDS) as c:
                resp = await c.post(
                    "/pat",
                    json={"name": name},
                    headers={"Authorization": f"Bearer {jwt}", "username": email},
                )
        except httpx.HTTPError as exc:
            logger.error("PAT create transport error for %s: %s", email, exc)
            raise _SignInError("Could not reach the platform. Try again shortly.")

        try:
            data = (resp.json() or {}).get("data") or {}
        except ValueError:
            raise _SignInError("Unexpected response from the platform.")
        token = data.get("token")
        if resp.status_code >= 400 or not token:
            logger.error("PAT create failed (status %s) for %s", resp.status_code, email)
            raise _SignInError("Could not issue a token. Try again.")
        return token


def context_auth() -> Optional[Tuple[str, str]]:
    """What it does: Return (platform_jwt, email) for the authenticated user of the current request.

    Reads the access token the bearer-auth middleware stashed in the request contextvar. Returns
    None in stdio mode (no auth middleware) or when the token isn't one of ours.
    """
    try:
        from mcp.server.auth.middleware.auth_context import get_access_token

        token = get_access_token()
    except Exception:
        return None
    if token is None:
        return None
    platform_token = getattr(token, "platform_token", None)
    username = getattr(token, "username", None)
    if platform_token and username:
        return platform_token, username
    return None


# ---------- token page markup ----------

_PAGE_STYLE = """
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center;
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #0e1116; color: #e6e9ef; padding: 24px; }
.card { width: 100%; max-width: 380px; background: #171b22; border: 1px solid #262b34;
  border-radius: 14px; padding: 32px 28px; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
.card.wide { max-width: 560px; }
h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: -.01em; }
p.sub { margin: 0 0 24px; color: #8b93a1; font-size: 13px; }
label { display: block; font-size: 12px; color: #8b93a1; margin: 0 0 6px; }
input { width: 100%; padding: 11px 12px; margin: 0 0 16px; border-radius: 9px;
  border: 1px solid #2b313b; background: #0e1116; color: #e6e9ef; font-size: 14px; }
input:focus { outline: none; border-color: #4c7dff; }
button { width: 100%; padding: 12px; border: 0; border-radius: 9px; cursor: pointer;
  background: #4c7dff; color: #fff; font-size: 14px; font-weight: 600; }
button:hover { background: #3d6bef; }
.err { background: #2a1418; border: 1px solid #5a2530; color: #ff9aa6;
  padding: 10px 12px; border-radius: 9px; font-size: 13px; margin: 0 0 16px; }
.brand { font-weight: 700; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: #0e1116; border: 1px solid #2b313b; border-radius: 9px; padding: 14px;
  font-size: 12.5px; color: #cbd3e1; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
.token { display: block; background: #0e1116; border: 1px solid #4c7dff; border-radius: 9px;
  padding: 12px; font-size: 13px; color: #9ec1ff; margin: 0 0 8px; word-break: break-all; }
.warn { color: #ffce85; font-size: 12.5px; margin: 0 0 20px; }
h2 { font-size: 13px; color: #8b93a1; margin: 22px 0 8px; font-weight: 600; }
""".strip()


def _render_token_page(error: str = "") -> str:
    """What it does: Render the self-serve login form that mints a Personal Access Token."""
    error_block = f'<div class="err">{html.escape(error)}</div>' if error else ""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect a client — ApiPilot</title><style>{_PAGE_STYLE}</style></head>
<body><form class="card" method="post" action="issue-token" autocomplete="off">
<h1><span class="brand">ApiPilot</span> access token</h1>
<p class="sub">Sign in to generate a token, then paste it into any MCP client
(Claude, Cursor, VS Code, Antigravity, Codex).</p>
{error_block}
<label for="email">Email</label>
<input id="email" name="email" type="email" required autofocus autocomplete="off">
<label for="password">Password</label>
<input id="password" name="password" type="password" required autocomplete="off">
<button type="submit">Generate token</button>
</form></body></html>"""


def _render_token_result(token: str, public_url: str) -> str:
    """What it does: Show the freshly minted PAT once, with a ready-to-paste client config."""
    tok = html.escape(token)
    url = html.escape(public_url)
    generic = html.escape(
        json.dumps(
            {"mcpServers": {"apipilot": {"url": f"{public_url}/mcp", "headers": {"Authorization": f"Bearer {token}"}}}},
            indent=2,
        )
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Token created — ApiPilot</title><style>{_PAGE_STYLE}</style></head>
<body><div class="card wide">
<h1>Token created</h1>
<p class="warn">Copy it now — it is shown once and cannot be retrieved again.</p>
<code class="token">{tok}</code>
<h2>Paste into any MCP client config</h2>
<pre>{generic}</pre>
<p class="sub">Same JSON shape everywhere — just the URL <code>{url}/mcp</code> and this token.
Revoke anytime from the platform.</p>
</div></body></html>"""
