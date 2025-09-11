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
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt
import pandas as pd
from passlib.context import CryptContext
from pydantic import BaseModel, TypeAdapter, ValidationError
from sqlalchemy import select

from config import JWT_ALGORITHM, JWT_SECRET_KEY, SessionLocal
from models import Cache, Node
from schema import PaginationRes

# Get the base directory
base_dir = Path.cwd()


logging.basicConfig(
    # Set the log level (e.g., DEBUG, INFO, WARNING, ERROR)
    level=logging.INFO,
    # Set the log message format
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'  # Set the date format for log timestamps
)

loggers = {}


def setup_logger(log_filename):
    """
        Set up and configure a logger for logging messages to a specific file.

        Parameters:
        - log_filename (str): The name of the log file.

        Returns:
        logging.Logger: The configured logger instance for the specified log file.
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
    """
        Log messages with different log levels (debug, info, warning, error, critical).

        Parameters:
        - msg (str, optional): The message to be logged. Defaults to an empty string.
        - type (str, optional): The log level/type (debug, info, warning, error, critical).
        Defaults to 'info'.
        - file_name (str, optional): The name of the log file. If provided,
        a new logger will be set up for that file.

        Returns:
        None: The function logs the specified message at the specified log level.
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


# Function to verify password
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


# Function to hash the password
def get_password_hash(password):
    return pwd_context.hash(password)

async def create_access_token(data: Dict[str, Any], expires_delta: relativedelta = relativedelta(minutes=30)):
    expire = datetime.now() + expires_delta
    data.update({"exp": int(expire.timestamp())})
    return jwt.encode(data, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


async def blacklist_token(username: str, token: str = '') -> bool:
    """
    Asynchronously blacklist all tokens associated with a username (or a specific token if given).
    Sets `black_list = True` for matched tokens in the `sso_cache` table.
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
    """
    Enhanced global exception handler that handles various types of errors
    including HTTP connection errors, database errors, and general exceptions.

    Args:
        e: The exception to handle
        context_data: Optional dict with context information (url, headers, request_data, etc.)
    """
    response_code = status.HTTP_409_CONFLICT
    error_message = "Something went wrong"
    error_data = None

    if isinstance(e, HTTPException):
        response_code = e.status_code
        error_message = e.detail

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

    # Return structured response instead of raising HTTPException
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
    """
    Convenience function for handling HTTP errors with context.

    Args:
        e: The HTTP exception
        url: The request URL
        method: The HTTP method
        headers: The request headers
    """
    context_data = {
        'url': url,
        'method': method,
        'headers': headers
    }
    return ExceptionHandler(e, context_data)


def value_correction(data):
    if isinstance(data, str):
        return data.strip()
    elif isinstance(data, Decimal):
        return float(data)
    elif isinstance(data, datetime):
        return data.strftime('%Y-%m-%d %H:%M:%S')  # Format for datetime
    elif isinstance(data, date):  # Handle date separately from datetime
        return data.strftime('%Y-%m-%d')  # Format for date
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
    """Formats validation errors into a readable structure."""
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
    """
    Constructs a well-structured JSON response that supports data validation, error handling,
    and pagination. Data is validated against a schema if provided, and errors are formatted
    and logged.

    Args:
        response_code (int): The HTTP status code of the response.
        data (Any, optional): The data to include in the response. Can be a list or dictionary.
                              If a schema is provided, the data will be validated.
        schema (Any, optional): A Pydantic schema used to validate the data.
        pagination (dict, optional): A dictionary with pagination details.
        error_message (str, optional): An error message to be included in the response.

    Returns:
        JSONResponse: A structured JSON response object.
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
                # Log and format validation errors
                errors = _format_validation_errors(e.errors())
                logs(json.dumps(errors, indent=4), type="error")
                response_code = 422  # Set HTTP status to Unprocessable Entity
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
    return random.randint(100000, 999999)  # Generates a random 6-digit number


def email_otp_message(otp, email, use_for):
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
                    <p>Thank you,<br>The Polaris Team</p>
                </div>
            </div>
        </body>
    </html>"""
    try:
        # Configure these based on your email provider
        smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_username = os.environ.get('SMTP_USERNAME', '')
        smtp_password = os.environ.get('SMTP_PASSWORD', '')

        if not all([smtp_username, smtp_password]):
            logs("SMTP credentials not configured", type="warning")
            return False

        # Create message
        msg = MIMEMultipart()
        msg['From'] = smtp_username
        msg['To'] = email
        msg['Subject'] = "Your One-Time Password (OTP)"

        msg.attach(MIMEText(body, 'plain'))

        # Send email
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


def extract_variables_from_text(text: str) -> List[str]:
    """
    Extract all variable names from text that follow the {{variable_name}} pattern.

    Args:
        text (str): The text to extract variables from

    Returns:
        List[str]: List of unique variable names found in the text
    """
    if not isinstance(text, str):
        return []

    pattern = r'\{\{([^}]+)\}\}'
    matches = re.findall(pattern, text)
    return list(set(matches))  # Return unique variable names


def replace_variables_in_text(text: str, variables: Dict[str, str]) -> str:
    """
    Replace all variables in text with their values from the variables dictionary.

    Args:
        text (str): The text containing variables in {{variable_name}} format
        variables (Dict[str, str]): Dictionary of variable names to values

    Returns:
        str: Text with variables replaced by their values
    """
    if not isinstance(text, str) or not variables:
        return text

    def replace_match(match):
        variable_name = match.group(1).strip()
        return str(variables.get(variable_name, match.group(0)))  # Return original if not found

    pattern = r'\{\{([^}]+)\}\}'
    return re.sub(pattern, replace_match, text)


def replace_variables_in_dict(data: Dict[str, Any], variables: Dict[str, str]) -> Dict[str, Any]:
    """
    Recursively replace variables in all string values within a dictionary.

    Args:
        data (Dict[str, Any]): Dictionary that may contain variables
        variables (Dict[str, str]): Dictionary of variable names to values

    Returns:
        Dict[str, Any]: Dictionary with variables replaced
    """
    if not isinstance(data, dict) or not variables:
        return data

    result = {}
    for key, value in data.items():
        if isinstance(value, str):
            result[key] = replace_variables_in_text(value, variables)
        elif isinstance(value, dict):
            result[key] = replace_variables_in_dict(value, variables)
        elif isinstance(value, list):
            result[key] = replace_variables_in_list(value, variables)
        else:
            result[key] = value

    return result


def replace_variables_in_list(data: List[Any], variables: Dict[str, str]) -> List[Any]:
    """
    Recursively replace variables in all string values within a list.

    Args:
        data (List[Any]): List that may contain variables
        variables (Dict[str, str]): Dictionary of variable names to values

    Returns:
        List[Any]: List with variables replaced
    """
    if not isinstance(data, list) or not variables:
        return data

    result = []
    for item in data:
        if isinstance(item, str):
            result.append(replace_variables_in_text(item, variables))
        elif isinstance(item, dict):
            result.append(replace_variables_in_dict(item, variables))
        elif isinstance(item, list):
            result.append(replace_variables_in_list(item, variables))
        else:
            result.append(item)

    return result


def replace_variables_in_api_data(api_data: Dict[str, Any], variables: Dict[str, str]) -> Dict[str, Any]:
    """
    Replace variables in complete API data structure including url, headers, body, params, etc.

    Args:
        api_data (Dict[str, Any]): Complete API data structure
        variables (Dict[str, str]): Dictionary of variable names to values

    Returns:
        Dict[str, Any]: API data with all variables replaced
    """
    if not isinstance(api_data, dict) or not variables:
        return api_data

    # Create a copy to avoid modifying the original
    result = {}

    for key, value in api_data.items():
        if isinstance(value, str):
            # Replace variables in string fields like URL, method, etc.
            result[key] = replace_variables_in_text(value, variables)
        elif isinstance(value, dict):
            # Replace variables in nested objects like headers, body, params
            result[key] = replace_variables_in_dict(value, variables)
        elif isinstance(value, list):
            # Replace variables in arrays
            result[key] = replace_variables_in_list(value, variables)
        else:
            # Keep other types as-is (numbers, booleans, null)
            result[key] = value

    return result


async def get_environment_variables(environment_id: int) -> Dict[str, str]:
    """
    Get all variables for a specific environment from the database.

    Args:
        environment_id (int): The ID of the environment

    Returns:
        Dict[str, str]: Dictionary of variable names to values
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
    """
    Resolve all variables in API data using variables from the specified environment.

    Args:
        environment_id (int): The ID of the environment containing variables
        api_data (Dict[str, Any]): The API data structure to resolve variables in

    Returns:
        Dict[str, Any]: API data with all variables resolved
    """
    variables = await get_environment_variables(environment_id)
    return replace_variables_in_api_data(api_data, variables)


def get_variables_from_api_data(api_data: Dict[str, Any]) -> List[str]:
    """
    Extract all variable names used in an API data structure.

    Args:
        api_data (Dict[str, Any]): The API data structure to analyze

    Returns:
        List[str]: List of unique variable names found
    """
    variables = set()

    def extract_from_value(value):
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


async def get_unique_name(base_name: str, target_workspace_id: int, target_folder_id: int | None, db: AsyncSession) -> str:
    """
    Generate a unique name for the copied/moved node in the target location.
    If 'name' exists, try 'name copy', 'name copy 2', etc.
    """
    async def name_exists(name):
        query = select(Node).where(
            Node.workspace_id == target_workspace_id,
            Node.name == name
        )
        if target_folder_id is None:
            query = query.where(Node.parent_id.is_(None))
        else:
            query = query.where(Node.parent_id == target_folder_id)
        result = await db.execute(query)
        return result.scalar_one_or_none() is not None

    name = base_name
    _re_copy = re.compile(r"^(.*?)( copy(?: (\d+))?)?$", re.IGNORECASE)
    n = 1
    while True:
        if not await name_exists(name):
            return name
        m = _re_copy.match(name)
        if m:
            base = m.group(1)
            num = m.group(3)
            if num:
                n = int(num) + 1
            else:
                n = 2 if name.lower().endswith("copy") else 1
            name = f"{base} copy {n}" if n > 1 else f"{base} copy"
        else:
            name = f"{base_name} copy"
