"""
What this file does: Provides a unified FastAPI exception handler that maps Python and
SQLAlchemy exceptions to structured JSON error responses with human-readable messages.
"""

import traceback
from fastapi import status, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.exc import (
    SQLAlchemyError,
    IntegrityError,
    OperationalError,
    ProgrammingError,
    DataError,
    DisconnectionError,
)
from psycopg2.errors import UndefinedTable


def parse_integrity_error(exc: IntegrityError) -> str:
    """Extract a human-readable message from a PostgreSQL IntegrityError.

    Args:
        exc: The SQLAlchemy IntegrityError wrapping a psycopg2 exception.

    Returns:
        str: Caller-friendly error message describing the constraint violation.

    Steps:
        - Step 1: Extract pgcode and diagnostic info from the original psycopg2 exception
        - Step 2: Map known pgcodes (23505, 23503, 23502, 23514, 23P01, 42703, 42P01) to descriptive messages
        - Step 3: Return a generic fallback message for unknown constraint codes
    """
    # Step 1: Extract diagnostic info
    orig = getattr(exc, "orig", None)
    pgcode = getattr(orig, "pgcode", None)
    diag = getattr(orig, "diag", None)

    # Step 2: Map pgcodes to messages
    if pgcode == "23505":  # unique_violation
        col = getattr(diag, "constraint_name", None)
        detail = getattr(diag, "message_detail", str(orig))
        value = None
        if "=" in detail:
            try:
                value = detail.split("=")[-1].split(")")[0].strip()
            except Exception:
                pass
        if col and value:
            return f"Duplicate entry: {col} with value '{value}' already exists."
        elif col:
            return f"Duplicate entry on field '{col}'."
        return "Duplicate entry – this value already exists."

    elif pgcode == "23503":  # foreign_key_violation
        col = getattr(diag, "constraint_name", None)
        return (
            f"Invalid reference – related record required by '{col}' not found."
            if col
            else "Invalid reference – related record not found."
        )

    elif pgcode == "23502":  # not_null_violation
        col = getattr(diag, "column_name", None)
        return f"Missing required field: '{col}'." if col else "Missing required field."

    elif pgcode == "23514":  # check_violation
        col = getattr(diag, "column_name", None)
        return f"Check constraint violated on '{col}'." if col else "Check constraint violated."

    elif pgcode == "23P01":  # exclusion_violation
        return "Exclusion constraint violated – conflicting values."

    elif pgcode == "42703":  # undefined_column
        return "Undefined column in query."

    elif pgcode == "42P01":  # undefined_table
        return "Undefined table referenced in query."

    # Step 3: Generic fallback
    return "Integrity constraint violated."


def handle_exception(exc: Exception) -> JSONResponse:
    """Map any exception to a structured JSON error response.

    Args:
        exc: The exception to classify and convert.

    Returns:
        JSONResponse: Structured response with ``response_code`` and ``error_message``
                      keys; Pydantic validation errors also include an ``errors`` list.

    Steps:
        - Step 1: Print full traceback for debugging; set default 409 / generic message
        - Step 2: Map HTTPException to its own status code and detail
        - Step 3: Map Python built-in errors (ValueError, AttributeError, TypeError, KeyError, etc.) to 400/404/403
        - Step 4: Map SQLAlchemy errors (IntegrityError, OperationalError, ProgrammingError, etc.) to appropriate codes
        - Step 5: Map Python runtime errors (SyntaxError, ZeroDivisionError, MemoryError, etc.)
        - Step 6: Handle Pydantic ValidationError and RequestValidationError — return 422 with errors list
        - Step 7: Return the final JSONResponse
    """
    # Step 1: Log and set defaults
    print("Exception occurred:", traceback.format_exc())

    response_code = status.HTTP_409_CONFLICT
    error_message = "Something went wrong"

    # Step 2: HTTPException
    if isinstance(exc, HTTPException):
        response_code = exc.status_code
        error_message = exc.detail

    # Step 3: Python built-in errors
    elif isinstance(exc, ValueError):
        response_code = 400
        error_message = f"Invalid value provided: {str(exc)}"
    elif isinstance(exc, AttributeError):
        response_code = 400
        error_message = f"Missing attribute: {str(exc)}"

        if hasattr(exc, "name") and "Row" in str(type(exc)):
            try:
                available = list(getattr(exc, "keys", lambda: [])())
                if available:
                    error_message += f". Available columns are: {available}"
            except Exception:
                pass

        elif hasattr(exc, "__dict__"):
            error_message += f". Available attributes: {list(exc.__dict__.keys())}"

    elif isinstance(exc, TypeError):
        response_code = 400
        error_message = f"Operation not supported for the type: {str(exc)}"
    elif isinstance(exc, KeyError):
        response_code = 400
        available_keys = []
        context = getattr(exc, "__context__", None)
        if isinstance(context, dict):
            available_keys = list(context.keys())
        error_message = f"Key not found: {str(exc)}"
        if available_keys:
            error_message += f". Available keys are: {available_keys}"

    elif isinstance(exc, IndexError):
        response_code = 400
        error_message = f"Index out of range: {str(exc)}"
    elif isinstance(exc, NameError):
        response_code = 400
        error_message = f"error: {str(exc)}"
    elif isinstance(exc, FileNotFoundError):
        response_code = 404
        error_message = f"File not found: {str(exc)}"
    elif isinstance(exc, PermissionError):
        response_code = 403
        error_message = f"Permission denied: {str(exc)}"

    # Step 4: SQLAlchemy / DB errors
    elif isinstance(exc, IntegrityError):
        response_code = 409
        error_message = parse_integrity_error(exc)
    elif isinstance(exc, UndefinedTable):
        response_code = 409
        error_message = f"Undefined table: {str(exc)}"
    elif isinstance(exc, OperationalError):
        response_code = 408
        error_message = "Database operation timed out or failed to complete."
    elif isinstance(exc, ProgrammingError):
        response_code = 400
        orig = getattr(exc, "orig", None)
        error_message = str(orig) if orig else "Invalid database query or parameters."
    elif isinstance(exc, DataError):
        response_code = 400
        error_message = "Invalid or out-of-range data provided."
    elif isinstance(exc, DisconnectionError):
        response_code = 408
        error_message = "Database connection was lost."
    elif isinstance(exc, SQLAlchemyError):
        response_code = 409
        error_message = f"Database error: {str(exc)}"

    # Step 5: Python runtime errors
    elif isinstance(exc, SyntaxError):
        response_code = 400
        error_message = f"Syntax error: {str(exc)}"
    elif isinstance(exc, ZeroDivisionError):
        response_code = 400
        error_message = "Division by zero is not allowed."
    elif isinstance(exc, OverflowError):
        response_code = 400
        error_message = "Numeric value too large to handle."
    elif isinstance(exc, RecursionError):
        response_code = 400
        error_message = "Too many recursive calls – maximum depth exceeded."
    elif isinstance(exc, MemoryError):
        response_code = 429
        error_message = "Operation could not complete due to resource limits."
    elif isinstance(exc, TimeoutError):
        response_code = 408
        error_message = "The operation timed out."
    elif isinstance(exc, ConnectionError):
        response_code = 408
        error_message = "Failed to connect to the server."
    elif isinstance(exc, BrokenPipeError):
        response_code = 409
        error_message = "Connection was broken during the operation."

    # Step 6: Pydantic validation errors
    elif isinstance(exc, ValidationError):
        return JSONResponse(
            content={
                "response_code": 422,
                "error_message": "Validation failed",
                "errors": exc.errors(),
            },
            status_code=422,
        )
    elif isinstance(exc, RequestValidationError):
        errors = [
            {"field": ".".join(map(str, err.get("loc", []))), "message": err.get("msg")}
            for err in exc.errors()
        ]
        return JSONResponse(
            content={
                "response_code": status.HTTP_422_UNPROCESSABLE_ENTITY,
                "error_message": "validation error",
                "errors": errors,
            },
            status_code=422,
        )

    # Step 7: Return final response
    return JSONResponse(
        status_code=response_code,
        content={"response_code": response_code, "error_message": error_message},
    )


async def unified_exception_handler(request: Request, exc: Exception):
    """Serve as the FastAPI global exception handler entrypoint."""
    return handle_exception(exc)
