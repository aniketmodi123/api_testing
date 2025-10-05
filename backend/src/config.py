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
                "application_name": "api_testing"
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
    async with SessionLocal() as session:
        yield session

# Database Health Check
async def check_db_connection():
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        print("PostgreSQL connection successful.")
    except SQLAlchemyError as e:
        print(f"PostgreSQL connection failed: {e}")


async def db_query_data(db: AsyncSession, query: str, variables=None, fetch_one: bool = False):
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
    try:
        if not data:
            return {}

        # Case 1: If it's a single Row object, convert it to a dictionary
        if isinstance(data, Row):
            return dict(data._mapping)

        # Case 2: If it's a list of Row objects, convert each Row to a dictionary
        if isinstance(data, list) and isinstance(data[0], Row):
            return [dict(row._mapping) for row in data]

        # Case 3: If it's a list of ORM objects, convert to a dictionary
        if isinstance(data, list) and hasattr(data[0], '__table__'):
            return [
                {column.key: getattr(instance, column.key) for column in inspect(instance).mapper.column_attrs}
                for instance in data
            ]

        # Case 4: If it's a single ORM object, convert to a dictionary
        if hasattr(data, '__table__'):
            try:
                mapper = inspect(data)
                if mapper and hasattr(mapper, 'mapper'):
                    return {column.key: getattr(data, column.key) for column in mapper.mapper.column_attrs}
            except Exception as e:
                raise ValueError(f"Error inspecting ORM object: {e}")

        # Case 5: If it's a list of tuples (single column), flatten the list
        if isinstance(data, list) and isinstance(data[0], tuple) and len(data[0]) == 1:
            return [item[0] for item in data]

        # Case 6: If it's a list of tuples (multiple columns), convert to dictionaries
        if isinstance(data, list) and isinstance(data[0], tuple):
            try:
                if hasattr(data[0], '_fields'):  # namedtuple
                    return [dict(row._asdict()) for row in data]
                else:  # plain tuple — return list of tuples or raise
                    return [list(row) for row in data]  # or raise error if that's not useful
            except Exception as e:
                raise ValueError(f"Error handling tuple data: {e}")

        return data  # Return as-is if none of the above cases match
    except Exception as e:
        raise ValueError(f"Error during serialization: {e}")

