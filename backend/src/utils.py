from sqlalchemy.exc import SQLAlchemyError
from psycopg2.errors import UndefinedTable, IntegrityError
from decimal import Decimal
import json
from dateutil.relativedelta import relativedelta
from datetime import date, datetime, timedelta
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Type, Union
from fastapi import HTTPException, Response, status
from fastapi.responses import JSONResponse

from jose import jwt
import pandas as pd
from passlib.context import CryptContext
from pydantic import BaseModel, TypeAdapter, ValidationError
from sqlalchemy import select

from config import JWT_ALGORITHM, JWT_SECRET_KEY, SessionLocal
from models import Cache
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





def ExceptionHandler(e):
    response_code = status.HTTP_409_CONFLICT
    error_message = "Something went wrong"

    if isinstance(e, HTTPException):
        response_code=e.status_code
        error_message=e.detail
    elif isinstance(e, ValueError):
        response_code= 400
        error_message= "Invalid value provided."+ str(e)
    elif isinstance(e, TypeError):
        response_code= 400
        error_message= "Operation not supported for the type." + str(e)
    elif isinstance(e, KeyError):
        response_code= 400
        error_message= "Key not found in the dictionary." + str(e)
    elif isinstance(e, IndexError):
        response_code= 400
        error_message= "Index out of range." + str(e)
    elif isinstance(e, FileNotFoundError):
        error_message= "File not found." + str(e)
        response_code= 404
    elif isinstance(e, PermissionError):
        response_code= 403
        error_message= "Permission denied." + str(e)
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

    raise HTTPException(
        status_code=response_code,
        detail=error_message
    )


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
    error_message: Optional[str] = None
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
