from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine.row import Row
from sqlalchemy.inspection import inspect
import os, ssl
from sqlalchemy import select, text, and_
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from models import Header, Node, User, VerifyLogin, Workspace


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


# Helper function to verify folder ownership and type
async def verify_folder_ownership(db: AsyncSession, folder_id: int, user_id: int) -> Optional[Node]:
    """Verify that the folder belongs to a workspace owned by the user and is actually a folder"""
    result = await db.execute(
        select(Node)
        .join(Workspace, Node.workspace_id == Workspace.id)
        .where(
            and_(
                Node.id == folder_id,
                Workspace.user_id == user_id
            )
        )
    )
    return result.scalar_one_or_none()


# Helper function to verify header ownership
async def verify_header_ownership(db: AsyncSession, header_id: int, user_id: int) -> Optional[Header]:
    """Verify that the header belongs to a folder in a workspace owned by the user"""
    result = await db.execute(
        select(Header)
        .join(Node, Header.folder_id == Node.id)
        .join(Workspace, Node.workspace_id == Workspace.id)
        .where(
            and_(
                Header.id == header_id,
                Node.type == "folder",
                Workspace.user_id == user_id
            )
        )
    )
    return result.scalar_one_or_none()


async def get_folder_path_to_root(db: AsyncSession, folder_id: int) -> List[Dict[str, Any]]:
    """Get the path from current folder to root (including current folder)"""
    path = []
    current_id = folder_id
    visited = set()

    while current_id is not None and current_id not in visited:
        visited.add(current_id)

        # Get folder info
        result = await db.execute(
            select(Node.id, Node.name, Node.parent_id, Node.workspace_id)
            .where(and_(Node.id == current_id))
        )
        folder_data = result.first()

        if folder_data:
            path.insert(0, {  # Insert at beginning to get root-to-current order
                "id": folder_data.id,
                "name": folder_data.name,
                "parent_id": folder_data.parent_id,
                "workspace_id": folder_data.workspace_id
            })
            current_id = folder_data.parent_id
        else:
            break

    return path


async def get_headers_for_folders(db: AsyncSession, folder_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    """Get headers for multiple folders"""
    if not folder_ids:
        return {}

    result = await db.execute(
        select(Header.folder_id, Header.content, Header.id, Header.created_at)
        .where(Header.folder_id.in_(folder_ids))
    )
    headers_data = result.fetchall()

    headers_map = {}
    for header_row in headers_data:
        headers_map[header_row.folder_id] = {
            "id": header_row.id,
            "content": header_row.content,
            "created_at": header_row.created_at
        }

    return headers_map


def merge_headers_with_priority(folder_path: List[Dict], headers_map: Dict[int, Dict]) -> Dict[str, Any]:
    """
    Merge headers from root to leaf, with child headers overriding parent headers
    Priority: Root (lowest) -> ... -> Leaf (highest)
    """
    merged_headers = {}
    inheritance_info = []

    # Process folders from root to leaf (left to right in path)
    for folder_info in folder_path:
        folder_id = folder_info["id"]
        folder_name = folder_info["name"]

        if folder_id in headers_map:
            header_data = headers_map[folder_id]
            header_content = header_data["content"]

            # Track which keys come from which folder
            folder_contribution = {
                "folder_id": folder_id,
                "folder_name": folder_name,
                "headers_added": [],
                "headers_overridden": []
            }

            for key, value in header_content.items():
                if key in merged_headers:
                    # Key already exists, this folder overrides it
                    folder_contribution["headers_overridden"].append({
                        "key": key,
                        "old_value": merged_headers[key],
                        "new_value": value
                    })
                else:
                    # New key from this folder
                    folder_contribution["headers_added"].append({
                        "key": key,
                        "value": value
                    })

                merged_headers[key] = value  # Override or add

            # Only add to inheritance_info if this folder contributed something
            if folder_contribution["headers_added"] or folder_contribution["headers_overridden"]:
                inheritance_info.append(folder_contribution)

    return {
        "merged_headers": merged_headers,
        "inheritance_info": inheritance_info
    }


async def get_headers(db: AsyncSession, folder_id: int):
    try:
        folder_path = await get_folder_path_to_root(db, folder_id)

        if not folder_path:
            return {}, [], {}, {}

        # Get folder IDs for header lookup
        folder_ids = [folder["id"] for folder in folder_path]

        # Get headers for all folders in the path
        headers_map = await get_headers_for_folders(db, folder_ids)

        # Merge headers with proper priority (child overrides parent)
        merge_result = merge_headers_with_priority(folder_path, headers_map)
        return folder_path, folder_ids, headers_map, merge_result
    except Exception as e:
        raise Exception(str(e))