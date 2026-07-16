"""
What this file does: Async HTTP client for the platform backend — owns the auth lifecycle and
maps the platform response envelope to clean errors. Two auth modes, resolved per request:

- OAuth (HTTP transport): the JWT + email come from the current MCP request's access token
  (set by the OAuth login flow). Each connected user acts as their own platform account.
- Env creds (stdio transport): lazy login via PLATFORM_EMAIL / PLATFORM_PASSWORD with a single
  401 re-login retry — the original behavior, unchanged when no OAuth context is present.

Configured via env vars: PLATFORM_BASE_URL always; PLATFORM_EMAIL / PLATFORM_PASSWORD only for
stdio mode.
"""

import os
from typing import Any, Dict, Optional

import httpx

REQUEST_TIMEOUT_SECONDS = 30.0


def _context_auth() -> Optional[tuple]:
    """What it does: Return (platform_jwt, email) for the OAuth user of the current MCP request.

    Delegates to the OAuth provider's context lookup; returns None in stdio mode (no auth
    middleware) so the env-cred path stays byte-for-byte unchanged.
    """
    try:
        from .oauth_provider import context_auth
    except ImportError:  # direct `python server.py` without package context
        try:
            from oauth_provider import context_auth  # type: ignore
        except ImportError:
            return None
    return context_auth()


class PlatformError(Exception):
    """Raised when the platform returns an error envelope or a non-2xx response.

    Attributes:
        response_code: HTTP/envelope status code from the platform.
        error_message: Human-readable error string from the envelope.
        errors: Validation error list from the envelope; None when absent.
    """

    def __init__(self, response_code: int, error_message: str, errors: Optional[list] = None):
        self.response_code = response_code
        self.error_message = error_message
        self.errors = errors
        detail = f"Platform error {response_code}: {error_message}"
        if errors:
            detail += f" | validation errors: {errors}"
        super().__init__(detail)


class PlatformConfigError(Exception):
    """Raised when a required env var is missing."""


class PlatformClient:
    """Talk to the platform backend with the JWT + username header auth pattern.

    Every request carries `Authorization: Bearer <JWT>` and `username: <email>`.
    Login happens lazily on first call; a 401 triggers exactly one re-login + retry.
    """

    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def base_url(self) -> str:
        url = os.environ.get("PLATFORM_BASE_URL")
        if not url:
            raise PlatformConfigError("PLATFORM_BASE_URL env var is not set")
        return url.rstrip("/")

    @property
    def email(self) -> str:
        email = os.environ.get("PLATFORM_EMAIL")
        if not email:
            raise PlatformConfigError("PLATFORM_EMAIL env var is not set")
        return email

    @property
    def _password(self) -> str:
        password = os.environ.get("PLATFORM_PASSWORD")
        if not password:
            raise PlatformConfigError("PLATFORM_PASSWORD env var is not set")
        return password

    async def _get_client(self) -> httpx.AsyncClient:
        """What it does: Return the shared AsyncClient, creating it on first use."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url, timeout=REQUEST_TIMEOUT_SECONDS
            )
        return self._client

    async def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def login(self) -> str:
        """Authenticate against POST /sign_in and cache the JWT in memory.

        Returns:
            str: The authenticated username (email) on success.

        Raises:
            PlatformError: When credentials are rejected or the envelope carries an error.
        """
        client = await self._get_client()
        resp = await client.post(
            "/sign_in", json={"email": self.email, "password": self._password}
        )
        envelope = self._parse_envelope(resp)
        data = envelope.get("data") or {}
        token = data.get("access_token")
        if not token:
            raise PlatformError(
                envelope.get("response_code", resp.status_code),
                "Login succeeded but no access_token in response",
            )
        self._token = token
        return self.email

    @staticmethod
    def _parse_envelope(resp: httpx.Response) -> Dict[str, Any]:
        """What it does: Decode the platform envelope and raise PlatformError on any error signal."""
        try:
            envelope = resp.json()
        except ValueError:
            raise PlatformError(resp.status_code, f"Non-JSON response: {resp.text[:200]}")
        if not isinstance(envelope, dict):
            raise PlatformError(resp.status_code, f"Unexpected response shape: {envelope!r}"[:300])
        code = envelope.get("response_code", resp.status_code)
        # error_message / errors presence or non-2xx status = error contract
        if resp.status_code >= 400 or envelope.get("error_message") or envelope.get("errors"):
            raise PlatformError(
                code,
                envelope.get("error_message") or envelope.get("detail") or "Request failed",
                envelope.get("errors"),
            )
        return envelope

    async def request(
        self,
        method: str,
        path: str,
        json: Any = None,
        params: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        _retry: bool = True,
    ) -> Dict[str, Any]:
        """Send an authenticated request and return the parsed platform envelope.

        Args:
            extra_headers: Additional per-route headers (e.g. ``workspace_id``); ``None`` sends none.

        Returns:
            dict: Full platform envelope (``response_code``, optional ``data``/``message``/``pagination``).

        Raises:
            PlatformError: On non-2xx status or an envelope carrying ``error_message``/``errors``.
        """
        ctx = _context_auth()

        if ctx is not None:
            # OAuth mode: use the current user's JWT; never fall back to env creds.
            token, email = ctx
        else:
            # stdio mode: lazy env-cred login.
            if self._token is None:
                await self.login()
            token, email = self._token, self.email

        headers = {
            "Authorization": f"Bearer {token}",
            "username": email,
        }
        if extra_headers:
            headers.update(extra_headers)

        client = await self._get_client()
        resp = await client.request(method, path, json=json, params=params, headers=headers)

        if resp.status_code == 401:
            if ctx is not None:
                # No credentials to re-login with — the user's platform session ended elsewhere.
                raise PlatformError(
                    401,
                    "Platform session expired or logged out elsewhere — re-authenticate this "
                    "MCP server in your client and retry.",
                )
            if _retry:
                # Env-cred mode: one re-login + retry, then give up.
                self._token = None
                await self.login()
                return await self.request(
                    method, path, json=json, params=params, extra_headers=extra_headers, _retry=False
                )

        return self._parse_envelope(resp)


# Single shared client instance for the server process
client = PlatformClient()
