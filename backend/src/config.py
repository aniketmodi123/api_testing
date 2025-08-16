from datetime import datetime
from pathlib import Path
from typing import List, Optional
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine.row import Row
from sqlalchemy.inspection import inspect
import os
from sqlalchemy import select, text, and_
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from dotenv import load_dotenv

from models import Node, User, VerifyLogin, Workspace

load_dotenv('/etc/env_base')


PROD_HOST = os.environ.get('PRODUCTION_POSTGRES_HOST')
PROD_USER = os.environ.get('PRODUCTION_POSTGRES_USER')
PROD_PASSWORD = os.environ.get('PRODUCTION_POSTGRES_PASSWORD')
PROD_DB = os.environ.get('PRODUCTION_POSTGRES_DB')
PROD_PORT = os.environ.get('PRODUCTION_POSTGRES_PORT')

# Get the base directory
base_dir = Path.cwd()
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', '')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', '')


try:
    engine = create_async_engine(
        f'postgresql+asyncpg://{PROD_USER}:{PROD_PASSWORD}@{PROD_HOST}:{PROD_PORT}/{PROD_DB}',
        echo=False,
        connect_args={
        "server_settings": {
            "application_name": "api_testing"
        }
    })
    SessionLocal = async_sessionmaker(
        bind=engine,
        expire_on_commit=False
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




# --------------- Audit logs --------------
async def log_failed_attempt(db: AsyncSession, user_name: str):
    """Log a failed login attempt in VerifyLogin table."""
    user_attempt = VerifyLogin(
        user_name=user_name,
        timestamp=datetime.now(),
        is_auth=False,
    )
    db.add(user_attempt)
    await db.flush()

async def log_success_attempt(db: AsyncSession, user_name: str):
    """Log a successful login attempt in VerifyLogin table."""
    user_attempt = VerifyLogin(
        user_name=user_name,
        timestamp=datetime.now(),
        is_auth=True,
    )
    db.add(user_attempt)
    await db.flush()


# Helper function to get user by username
async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    """Get user by username from header"""
    result = await db.execute(select(User).where(User.email == username))
    return result.scalar_one_or_none()


# Helper function to verify workspace ownership
async def verify_workspace_ownership(db: AsyncSession, workspace_id: int, user_id: int) -> bool:
    """Verify that the workspace belongs to the user"""
    result = await db.execute(
        select(Workspace).where(
            and_(
                Workspace.id == workspace_id,
                Workspace.user_id == user_id
            )
        )
    )
    return result.scalar_one_or_none() is not None


# Helper function to verify node ownership through workspace
async def verify_node_ownership(db: AsyncSession, node_id: int, user_id: int) -> Optional[Node]:
    """Verify that the node belongs to a workspace owned by the user"""
    result = await db.execute(
        select(Node)
        .join(Workspace, Node.workspace_id == Workspace.id)
        .where(
            and_(
                Node.id == node_id,
                Workspace.user_id == user_id
            )
        )
    )
    return result.scalar_one_or_none()


# Helper function to check if parent is valid
async def validate_parent_node(db: AsyncSession, parent_id: int, workspace_id: int) -> bool:
    """Validate that parent node exists, is a folder, and belongs to the same workspace"""
    if parent_id is None:
        return True

    result = await db.execute(
        select(Node).where(
            and_(
                Node.id == parent_id,
                Node.workspace_id == workspace_id,
                Node.type == "folder"
            )
        )
    )
    return result.scalar_one_or_none() is not None


# Helper function to check for circular reference
async def check_circular_reference(db: AsyncSession, node_id: int, new_parent_id: int) -> bool:
    """Check if moving a node would create a circular reference"""
    if new_parent_id is None:
        return False

    # Get all descendant nodes
    current_parent = new_parent_id
    visited = set()

    while current_parent is not None and current_parent not in visited:
        if current_parent == node_id:
            return True  # Circular reference detected

        visited.add(current_parent)
        result = await db.execute(select(Node.parent_id).where(Node.id == current_parent))
        parent_row = result.scalar_one_or_none()
        current_parent = parent_row if parent_row else None

    return False


# Helper function to build node path (breadcrumb)
async def get_node_path(db: AsyncSession, node_id: int) -> List[dict]:
    """Get the path from root to the current node"""
    path = []
    current_id = node_id
    visited = set()

    while current_id is not None and current_id not in visited:
        visited.add(current_id)
        result = await db.execute(
            select(Node.id, Node.name, Node.type, Node.parent_id)
            .where(Node.id == current_id)
        )
        node_data = result.first()

        if node_data:
            path.insert(0, {
                "id": node_data.id,
                "name": node_data.name,
                "type": node_data.type
            })
            current_id = node_data.parent_id
        else:
            break

    return path
