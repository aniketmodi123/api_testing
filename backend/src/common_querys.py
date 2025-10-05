from datetime import datetime
import re
from typing import Any, Dict, List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models import Header, Node, User, VerifyLogin, Workspace, Environment, Workspace, Api

from sqlalchemy.orm import selectinload


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



def build_file_tree(nodes: List[Node], include_apis: bool = False, apis_dict: Optional[dict] = None) -> List[dict]:
    """Build hierarchical file tree from flat node list, optionally including APIs and test cases"""
    node_dict = {node.id: {
        "id": node.id,
        "name": node.name,
        "type": node.type,
        "method": None,
        "parent_id": node.parent_id,
        "created_at": node.created_at,
        "children": []
    } for node in nodes}

    # Add APIs as children to their respective file nodes if requested
    if include_apis and apis_dict:
        for node_data in node_dict.values():
            if node_data["type"] == "file":
                file_apis = apis_dict.get(node_data["id"], [])
                for api in file_apis:
                    node_data["method"] = api.method
                    if api.cases:
                        for case in api.cases:
                            node_data["children"].append(
                                {
                                    "id": case.id,
                                    "name": case.name,
                                    "created_at": case.created_at.strftime("%Y-%m-%d %H:%M:%S")
                                }
                            )

    root_nodes = []
    for node_data in node_dict.values():
        if node_data["parent_id"] is None:
            root_nodes.append(node_data)
        else:
            parent = node_dict.get(node_data["parent_id"])
            if parent:
                parent["children"].append(node_data)

    # Sort children: files first, then folders, for every node recursively
    def sort_children(node):
        if node["children"]:
            # Only sort children that have a 'type' key (i.e., nodes, not API cases)
            node_children_with_type = [c for c in node["children"] if "type" in c]
            node_children_without_type = [c for c in node["children"] if "type" not in c]
            node_children_with_type.sort(key=lambda x: x["type"] == "folder")
            node["children"] = node_children_with_type + node_children_without_type
            for child in node_children_with_type:
                sort_children(child)
    for root in root_nodes:
        sort_children(root)

    return root_nodes


async def get_workspace_tree_response(db, workspace_id, include_apis=True):
    """
    Fetch workspace, nodes, apis, and build the tree response dict (for create, delete, move, copy, etc).
    Returns (data, message) tuple.
    """
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.nodes))
        .where(Workspace.id == workspace_id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        return None, "Workspace not found."

    apis_dict = {}
    total_apis = 0
    total_test_cases = 0

    if include_apis:
        apis_result = await db.execute(
            select(Api)
            .join(Node, Api.file_id == Node.id)
            .options(selectinload(Api.cases))
            .where(
                and_(
                    Node.workspace_id == workspace_id,
                    Api.is_active == True
                )
            )
        )
        apis = apis_result.scalars().all()
        for api in apis:
            if api.file_id not in apis_dict:
                apis_dict[api.file_id] = []
            apis_dict[api.file_id].append(api)
            total_apis += 1
            total_test_cases += len(api.cases) if api.cases else 0

    file_tree = build_file_tree(workspace.nodes, include_apis, apis_dict) if workspace.nodes else []

    data = {
        "id": workspace.id,
        "name": workspace.name,
        "description": workspace.description,
        "created_at": workspace.created_at,
        "file_tree": file_tree,
        "total_nodes": len(workspace.nodes) if workspace.nodes else 0,
        "include_apis": include_apis,
        "total_apis": total_apis,
        "total_test_cases": total_test_cases
    }
    return data, None


async def get_workspace_variables(db: AsyncSession, workspace_id: int) -> dict:
    """Get all enabled variables from the active environment in a workspace"""
    try:
        # Get active environment
        active_env_query = select(Environment).where(
            Environment.workspace_id == workspace_id,
            Environment.is_active == True
        )
        active_env_result = await db.execute(active_env_query)
        active_environment = active_env_result.scalar_one_or_none()

        if not active_environment or not active_environment.variables:
            return {}

        # Get all enabled variables with actual values (including secrets for execution)
        variables_dict = {}
        for key, var_data in active_environment.variables.items():
            if var_data is not None:
                variables_dict[key] = var_data

        return variables_dict
    except Exception as e:
        return {}





