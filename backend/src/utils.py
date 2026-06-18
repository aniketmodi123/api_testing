"""
What this file does: Provides shared utilities for logging, password hashing, JWT token management,
response building, OTP email delivery, and {{VAR}} variable resolution across all routers;
SMTP credentials are read from environment variables.
"""

from time import time
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from psycopg2.errors import UndefinedTable, IntegrityError
from decimal import Decimal
import json, os, logging, httpx
from dateutil.relativedelta import relativedelta
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Type, Union
from fastapi import HTTPException, Response, status
from fastapi.responses import JSONResponse
from jose import jwt
import pandas as pd
from passlib.context import CryptContext
from pydantic import BaseModel, TypeAdapter, ValidationError
from config import JWT_ALGORITHM, JWT_SECRET_KEY, SessionLocal
from models import Cache
from schema import PaginationRes

# Get the base directory
base_dir = Path.cwd()


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

loggers = {}


def setup_logger(log_filename):
    """Set up a named file logger, reusing the existing instance when called again.

    Args:
        log_filename: Log file name used both as the logger name and file path
                      under ``extras/``.

    Returns:
        logging.Logger: Configured logger that writes DEBUG-level and above to the file.
    """
    if log_filename in loggers:
        return loggers[log_filename]

    _logger = logging.getLogger(log_filename)
    _logger.setLevel(logging.DEBUG)

    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    file_handler = logging.FileHandler(f'extras/{log_filename}')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)

    _logger.addHandler(file_handler)

    loggers[log_filename] = _logger
    return _logger


def logs(msg='', type='info', file_name=''):
    """Emit a log message at the specified level, optionally to a named file logger.

    Args:
        msg: Message string to log; defaults to empty string.
        type: ``"info"`` (default) INFO level; ``"debug"`` → DEBUG; ``"warning"`` → WARNING;
              ``"error"`` → ERROR; ``"critical"`` → CRITICAL.
        file_name: When provided, routes the message to a dedicated file logger for that name;
                   empty string uses the module-level logger.
    """
    logger = logging.getLogger(__name__)
    if file_name:
        logger = setup_logger(file_name)

    if type == 'debug':
        logger.debug(msg)
    if type == 'info':
        logger.info(msg)
    if type == 'warning':
        logger.warning(msg)
    if type == 'error':
        logger.error(msg)
    if type == 'critical':
        logger.critical(msg)


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    """Verify a plain-text password against a bcrypt hash.

    Returns:
        bool: ``True`` when the password matches the hash; ``False`` otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    """Hash a plain-text password using bcrypt.

    Returns:
        str: The bcrypt hash string suitable for storage.
    """
    return pwd_context.hash(password)


async def create_access_token(data: Dict[str, Any], expires_delta: relativedelta = relativedelta(minutes=30)):
    """Create a signed JWT access token with an expiry claim.

    Args:
        data: Payload dict to encode; an ``exp`` key will be added or overwritten.
        expires_delta: Validity duration from now; defaults to 30 minutes.

    Returns:
        str: Encoded JWT string.
    """
    expire = datetime.now() + expires_delta
    data.update({"exp": int(expire.timestamp())})
    return jwt.encode(data, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


async def blacklist_token(username: str, token: str = '') -> bool:
    """Invalidate all active tokens for a user, or a single token when specified.

    Args:
        username: Username whose tokens should be blacklisted.
        token: Specific JWT string to blacklist; empty string blacklists all active tokens
               for the user.

    Returns:
        bool: ``True`` when blacklisting succeeded; ``False`` when a DB error occurred.
    """
    try:
        async with SessionLocal() as db:
            stmt = select(Cache).where(
                Cache.username == username,
                Cache.black_list.is_(False)
            )

            if token and token != '':
                stmt = stmt.where(Cache.token == token)

            result = await db.execute(stmt)
            token_records = result.scalars().all()

            if token_records:
                for token_record in token_records:
                    token_record.black_list = True

                await db.commit()

        return True
    except Exception as e:
        logs(f"Error while blacklisting token: {e}")
        await db.rollback()
        return False


def ExceptionHandler(e, context_data=None):
    """Map a caught exception to a structured JSON error response or re-raise as HTTPException.

    Args:
        e: The exception to handle.
        context_data: Optional dict with ``url``, ``method``, ``headers`` keys for HTTP
                      error context; ``None`` omits request details from the error payload.

    Returns:
        JSONResponse: Structured error response for httpx network errors (ConnectError,
                      TimeoutException, RequestError) which include diagnostics in ``data``.

    Raises:
        HTTPException: For all other exception types (ValueError, SQLAlchemyError, etc.)
                       with an appropriate status code and detail message.

    Steps:
        - Step 1: Set default 409 response code and generic error message
        - Step 2: Check for HTTPException — use its status code and detail directly
        - Step 3: Check for httpx network errors — build diagnostic error_data with troubleshooting tips
        - Step 4: Check for Python built-in errors (ValueError, TypeError, KeyError, etc.) — map to 400/404/403
        - Step 5: Check for SQLAlchemy / DB errors — map to 409
        - Step 6: Return create_response when error_data is present; otherwise raise HTTPException
    """
    # Step 1: Defaults
    response_code = status.HTTP_409_CONFLICT
    error_message = "Something went wrong"
    error_data = None

    # Step 2: HTTPException
    if isinstance(e, HTTPException):
        response_code = e.status_code
        error_message = e.detail

    # Step 3: httpx network errors
    elif isinstance(e, httpx.ConnectError):
        response_code = 502
        error_message = "Connection failed"
        error_data = {
            "error_type": "Connection Error",
            "target_url": context_data.get('url') if context_data else "Unknown",
            "message": "Unable to connect to the target server",
            "troubleshooting": [
                "Check if the server is running on the specified port",
                "Verify the URL is correct",
                "Check network connectivity",
                "Ensure firewall is not blocking the connection"
            ],
            "original_error": str(e)
        }
        if context_data:
            error_data["request_data"] = {
                "method": context_data.get('method', 'Unknown'),
                "url": context_data.get('url', 'Unknown'),
                "headers": context_data.get('headers', {})
            }

    elif isinstance(e, httpx.TimeoutException):
        response_code = 408
        error_message = "Request timeout"
        error_data = {
            "error_type": "Timeout Error",
            "target_url": context_data.get('url') if context_data else "Unknown",
            "message": "Request timed out - server took too long to respond",
            "original_error": str(e)
        }

    elif isinstance(e, httpx.RequestError):
        response_code = 502
        error_message = "Request failed"
        error_data = {
            "error_type": "Request Error",
            "target_url": context_data.get('url') if context_data else "Unknown",
            "message": f"Request failed: {str(e)}",
            "original_error": str(e)
        }

    # Step 4: Python built-in errors
    elif isinstance(e, ValueError):
        response_code = 400
        error_message = "Invalid value provided." + str(e)
    elif isinstance(e, TypeError):
        response_code = 400
        error_message = "Operation not supported for the type." + str(e)
    elif isinstance(e, KeyError):
        response_code = 400
        error_message = "Key not found in the dictionary." + str(e)
    elif isinstance(e, IndexError):
        response_code = 400
        error_message = "Index out of range." + str(e)
    elif isinstance(e, FileNotFoundError):
        error_message = "File not found." + str(e)
        response_code = 404
    elif isinstance(e, PermissionError):
        response_code = 403
        error_message = "Permission denied." + str(e)

    # Step 5: DB errors
    elif isinstance(e, SQLAlchemyError):
        response_code = 409
        error_message = f"Database error: {str(e)}"
    elif isinstance(e, IntegrityError):
        response_code = 409
        error_message = "Integrity error occurred: " + str(e)
    elif isinstance(e, UndefinedTable):
        response_code = 409
        error_message = "The specified table does not exist in the database." + str(e)
    elif isinstance(e, SyntaxError):
        response_code = 400
        error_message = "Syntax error in the SQL query: " + str(e)

    # Step 6: Return structured response or raise
    if error_data:
        return create_response(
            response_code=response_code,
            error_message=error_message,
            data=error_data
        )
    else:
        raise HTTPException(
            status_code=response_code,
            detail=error_message
        )


def handle_http_error(e, url=None, method=None, headers=None):
    """Delegate an HTTP exception to ExceptionHandler with request context attached.

    Args:
        e: The exception to handle.
        url: Request URL for context; ``None`` when not available.
        method: HTTP method string for context; ``None`` when not available.
        headers: Request headers dict for context; ``None`` when not available.

    Returns:
        JSONResponse: Structured error response from ExceptionHandler.
    """
    context_data = {
        'url': url,
        'method': method,
        'headers': headers
    }
    return ExceptionHandler(e, context_data)


def value_correction(data):
    """Recursively normalise Python values into JSON-safe primitives.

    Args:
        data: Any Python value — str, Decimal, datetime, date, Timedelta, float, dict, list,
              or other; ``None`` and other types are returned unchanged.

    Returns:
        str: Stripped string, or formatted date/datetime/timedelta string.
        float: Decimal converted to float; floats rounded to 2 decimal places.
        dict: Dict with all values recursively corrected.
        list: List with all items recursively corrected.
        Any: Original value for types not handled above.
    """
    if isinstance(data, str):
        return data.strip()
    elif isinstance(data, Decimal):
        return float(data)
    elif isinstance(data, datetime):
        return data.strftime('%Y-%m-%d %H:%M:%S')
    elif isinstance(data, date):
        return data.strftime('%Y-%m-%d')
    elif isinstance(data, pd.Timedelta) or isinstance(data, timedelta):
        return str(data)
    elif isinstance(data, float):
        return round(data, 2)
    elif isinstance(data, dict):
        return {key: value_correction(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [value_correction(item) for item in data]
    else:
        return data


def _format_validation_errors(errors: list) -> list:
    """What it does: Format Pydantic validation error dicts into field/message pairs."""
    return [
        {"field": ".".join(map(str, error['loc'])).replace("__root__.", ""), "message": error['msg']}
        for error in errors
    ]


def create_response(
    response_code: int,
    data: Optional[Any] = None,
    schema: Optional[Type[BaseModel]] = None,
    pagination: Optional[Dict[str, int]] = None,
    error_message: Optional[str] = None,
    message: Optional[str] = None
) -> Union[JSONResponse, Response]:
    """Build a standardised JSON API response with optional schema validation and pagination.

    Args:
        response_code: HTTP status code to set on the response.
        data: Response payload; validated against schema when provided; ``None`` omits
              the ``data`` key entirely.
        schema: Pydantic model class to validate data against; ``None`` passes data through
                without validation.
        pagination: Dict with ``page``, ``rows``, ``total_rows`` keys; ``None`` omits pagination.
        error_message: Human-readable error string; ``None`` omits the ``error_message`` key.
        message: Human-readable success string; ``None`` omits the ``message`` key.

    Returns:
        Response: Empty 204 response when response_code is 204.
        JSONResponse: Structured envelope with ``response_code``, optional ``data``,
                      ``message``, ``error_message``, ``pagination``, and ``errors`` keys.

    Notes:
        - When schema validation fails, response_code is overridden to 422 and ``errors``
          is added to the envelope instead of ``data``.
    """
    response: dict[str, Any] = {
        'response_code': response_code,
    }
    if response_code == 204:
        return Response(status_code=204)
    if message:
        response['message'] = message

    if data:
        if not schema:
            response["data"] = data
        else:
            try:
                if isinstance(data, list):
                    response["data"] = [
                        TypeAdapter(schema).validate_python(item).model_dump() for item in data
                    ]
                elif isinstance(data, dict):
                    validated_data = TypeAdapter(schema).validate_python(data)
                    response["data"] = validated_data.model_dump()
                else:
                    raise ValueError("Expected data to be a list or dict")
            except ValidationError as e:
                errors = _format_validation_errors(e.errors())
                logs(json.dumps(errors, indent=4), type="error")
                response_code = 422
                error_message = "Data validation error"
                response["errors"] = errors

        if pagination:
            try:
                response["pagination"] = TypeAdapter(PaginationRes).validate_python(pagination).model_dump()
            except ValidationError as e:
                errors = _format_validation_errors(e.errors())
                logs(json.dumps(errors, indent=4), type="error")
                response_code = 422
                error_message = "Pagination validation error"
                response["errors"] = errors

    if error_message:
        response["error_message"] = error_message

    response['response_code'] = response_code

    return JSONResponse(content=response, status_code=response_code)


# OTP Utility Functions
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


OTP_EXPIRY_SECONDS = 600
MAX_ATTEMPTS = 2
LOCK_DURATION = 10


def generate_otp():
    """Generate a random 6-digit OTP integer.

    Returns:
        int: A random integer in the range 100000–999999.
    """
    return random.randint(100000, 999999)


def email_otp_message(otp, email, use_for):
    """Send an HTML OTP email to the specified address via SMTP.

    Args:
        otp: The OTP value to embed in the email body.
        email: Recipient email address.
        use_for: Purpose label shown in the email body (e.g. ``"login"`` or ``"password_reset"``).

    Returns:
        bool: ``True`` when the email was sent successfully; ``False`` when SMTP credentials
              are missing or sending fails.
    """
    body = f"""
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background-color: #f4f6f9;
                    color: #333;
                    margin: 0;
                    padding: 0;
                }}
                .container {{
                    max-width: 600px;
                    margin: 40px auto;
                    background: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    padding: 20px;
                    overflow: hidden;
                }}
                .header {{
                    background: linear-gradient(90deg, #7367f0, #928bfa);
                    color: #ffffff;
                    text-align: center;
                    padding: 20px;
                    border-top-left-radius: 8px;
                    border-top-right-radius: 8px;
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                }}
                .content {{
                    padding: 20px;
                }}
                .content p {{
                    font-size: 16px;
                    line-height: 1.6;
                    margin: 15px 0;
                }}
                .otp {{
                    background-color: #7367f0;
                    color: #ffffff;
                    padding: 15px;
                    border-radius: 5px;
                    text-align: center;
                    font-size: 24px;
                    font-weight: bold;
                    margin: 20px 0;
                }}
                .footer {{
                    text-align: center;
                    font-size: 14px;
                    color: #777;
                    margin-top: 30px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Your One-Time Password (OTP)</h1>
                </div>
                <div class="content">
                    <p>Dear User,</p>
                    <p>Please use the following OTP to complete your <strong>{use_for}</strong> process:</p>
                    <div class="otp">{otp}</div>
                    <p>This OTP is valid for the next 10 minutes only. Please do not share it with anyone.</p>
                    <p>If you have any questions, feel free to contact our support team.</p>
                </div>
                <div class="footer">
                    <p>If you did not request this email, please contact us immediately.</p>
                    <p>Thank you,<br>The APIPilot Team</p>
                </div>
            </div>
        </body>
    </html>"""
    try:
        smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_username = os.environ.get('SMTP_USERNAME', '')
        smtp_password = os.environ.get('SMTP_PASSWORD', '')

        if not all([smtp_username, smtp_password]):
            logs("SMTP credentials not configured", type="warning")
            return False

        msg = MIMEMultipart()
        msg['From'] = smtp_username
        msg['To'] = email
        msg['Subject'] = "Your One-Time Password (OTP)"

        msg.attach(MIMEText(body, 'plain'))

        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_username, smtp_password)
        text = msg.as_string()
        server.sendmail(smtp_username, email, text)
        server.quit()

        logs(f"OTP sent successfully to {email}")
        return True

    except Exception as e:
        logs(f"Failed to send OTP email: {e}", type="error")
        return False


# Variable Resolution Functions
import re
from typing import Dict, Any, List, Union


def merge_scopes(*scopes: dict) -> dict:
    """Merge variable scope dicts with right-most scope taking highest priority.

    Args:
        scopes: Variable number of dicts ordered from lowest to highest priority;
                empty or ``None`` scopes are safely skipped.

    Returns:
        dict: Merged dict where later scopes override earlier ones for duplicate keys.
    """
    merged = {}
    for scope in scopes:
        if scope:
            merged.update(scope)
    return merged


def extract_variables_from_text(text: str) -> List[str]:
    """Extract unique variable names from ``{{variable_name}}`` placeholders in a string.

    Args:
        text: Input string to scan; non-string values return an empty list.

    Returns:
        list[str]: Deduplicated list of variable names found between ``{{`` and ``}}``.
    """
    if not isinstance(text, str):
        return []

    pattern = r'\{\{([^}]+)\}\}'
    matches = re.findall(pattern, text)
    return list(set(matches))


def _make_dynamic_context() -> dict:
    """What it does: Generate a single-use dynamic token set so all tokens are stable within one resolve call."""
    import uuid as _uuid
    import random as _random
    from datetime import datetime, timezone as _tz

    try:
        from faker import Faker as _Faker
        _f = _Faker()
    except ImportError:
        _f = None

    _now = datetime.now(_tz.utc)
    _ts_sec = int(_now.timestamp())
    _guid = str(_uuid.uuid4())

    ctx: dict = {
        # --- canonical timestamp tokens ---
        "$timestamp": str(_ts_sec),
        "$isoTimestamp": _now.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        # --- GUID ---
        "$guid": _guid,
        "$randomUUID": _guid,
        # --- legacy (keep for backward compat) ---
        "$uuid": _guid,
        # --- numbers ---
        "$randomInt": str(_random.randint(0, 1000)),
        "$randomFloat": f"{_random.uniform(0.0, 1.0):.2f}",
        # --- boolean ---
        "$randomBoolean": _random.choice(["true", "false"]),
    }

    if _f:
        ctx.update({
            # internet / contact
            "$randomEmail": _f.email(),
            "$randomExampleEmail": _f.ascii_email(),
            "$randomUserName": _f.user_name(),
            "$randomUrl": _f.url(),
            "$randomDomainName": _f.domain_name(),
            "$randomDomainSuffix": _f.tld(),
            "$randomDomainWord": _f.domain_word(),
            "$randomIP": _f.ipv4(),
            "$randomIPV6": _f.ipv6(),
            "$randomMACAddress": _f.mac_address(),
            "$randomProtocol": _random.choice(["http", "https"]),
            "$randomPassword": _f.password(),
            "$randomUserAgent": _f.user_agent(),
            "$randomSemver": f"{_random.randint(0,9)}.{_random.randint(0,99)}.{_random.randint(0,999)}",
            # names
            "$randomFirstName": _f.first_name(),
            "$randomLastName": _f.last_name(),
            "$randomFullName": _f.name(),
            "$randomNamePrefix": _f.prefix(),
            "$randomNameSuffix": _f.suffix(),
            # phone / finance
            "$randomPhoneNumber": _f.phone_number(),
            "$randomCurrencyCode": _f.currency_code(),
            "$randomCurrencyName": _f.currency_name(),
            "$randomCurrencySymbol": _f.currency_symbol(),
            # company
            "$randomCompanyName": _f.company(),
            "$randomCompanySuffix": _f.company_suffix(),
            "$randomJobTitle": _f.job(),
            # address / location
            "$randomCity": _f.city(),
            "$randomStreetName": _f.street_name(),
            "$randomStreetAddress": _f.street_address(),
            "$randomCountry": _f.country(),
            "$randomCountryCode": _f.country_code(),
            "$randomLatitude": str(_f.latitude()),
            "$randomLongitude": str(_f.longitude()),
            "$randomZipCode": _f.zipcode(),
            "$randomTimeZone": _f.timezone(),
            # text / lorem
            "$randomAlphaNumeric": _random.choice("abcdefghijklmnopqrstuvwxyz0123456789"),
            "$randomWord": _f.word(),
            "$randomWords": " ".join(_f.words(_random.randint(1, 5))),
            "$randomLoremWord": _f.word(),
            "$randomLoremWords": " ".join(_f.words(3)),
            "$randomLoremSentence": _f.sentence(),
            "$randomLoremSentences": " ".join(_f.sentences(_random.randint(2, 6))),
            "$randomLoremParagraph": _f.paragraph(),
            # color / file
            "$randomHexColor": _f.hex_color(),
            "$randomMimeType": _f.mime_type(),
            "$randomFileName": _f.file_name(),
            "$randomFileExtension": _f.file_extension(),
            "$randomFilePath": _f.file_path(),
            "$randomDirectoryPath": _f.file_path(depth=2).rsplit("/", 1)[0],
        })
    else:
        # fallback when faker not installed
        import string as _string
        _rand_user = "".join(_random.choices(_string.ascii_lowercase, k=8))
        _rand_domain = "".join(_random.choices(_string.ascii_lowercase, k=6))
        ctx["$randomEmail"] = f"{_rand_user}@{_rand_domain}.com"
        ctx["$randomUserName"] = _rand_user
        ctx["$randomFirstName"] = "John"
        ctx["$randomLastName"] = "Doe"
        ctx["$randomFullName"] = "John Doe"
        ctx["$randomWord"] = "lorem"
        ctx["$randomWords"] = "lorem ipsum dolor"
        ctx["$randomLoremSentence"] = "Lorem ipsum dolor sit amet."
        ctx["$randomAlphaNumeric"] = _random.choice("abcdefghijklmnopqrstuvwxyz0123456789")

    return ctx


def resolve_variables(data: Any, variables: dict, ts: int | None = None, _dyn: dict | None = None) -> Any:
    """Substitute ``{{VAR}}`` and dynamic ``{{$token}}`` placeholders in data with resolved values.

    Args:
        data: Value to process — str, dict, list, or other; ``None`` returns ``None``;
              non-string/dict/list types are returned unchanged.
        variables: Mapping of variable name → replacement string; empty dict leaves
                   placeholders unchanged.
        ts: Unix timestamp in milliseconds used to replace ``${ts}`` tokens; generated
            from current time when ``None``.
        _dyn: Pre-generated dynamic token dict (``$uuid``, ``$randomInt``, ``$randomEmail``);
              created once on the first call and threaded through recursion so tokens are
              stable within a single resolve pass. Callers should not pass this explicitly.

    Returns:
        Any: Input data with all known ``{{VAR}}``, ``{{$token}}``, and ``${ts}`` tokens
             substituted; unknown variables remain as their original ``{{VAR}}`` literal.
    """
    if data is None:
        return None
    if not ts:
        ts = int(time() * 1000)
    # Generate dynamic tokens once per top-level call; thread through recursion
    if _dyn is None:
        _dyn = _make_dynamic_context()

    if isinstance(data, str):
        result = str(data)
        # Merged lookup: user variables take priority over dynamic tokens
        lookup = {**_dyn, **(variables or {})}
        def replace_variable(match):
            """What it does: Return the resolved value or leave the placeholder unchanged."""
            var_name = match.group(1)
            return str(lookup.get(var_name, match.group(0)))
        result = re.sub(r"\{\{([a-zA-Z_\$][a-zA-Z0-9_\-\$]*)\}\}", replace_variable, result)
        return result.replace("${ts}", str(ts))

    if isinstance(data, dict):
        return {k: resolve_variables(v, variables, ts, _dyn) for k, v in data.items()}
    if isinstance(data, list):
        return [resolve_variables(i, variables, ts, _dyn) for i in data]
    return data


async def get_environment_variables(environment_id: int) -> Dict[str, str]:
    """Fetch the variable dict from a specific environment by id.

    Returns:
        dict: Variable key→value mapping from the environment's JSON column.
              Returns empty dict when the environment does not exist, has no variables,
              or any DB error occurs.
    """
    try:
        async with SessionLocal() as db:
            from models import Environment

            stmt = select(Environment).where(Environment.id == environment_id)
            result = await db.execute(stmt)
            environment = result.scalar_one_or_none()

            if environment and environment.variables:
                return environment.variables

            return {}
    except Exception as e:
        logs(f"Error getting environment variables: {e}", type="error")
        return {}


async def resolve_api_variables(environment_id: int, api_data: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve all ``{{VAR}}`` placeholders in an API data dict using a specific environment.

    Args:
        environment_id: Environment whose variables will be used for substitution.
        api_data: API data structure (headers, body, params, url, etc.) to resolve.

    Returns:
        dict: API data with all known variable placeholders substituted.
    """
    variables = await get_environment_variables(environment_id)
    return resolve_variables(api_data, variables)


def get_variables_from_api_data(api_data: Dict[str, Any]) -> List[str]:
    """Extract all unique ``{{VAR}}`` variable names referenced in an API data structure.

    Args:
        api_data: API data structure to scan — may contain nested dicts, lists, and strings.

    Returns:
        list[str]: Deduplicated list of variable names found across the entire structure.
    """
    variables = set()

    def extract_from_value(value):
        """What it does: Recursively collect variable names from any value type."""
        if isinstance(value, str):
            variables.update(extract_variables_from_text(value))
        elif isinstance(value, dict):
            for v in value.values():
                extract_from_value(v)
        elif isinstance(value, list):
            for item in value:
                extract_from_value(item)

    extract_from_value(api_data)
    return list(variables)
