"""
What this file does: Builds auth injection dicts (headers/params) for each supported auth type;
AWS SigV4 signing and JWT generation are performed here using only stdlib + PyJWT + cryptography.
"""

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse, quote

import vault


# ---------------------------------------------------------------------------
# Secret decryption helper
# ---------------------------------------------------------------------------

def _dec(value: str) -> str:
    """What it does: Decrypt a vault ciphertext or return the value unchanged when not encrypted."""
    return vault.decrypt(value) if vault.is_ciphertext(value) else value


# ---------------------------------------------------------------------------
# Simple strategies — apikey, bearer, basic
# ---------------------------------------------------------------------------

def build_apikey_auth(config: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    What it does: Build header and query-param injection dicts for API-key auth.
    Args:
        config: Auth config dict with keys ``key``, ``value``, and optionally ``in`` (``"header"`` or ``"query"``).
    Returns:
        tuple: ``(extra_headers, extra_params)`` — one will be populated and the other empty.
    """
    key_name = config["key"]
    key_value = _dec(config["value"])
    placement = config.get("in", config.get("in_", "header"))

    if placement == "query":
        return {}, {key_name: key_value}
    return {key_name: key_value}, {}


def build_bearer_auth(config: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    What it does: Build the Authorization header for Bearer token auth.
    Args:
        config: Auth config dict with key ``token``.
    Returns:
        tuple: ``({"Authorization": "Bearer <token>"}, {})``
    """
    token = _dec(config["token"])
    return {"Authorization": f"Bearer {token}"}, {}


def build_basic_auth(config: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    What it does: Build the Authorization header for HTTP Basic auth, encoding username:password as UTF-8 base64.
    Args:
        config: Auth config dict with keys ``username`` and ``password``.
    Returns:
        tuple: ``({"Authorization": "Basic <b64>"}, {})``
    """
    username = config["username"]
    password = _dec(config["password"])
    encoded = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {encoded}"}, {}


# ---------------------------------------------------------------------------
# JWT builder
# ---------------------------------------------------------------------------

def build_jwt_auth(config: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    What it does: Sign a JWT from the config claims and return the injection header.
    Args:
        config: Auth config dict with keys ``secret``, ``algorithm``, ``payload``,
                ``header_name``, and ``header_prefix``.
    Returns:
        tuple: ``({header_name: "<prefix> <jwt>"}, {})`` — prefix omitted when empty string.
    Raises:
        ImportError: When PyJWT is not installed in the environment.
    """
    try:
        import jwt as pyjwt  # PyJWT
    except ImportError as exc:
        raise ImportError("PyJWT is required for JWT auth — pip install PyJWT") from exc

    secret = _dec(config["secret"])
    algorithm = config.get("algorithm", "HS256")
    payload = dict(config.get("payload") or {})
    header_name = config.get("header_name", "Authorization")
    prefix = config.get("header_prefix", "Bearer")

    token = pyjwt.encode(payload, secret, algorithm=algorithm)
    value = f"{prefix} {token}".strip() if prefix else token
    return {header_name: value}, {}


# ---------------------------------------------------------------------------
# AWS SigV4 signer (hand-rolled — no boto3 dependency)
# ---------------------------------------------------------------------------

def _sha256_hex(data: bytes) -> str:
    """What it does: Return the lowercase hex SHA-256 digest of data."""
    return hashlib.sha256(data).hexdigest()


def _hmac_sha256(key: bytes, msg: str) -> bytes:
    """What it does: Return the HMAC-SHA256 of msg signed with key bytes."""
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _aws_signing_key(secret_key: str, date_stamp: str, region: str, service: str) -> bytes:
    """What it does: Derive the AWS SigV4 signing key from the secret and request scope."""
    k_date = _hmac_sha256(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    k_region = _hmac_sha256(k_date, region)
    k_service = _hmac_sha256(k_region, service)
    return _hmac_sha256(k_service, "aws4_request")


def build_aws_sigv4_auth(
    config: Dict[str, Any],
    method: str,
    url: str,
    headers: Dict[str, str],
    body: Optional[bytes] = None,
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    What it does: Compute AWS Signature Version 4 and return the Authorization + x-amz-date headers.
    Args:
        config: Auth config dict with keys ``access_key``, ``secret_key``, ``region``, ``service``.
        method: HTTP method in uppercase (e.g. ``"GET"``).
        url: Full request URL including query string.
        headers: Existing request headers dict; used to include host in the signed set.
        body: Raw request body bytes; ``None`` treated as empty body.
    Returns:
        tuple: ``({"Authorization": "...", "x-amz-date": "..."}, {})``
    Notes:
        - Uses server UTC time for the timestamp to avoid clock-skew signature rejection.
    """
    access_key = _dec(config["access_key"])
    secret_key = _dec(config["secret_key"])
    region = config["region"]
    service = config["service"]

    # Server UTC timestamp — avoids clock-skew rejection
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    parsed = urlparse(url)
    host = parsed.netloc
    canonical_uri = quote(parsed.path or "/", safe="/-._~")
    canonical_querystring = parsed.query  # already encoded by caller

    # Build canonical headers — host + x-amz-date always signed
    signed_headers_map = {
        "host": host,
        "x-amz-date": amz_date,
    }
    canonical_headers = "".join(f"{k}:{v}\n" for k, v in sorted(signed_headers_map.items()))
    signed_headers_str = ";".join(sorted(signed_headers_map.keys()))

    payload_hash = _sha256_hex(body or b"")
    canonical_request = "\n".join([
        method.upper(),
        canonical_uri,
        canonical_querystring,
        canonical_headers,
        signed_headers_str,
        payload_hash,
    ])

    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        _sha256_hex(canonical_request.encode("utf-8")),
    ])

    signing_key = _aws_signing_key(secret_key, date_stamp, region, service)
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    auth_header = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers_str}, Signature={signature}"
    )
    return {"Authorization": auth_header, "x-amz-date": amz_date}, {}


# ---------------------------------------------------------------------------
# Dispatcher — resolve config dict → (extra_headers, extra_params)
# ---------------------------------------------------------------------------

def apply_auth(
    auth_config: Optional[Dict[str, Any]],
    method: str = "GET",
    url: str = "",
    existing_headers: Optional[Dict[str, str]] = None,
    body_bytes: Optional[bytes] = None,
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    What it does: Dispatch to the correct builder based on auth_config type and return header/param injection dicts.
    Args:
        auth_config: Dict with ``type`` and ``config`` keys as stored in Api.extra_meta.auth;
                     ``None`` or ``{"type": "none"}`` returns empty dicts.
        method: HTTP method string; required for AWS SigV4 signing.
        url: Full request URL; required for AWS SigV4 signing.
        existing_headers: Current headers dict; passed to SigV4 builder.
        body_bytes: Raw body bytes; ``None`` treated as empty for signing purposes.
    Returns:
        tuple: ``(extra_headers, extra_params)`` to merge into the outbound request.
    """
    if not auth_config:
        return {}, {}

    auth_type = auth_config.get("type", "none")
    config = auth_config.get("config", {})

    if auth_type == "none" or not config:
        return {}, {}

    if auth_type == "apikey":
        return build_apikey_auth(config)

    if auth_type == "bearer":
        return build_bearer_auth(config)

    if auth_type == "basic":
        return build_basic_auth(config)

    if auth_type == "jwt":
        return build_jwt_auth(config)

    if auth_type == "aws_sigv4":
        return build_aws_sigv4_auth(
            config,
            method=method,
            url=url,
            headers=existing_headers or {},
            body=body_bytes,
        )

    # oauth2: injected via apply_auth_async when a DB session is available
    return {}, {}


async def apply_auth_async(
    auth_config: Optional[Dict[str, Any]],
    method: str = "GET",
    url: str = "",
    existing_headers: Optional[Dict[str, str]] = None,
    body_bytes: Optional[bytes] = None,
    db=None,
    owner_username: Optional[str] = None,
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    What it does: Async variant of apply_auth that additionally handles oauth2 by loading the cached token from DB.
    Args:
        auth_config: Dict with ``type`` and ``config`` keys as stored in Api.extra_meta.auth;
                     ``None`` or ``{"type": "none"}`` returns empty dicts.
        method: HTTP method string; required for AWS SigV4 signing.
        url: Full request URL; required for AWS SigV4 signing.
        existing_headers: Current headers dict; passed to SigV4 builder.
        body_bytes: Raw body bytes; ``None`` treated as empty for signing purposes.
        db: Async SQLAlchemy session; required only when auth_type is ``"oauth2"``.
        owner_username: Username of the caller; required only when auth_type is ``"oauth2"``.
    Returns:
        tuple: ``(extra_headers, extra_params)`` to merge into the outbound request.
    """
    if not auth_config:
        return {}, {}

    auth_type = auth_config.get("type", "none")

    if auth_type != "oauth2":
        return apply_auth(auth_config, method=method, url=url, existing_headers=existing_headers, body_bytes=body_bytes)

    # oauth2: load cached token from DB and inject as Bearer
    if db is None or not owner_username:
        return {}, {}

    config = auth_config.get("config", {})
    from routers.auth.oauth2 import _make_auth_ref, _token_expired
    from models import OAuthToken
    from sqlalchemy import select

    auth_ref = _make_auth_ref(
        config.get("client_id", ""),
        config.get("scope", ""),
        config.get("token_url", ""),
    )

    result = await db.execute(
        select(OAuthToken).where(
            OAuthToken.owner_username == owner_username,
            OAuthToken.auth_ref == auth_ref,
        )
    )
    token = result.scalar_one_or_none()

    if not token or _token_expired(token):
        # Token missing or expired — caller should have pre-fetched via POST /auth/oauth2/token
        return {}, {}

    raw_access = vault.decrypt(token.access_token)
    token_type = token.token_type or "Bearer"
    return {"Authorization": f"{token_type} {raw_access}"}, {}
