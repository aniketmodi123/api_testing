"""
What this file does: Converts cURL command strings to request dicts and request dicts back to cURL strings; no auth required, pure transformation.
"""

import base64
import json
import shlex
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import get_user_by_username
from config import get_db
from utils import ExceptionHandler, create_response

router = APIRouter()


# ---------- Pydantic schemas ----------

class CurlToRequestBody(BaseModel):
    """Request body for POST /curl/to-request.

    Attributes:
        curl: Raw cURL command string (single or multi-line with backslash continuation).
    """

    curl: str


class RequestToCurlBody(BaseModel):
    """Request body for POST /request/to-curl.

    Attributes:
        method: HTTP method (GET, POST, etc.).
        url: Full request URL.
        headers: Dict of header name → value; ``None`` when no custom headers.
        params: Dict of query param name → value; ``None`` when no params.
        body: Request body dict; ``None`` when no body.
        body_type: ``"json"`` (default) or ``"form"``; controls Content-Type and encoding.
    """

    method: str
    url: str
    headers: Optional[Dict[str, str]] = None
    params: Optional[Dict[str, str]] = None
    body: Optional[Any] = None
    body_type: str = "json"


class CurlToRequestResponse(BaseModel):
    """Represent a parsed cURL command from POST /curl/to-request.

    Attributes:
        method: HTTP method inferred or parsed from -X/--request.
        url: Request URL with query string stripped.
        headers: Parsed -H/--header entries; empty dict when none.
        params: Query params split from the URL; empty dict when none.
        body: Parsed JSON body, or raw string when not valid JSON; ``None`` when no body.
    """

    method: str
    url: str
    headers: Dict[str, str]
    params: Dict[str, str]
    body: Optional[Any] = None


class RequestToCurlResponse(BaseModel):
    """Represent a built cURL command from POST /request/to-curl.

    Attributes:
        curl: The constructed cURL command string.
    """

    curl: str


# ---------- Helpers ----------

def _normalise_curl(raw: str) -> str:
    """What it does: Strip backslash-newline continuations and collapse extra whitespace from a multi-line cURL."""
    return " ".join(raw.replace("\\\n", " ").replace("\\\r\n", " ").split())


def _parse_curl(raw: str) -> Dict[str, Any]:
    """What it does: Parse a cURL command string into {method, url, headers, params, body}; raise ValueError on unsupported patterns."""
    normalised = _normalise_curl(raw)
    try:
        tokens = shlex.split(normalised)
    except ValueError as e:
        raise ValueError(f"cURL parse failed: {e}")

    if not tokens or tokens[0].lower() != "curl":
        raise ValueError("Command must start with 'curl'")

    method: Optional[str] = None
    url: Optional[str] = None
    headers: Dict[str, str] = {}
    body_str: Optional[str] = None

    i = 1
    while i < len(tokens):
        tok = tokens[i]

        if tok in ("-X", "--request") and i + 1 < len(tokens):
            method = tokens[i + 1].upper()
            i += 2

        elif tok in ("-H", "--header") and i + 1 < len(tokens):
            header_raw = tokens[i + 1]
            if ":" in header_raw:
                key, _, val = header_raw.partition(":")
                headers[key.strip()] = val.strip()
            i += 2

        elif tok in ("-d", "--data", "--data-raw", "--data-ascii") and i + 1 < len(tokens):
            body_str = tokens[i + 1]
            i += 2

        elif tok == "--data-binary" and i + 1 < len(tokens):
            val = tokens[i + 1]
            if val.startswith("@"):
                raise ValueError("File-based body not supported (--data-binary @file)")
            body_str = val
            i += 2

        elif tok in ("-u", "--user") and i + 1 < len(tokens):
            # basic auth → Authorization header
            encoded = base64.b64encode(tokens[i + 1].encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"
            i += 2

        elif tok in ("--compressed", "--silent", "-s", "-v", "--verbose", "-L", "--location"):
            i += 1  # ignore flags with no effect on request data

        elif tok.startswith("-"):
            # skip unknown flag + its value if it looks like a value (no leading -)
            i += 1
            if i < len(tokens) and not tokens[i].startswith("-"):
                i += 1

        else:
            # positional — URL
            if url is None:
                url = tok
            i += 1

    if not url:
        raise ValueError("No URL found in cURL command")

    # Infer method from body presence
    if method is None:
        method = "POST" if body_str else "GET"

    # Split URL query params
    params: Dict[str, str] = {}
    if "?" in url:
        url_base, _, qs = url.partition("?")
        for pair in qs.split("&"):
            if "=" in pair:
                k, _, v = pair.partition("=")
                params[k] = v
        url = url_base

    # Parse body
    body: Optional[Any] = None
    if body_str:
        try:
            body = json.loads(body_str)
        except json.JSONDecodeError:
            body = body_str  # keep as raw string

    return {
        "method": method,
        "url": url,
        "headers": headers,
        "params": params,
        "body": body,
    }


def _build_curl(method: str, url: str, headers: Dict[str, str], params: Dict[str, str], body: Any, body_type: str) -> str:
    """What it does: Construct a cURL command string from request components."""
    parts = ["curl", "-X", method.upper()]

    for k, v in (headers or {}).items():
        parts += ["-H", shlex.quote(f"{k}: {v}")]

    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        full_url = f"{url}?{qs}"
    else:
        full_url = url

    if body is not None:
        if body_type == "form" and isinstance(body, dict):
            body_str = "&".join(f"{k}={v}" for k, v in body.items())
            if "Content-Type" not in (headers or {}):
                parts += ["-H", "Content-Type: application/x-www-form-urlencoded"]
        else:
            body_str = json.dumps(body) if not isinstance(body, str) else body
            if "Content-Type" not in (headers or {}):
                parts += ["-H", "Content-Type: application/json"]
        parts += ["-d", shlex.quote(body_str)]

    parts.append(shlex.quote(full_url))
    return " ".join(parts)


# ---------- Route handlers ----------

@router.post("/curl/to-request")
async def curl_to_request(
    payload: CurlToRequestBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /curl/to-request — parse a cURL command string into method, url, headers, params, body."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        try:
            result = _parse_curl(payload.curl)
        except ValueError as e:
            return create_response(400, error_message=str(e))

        return create_response(200, data=result, schema=CurlToRequestResponse)
    except Exception as e:
        return ExceptionHandler(e)


@router.post("/request/to-curl")
async def request_to_curl(
    payload: RequestToCurlBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /request/to-curl — convert request components to a cURL command string."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        curl_str = _build_curl(
            payload.method,
            payload.url,
            payload.headers or {},
            payload.params or {},
            payload.body,
            payload.body_type,
        )
        return create_response(200, data={"curl": curl_str}, schema=RequestToCurlResponse)
    except Exception as e:
        return ExceptionHandler(e)
