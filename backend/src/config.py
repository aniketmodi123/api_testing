"""
What this file does: Configures the async PostgreSQL engine, session factory, ORM base, and shared DB utilities;
all connection parameters are read from environment variables.
"""

from pathlib import Path
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine.row import Row
from sqlalchemy.inspection import inspect
import os, ssl
from sqlalchemy import text
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession



PROD_HOST = os.environ.get('PRODUCTION_POSTGRES_HOST')
PROD_USER = os.environ.get('PRODUCTION_POSTGRES_USER')
PROD_PASSWORD = os.environ.get('PRODUCTION_POSTGRES_PASSWORD')
PROD_DB = os.environ.get('PRODUCTION_POSTGRES_DB')
PROD_PORT = os.environ.get('PRODUCTION_POSTGRES_PORT', '5432')

# Get the base directory
base_dir = Path.cwd()
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-here')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')

SECRET_ENC_KEY = os.environ.get('SECRET_ENC_KEY', '')
OUTBOUND_VERIFY_TLS = os.environ.get('OUTBOUND_VERIFY_TLS', 'true').lower() != 'false'
CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')

# Check if all required environment variables are set
if not all([PROD_HOST, PROD_USER, PROD_PASSWORD, PROD_DB]):
    raise RuntimeError(
        "Missing required environment variables: "
        "PRODUCTION_POSTGRES_HOST, PRODUCTION_POSTGRES_USER, "
        "PRODUCTION_POSTGRES_PASSWORD, PRODUCTION_POSTGRES_DB"
    )


try:
    # Create SSL context with relaxed verification for development
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    engine = create_async_engine(
        f"postgresql+asyncpg://{PROD_USER}:{PROD_PASSWORD}@{PROD_HOST}:{PROD_PORT}/{PROD_DB}",
        echo=False,
        connect_args={
            "ssl": ssl_context,
            "server_settings": {
                "application_name": "apipilot"
            }
        }
    )
    SessionLocal = async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
        class_=AsyncSession
    )
    Base = declarative_base()
except Exception as e:
    raise RuntimeError(f"Failed to connect to PostgreSQL: {e}")


async def get_db():
    """Yield an AsyncSession for use as a FastAPI dependency."""
    async with SessionLocal() as session:
        yield session


async def check_db_connection():
    """Verify the PostgreSQL connection is reachable by running a test query."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        print("PostgreSQL connection successful.")
    except SQLAlchemyError as e:
        print(f"PostgreSQL connection failed: {e}")


async def db_query_data(db: AsyncSession, query: str, variables=None, fetch_one: bool = False):
    """Execute a raw SQL query and return results as dicts.

    Args:
        query: Raw SQL string; may contain named bind parameters.
        variables: Dict of bind parameter values; defaults to empty dict when ``None``.
        fetch_one: ``False`` (default) returns all rows as a list; ``True`` → returns the
                   first row as a single dict.

    Returns:
        dict: Single row when ``fetch_one=True`` and a row exists.
        list[dict]: All rows when ``fetch_one=False`` and rows exist.
        None: Returned when no rows match or an exception occurs.
    """
    try:
        stmt = text(query)
        result = await db.execute(stmt, variables or {})

        column_names = result.keys()

        if fetch_one:
            row = result.fetchone()
            if row:
                return dict(zip(column_names, row))
        else:
            rows = result.fetchall()
            if rows:
                return [dict(zip(column_names, row)) for row in rows]

        return None

    except Exception as e:
        print(f"Error executing async query: {e}")
        return None


def serialize_data(data, strict=False):
    """Convert SQLAlchemy query results into plain Python dicts or lists.

    Args:
        data: Row, list of Rows, ORM instance, list of ORM instances, or list of tuples.
              Returns ``{}`` when falsy (None, empty list, etc.).
        strict: Unused reserved parameter; has no effect on current behaviour.

    Returns:
        dict: Single ORM instance or single Row converted to a flat dict.
        list: List of dicts for multi-row results; list of scalars for single-column tuples.
        Any: Original ``data`` unchanged when none of the known shapes match.

    Raises:
        ValueError: When an ORM object cannot be inspected or tuple handling fails.

    Steps:
        - Step 1: Return ``{}`` immediately when data is falsy
        - Step 2: Convert a single SQLAlchemy Row to dict via its column mapping
        - Step 3: Convert a list of Rows to a list of dicts
        - Step 4: Convert a list of ORM objects by iterating mapped column attributes
        - Step 5: Convert a single ORM object using SQLAlchemy inspect mapper
        - Step 6: Flatten a list of single-element tuples to a plain list of scalars
        - Step 7: Convert multi-column tuples — namedtuples via ``_asdict()``, plain tuples to lists
        - Step 8: Return data unchanged when no shape matches
    """
    try:
        if not data:
            return {}

        # Step 2: single Row object
        if isinstance(data, Row):
            return dict(data._mapping)

        # Step 3: list of Row objects
        if isinstance(data, list) and isinstance(data[0], Row):
            return [dict(row._mapping) for row in data]

        # Step 4: list of ORM objects
        if isinstance(data, list) and hasattr(data[0], '__table__'):
            return [
                {column.key: getattr(instance, column.key) for column in inspect(instance).mapper.column_attrs}
                for instance in data
            ]

        # Step 5: single ORM object
        if hasattr(data, '__table__'):
            try:
                mapper = inspect(data)
                if mapper and hasattr(mapper, 'mapper'):
                    return {column.key: getattr(data, column.key) for column in mapper.mapper.column_attrs}
            except Exception as e:
                raise ValueError(f"Error inspecting ORM object: {e}")

        # Step 6: list of single-element tuples — flatten to scalar list
        if isinstance(data, list) and isinstance(data[0], tuple) and len(data[0]) == 1:
            return [item[0] for item in data]

        # Step 7: list of multi-column tuples
        if isinstance(data, list) and isinstance(data[0], tuple):
            try:
                if hasattr(data[0], '_fields'):  # namedtuple
                    return [dict(row._asdict()) for row in data]
                else:  # plain tuple — return list of tuples or raise
                    return [list(row) for row in data]  # or raise error if that's not useful
            except Exception as e:
                raise ValueError(f"Error handling tuple data: {e}")

        return data  # Step 8: return as-is if none of the above cases match
    except Exception as e:
        raise ValueError(f"Error during serialization: {e}")
