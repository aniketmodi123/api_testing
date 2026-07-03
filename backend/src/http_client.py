"""
What this file does: Provides a single shared AsyncClient instance for all outbound HTTP
requests; TLS verification is controlled by OUTBOUND_VERIFY_TLS env var (default True).
"""

import os
import httpx

# False only when explicitly set to "false" (case-insensitive); default is True.
OUTBOUND_VERIFY_TLS: bool = os.environ.get("OUTBOUND_VERIFY_TLS", "true").lower() != "false"

_client: "httpx.AsyncClient | None" = None


def get_http_client() -> httpx.AsyncClient:
    """
    What it does: Return the module-level shared AsyncClient, creating it on first call.
    Returns:
        httpx.AsyncClient: Pooled client with project-wide timeout and TLS settings.
    Notes:
        - Call close_http_client() on application shutdown to drain connections cleanly.
    """
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            verify=OUTBOUND_VERIFY_TLS,
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
        )
    return _client


async def close_http_client() -> None:
    """What it does: Close the shared AsyncClient and release pooled connections."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
