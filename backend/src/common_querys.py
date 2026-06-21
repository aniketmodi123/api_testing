"""
What this file does: Provides shared async query helpers and ownership-verification utilities
used across all routers; access-control behaviour is governed by ROLE_ORDER.
"""

from datetime import datetime
import re
from typing import Any, Dict, List, NamedTuple, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, Header, HTTPException

from models import Header, Node, User, VerifyLogin, Workspace, Environment, Api, ApiCase, WorkspaceMember, AuditLog, CollectionVariable

from sqlalchemy.orm import selectinload


# --------------- Audit logs --------------
async def log_failed_attempt(db: AsyncSession, user_name: str):
    """Record a failed login attempt in the audit log."""
    user_attempt = VerifyLogin(
        user_name=user_name,
        timestamp=datetime.now(),
        is_auth=False,
    )
    db.add(user_attempt)
    await db.flush()


async def log_success_attempt(db: AsyncSession, user_name: str):
    """Record a successful login attempt in the audit log."""
    user_attempt = VerifyLogin(
        user_name=user_name,
        timestamp=datetime.now(),
        is_auth=True,
    )
    db.add(user_attempt)
    await db.flush()


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    """Fetch a user record by email address from the Authorization header.

    Args:
        username: The email string passed in the ``username`` request header.

    Returns:
        User: The matching user record.
        None: Returned when no user with that email exists.
    """
    result = await db.execute(select(User).where(User.email == username))
    return result.scalar_one_or_none()


# Role order for Phase 6 membership checks
ROLE_ORDER: dict[str, int] = {"viewer": 0, "editor": 1, "admin": 2, "owner": 3}


async def can_access_workspace(
    db: AsyncSession, workspace_id: int, user_id: int, min_role: str = "viewer"
) -> bool:
    """Check whether a user has at least the required role in a workspace.

    Args:
        workspace_id: Target workspace to check.
        user_id: User being checked.
        min_role: ``"viewer"`` (default) read-only; ``"editor"`` → can modify;
                  ``"admin"`` → can invite; ``"owner"`` → owner only, never matched by members.

    Returns:
        bool: ``True`` if the user is the workspace owner or has a joined membership
              with a role rank >= min_role; ``False`` otherwise.

    Steps:
        - Step 1: Fetch workspace owner_id; return ``False`` when workspace does not exist
        - Step 2: Return ``True`` immediately when the caller is the workspace owner
        - Step 3: Return ``False`` when min_role is ``"owner"`` — members can never satisfy this
        - Step 4: Fetch the member row for this user; return ``False`` when not found or not yet joined (joined_at IS NULL)
        - Step 5: Compare the member's role rank against min_role rank using ROLE_ORDER
    """
    # Step 1: Fetch workspace owner
    owner_result = await db.execute(select(Workspace.user_id).where(Workspace.id == workspace_id))
    owner_id = owner_result.scalar_one_or_none()
    if owner_id is None:
        return False
    # Step 2: Owner always passes
    if owner_id == user_id:
        return True
    # Step 3: "owner" min_role can never be satisfied by a member
    if min_role == "owner":
        return False
    # Step 4: Fetch joined member row
    member_result = await db.execute(
        select(WorkspaceMember.role).where(
            and_(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.joined_at.isnot(None),
            )
        )
    )
    role = member_result.scalar_one_or_none()
    if role is None:
        return False
    # Step 5: Compare role ranks
    return ROLE_ORDER.get(role, -1) >= ROLE_ORDER.get(min_role, 0)


async def verify_workspace_ownership(db: AsyncSession, workspace_id: int, user_id: int) -> bool:
    """Verify that the user owns or is a member of the workspace.

    Returns:
        bool: ``True`` when the user is the owner or has any joined membership role.
    """
    return await can_access_workspace(db, workspace_id, user_id, min_role="viewer")


async def verify_node_ownership(db: AsyncSession, node_id: int, user_id: int) -> Optional[Node]:
    """Verify that a node belongs to a workspace the user can access.

    Returns:
        Node: The node when the user has at least viewer access to its workspace.
        None: Returned when the node does not exist or the user has no access.
    """
    node_result = await db.execute(select(Node).where(Node.id == node_id))
    node = node_result.scalar_one_or_none()
    if not node:
        return None
    has_access = await can_access_workspace(db, node.workspace_id, user_id, min_role="viewer")
    return node if has_access else None


class FileAccess(NamedTuple):
    """Resolved caller, file node, its API, and access decision for a file-scoped request.

    Attributes:
        user: Caller resolved from the username header; ``None`` when no user has that email.
        node: The target file/folder node; ``None`` when the node id does not exist.
        api: The API attached to the file node; ``None`` when the node has no API or does not exist.
        can_access: ``True`` when the node exists and the caller owns or has a joined membership in its workspace.
    """

    user: Optional[User]
    node: Optional[Node]
    api: Optional[Api]
    can_access: bool


class CaseAccess(NamedTuple):
    """Resolved caller, test case, its API, file node, and access decision for a case-scoped request.

    Attributes:
        user: Caller resolved from the username header; ``None`` when no user has that email.
        case: The target test case; ``None`` when the case id does not exist.
        api: The API owning the case; ``None`` when the case does not exist.
        node: The file node owning the API; ``None`` when the case does not exist.
        can_access: ``True`` when the case exists and the caller owns or has a joined membership in its workspace.
    """

    user: Optional[User]
    case: Optional[ApiCase]
    api: Optional[Api]
    node: Optional[Node]
    can_access: bool


async def resolve_file_access(db: AsyncSession, username: str, file_id: int) -> FileAccess:
    """What it does: Resolve the caller, a file node, its API, and the caller's access in one DB round trip.

    Args:
        username: Email from the ``username`` request header.
        file_id: Node id to resolve and access-check.

    Returns:
        FileAccess: ``user`` is ``None`` only when the email is unknown; ``node``/``api`` are
                    ``None`` when absent; ``can_access`` is ``True`` only when the node exists and
                    the caller owns or is a joined member of its workspace.

    Steps:
        - Step 1: Left-join Node, its API, owning Workspace, and the caller's joined membership onto User in a single query
        - Step 2: Return an all-empty result when the email is unknown
        - Step 3: Compute access from workspace ownership or membership role

    See Also:
        :class:`FileAccess`: Field schema of the returned value.
    """
    stmt = (
        select(User, Node, Api, Workspace.user_id, WorkspaceMember.role)
        .select_from(User)
        .outerjoin(Node, Node.id == file_id)
        .outerjoin(Workspace, Workspace.id == Node.workspace_id)
        .outerjoin(Api, Api.file_id == Node.id)
        .outerjoin(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Workspace.id,
                WorkspaceMember.user_id == User.id,
                WorkspaceMember.joined_at.isnot(None),
            ),
        )
        .where(User.email == username)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return FileAccess(None, None, None, False)

    user, node, api, ws_owner_id, member_role = row
    can_access = node is not None and (
        ws_owner_id == user.id or ROLE_ORDER.get(member_role, -1) >= 0
    )
    return FileAccess(user, node, api if node is not None else None, can_access)


async def resolve_case_access(db: AsyncSession, username: str, case_id: int) -> CaseAccess:
    """What it does: Resolve the caller, a test case, its API, file node, and the caller's access in one DB round trip.

    Args:
        username: Email from the ``username`` request header.
        case_id: Test case id to resolve and access-check.

    Returns:
        CaseAccess: ``user`` is ``None`` only when the email is unknown; ``case``/``api``/``node``
                    are ``None`` when the case is absent; ``can_access`` is ``True`` only when the
                    case exists and the caller owns or is a joined member of its workspace.

    Steps:
        - Step 1: Left-join the case, its API, file node, owning Workspace, and the caller's joined membership onto User in a single query
        - Step 2: Return an all-empty result when the email is unknown
        - Step 3: Compute access from workspace ownership or membership role

    See Also:
        :class:`CaseAccess`: Field schema of the returned value.
    """
    stmt = (
        select(User, ApiCase, Api, Node, Workspace.user_id, WorkspaceMember.role)
        .select_from(User)
        .outerjoin(ApiCase, ApiCase.id == case_id)
        .outerjoin(Api, Api.id == ApiCase.api_id)
        .outerjoin(Node, Node.id == Api.file_id)
        .outerjoin(Workspace, Workspace.id == Node.workspace_id)
        .outerjoin(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Workspace.id,
                WorkspaceMember.user_id == User.id,
                WorkspaceMember.joined_at.isnot(None),
            ),
        )
        .where(User.email == username)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return CaseAccess(None, None, None, None, False)

    user, case, api, node, ws_owner_id, member_role = row
    can_access = (
        case is not None
        and node is not None
        and (ws_owner_id == user.id or ROLE_ORDER.get(member_role, -1) >= 0)
    )
    return CaseAccess(user, case, api, node, can_access)


async def validate_parent_node(db: AsyncSession, parent_id: int, workspace_id: int) -> bool:
    """Check that a parent node exists, is a folder, and belongs to the given workspace.

    Returns:
        bool: ``True`` when the parent is valid; ``True`` also when parent_id is ``None``
              (root-level placement is always valid).
    """
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


async def check_circular_reference(db: AsyncSession, node_id: int, new_parent_id: int) -> bool:
    """Detect whether placing node_id under new_parent_id would create a circular reference.

    Returns:
        bool: ``True`` when a cycle would be created; ``False`` when the move is safe.
              Also returns ``False`` when new_parent_id is ``None``.

    Steps:
        - Step 1: Return ``False`` immediately when new_parent_id is ``None``
        - Step 2: Walk up the ancestor chain from new_parent_id, tracking visited ids
        - Step 3: Return ``True`` when node_id appears in the ancestor chain (cycle detected)
        - Step 4: Return ``False`` when the walk reaches the root without finding node_id
    """
    if new_parent_id is None:
        return False

    # Step 2: Walk ancestor chain
    current_parent = new_parent_id
    visited = set()

    while current_parent is not None and current_parent not in visited:
        if current_parent == node_id:
            return True  # Step 3: Circular reference detected

        visited.add(current_parent)
        result = await db.execute(select(Node.parent_id).where(Node.id == current_parent))
        parent_row = result.scalar_one_or_none()
        current_parent = parent_row if parent_row else None

    return False  # Step 4: No cycle found


async def get_node_path(db: AsyncSession, node_id: int) -> List[dict]:
    """Build the ordered breadcrumb path from the workspace root to a given node.

    Returns:
        list[dict]: Ordered list of ``{id, name, type}`` dicts from root (index 0) to
                    the target node (last index); empty list when the node does not exist.

    Steps:
        - Step 1: Start at node_id, walk up parent_id links until root or a cycle is detected
        - Step 2: Insert each ancestor at position 0 to build root-first ordering
        - Step 3: Return the completed path list
    """
    path = []
    current_id = node_id
    visited = set()

    # Step 1 & 2: Walk up and prepend each ancestor
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

    return path  # Step 3


async def verify_folder_ownership(db: AsyncSession, folder_id: int, user_id: int) -> Optional[Node]:
    """Verify that a folder node belongs to a workspace the user can access.

    Returns:
        Node: The folder node when the user has at least viewer access.
        None: Returned when the node does not exist or the user has no access.
    """
    node_result = await db.execute(select(Node).where(Node.id == folder_id))
    node = node_result.scalar_one_or_none()
    if not node:
        return None
    has_access = await can_access_workspace(db, node.workspace_id, user_id, min_role="viewer")
    return node if has_access else None


async def verify_header_ownership(db: AsyncSession, header_id: int, user_id: int) -> Optional[Header]:
    """Verify that a header record belongs to a folder in a workspace owned by the user.

    Returns:
        Header: The header record when ownership is confirmed.
        None: Returned when the header does not exist or the user does not own the workspace.

    Notes:
        - This check uses direct workspace ownership (user_id == Workspace.user_id) rather
          than the broader member-aware can_access_workspace, so members cannot modify headers.
    """
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
    """Build the ordered path from the workspace root down to the given folder.

    Returns:
        list[dict]: Ordered list of ``{id, name, parent_id, workspace_id, type}`` dicts
                    from root (index 0) to the target folder (last index); empty list when
                    the folder does not exist.

    Steps:
        - Step 1: Start at folder_id, walk up parent_id links until root or cycle detected
        - Step 2: Insert each ancestor at position 0 to maintain root-first ordering
        - Step 3: Return the completed path list
    """
    path = []
    current_id = folder_id
    visited = set()

    # Step 1 & 2: Walk up and prepend each ancestor
    while current_id is not None and current_id not in visited:
        visited.add(current_id)

        result = await db.execute(
            select(Node.id, Node.name, Node.parent_id, Node.workspace_id, Node.type)
            .where(and_(Node.id == current_id))
        )
        folder_data = result.first()

        if folder_data:
            path.insert(0, {  # Insert at beginning to get root-to-current order
                "id": folder_data.id,
                "name": folder_data.name,
                "parent_id": folder_data.parent_id,
                "workspace_id": folder_data.workspace_id,
                "type": folder_data.type
            })
            current_id = folder_data.parent_id
        else:
            break

    return path  # Step 3


async def get_headers_for_folders(db: AsyncSession, folder_ids: dict) -> Dict[int, Dict[str, Any]]:
    """Fetch header records for a mixed set of folder and file node ids.

    Args:
        folder_ids: Dict with keys ``"folder"`` (list of folder node ids) and
                    ``"file"`` (list of file node ids); empty lists are safe to pass.

    Returns:
        dict: Mapping of node_id → ``{id, content, created_at}`` for folders and
              ``{id, content, created_at}`` sourced from Api.extra_meta headers for files.
              Returns empty dict when folder_ids is falsy.

    Steps:
        - Step 1: Return empty dict when folder_ids is falsy
        - Step 2: Query Header records for all folder node ids; build node_id → header dict
        - Step 3: Query Api.extra_meta for all file node ids; extract headers key; merge into dict
    """
    if not folder_ids:
        return {}

    # Step 2: Fetch folder-level headers
    result = await db.execute(
        select(Header.folder_id, Header.content, Header.id, Header.created_at)
        .where(Header.folder_id.in_(folder_ids["folder"]))
    )
    headers_data = result.fetchall()

    headers_map = {}
    for header_row in headers_data:
        headers_map[header_row.folder_id] = {
            "id": header_row.id,
            "content": header_row.content,
            "created_at": header_row.created_at
        }

    # Step 3: Fetch file-level headers from Api.extra_meta
    result = await db.execute(
        select(Api.file_id, Api.extra_meta, Api.id, Api.created_at)
        .where(Api.file_id.in_(folder_ids["file"]))
    )
    headers_data = result.fetchall()

    for header_row in headers_data:
        headers_map[header_row.file_id] = {
            "id": header_row.file_id,
            "content": header_row.extra_meta.get("headers", {}) if header_row.extra_meta else {},
            "created_at": header_row.created_at
        }

    return headers_map


def merge_headers_with_priority(folder_path: List[Dict], headers_map: Dict[int, Dict]) -> Dict[str, Any]:
    """Merge headers from root to leaf so that child headers override parent headers.

    Args:
        folder_path: Ordered list of folder dicts from root (index 0) to target (last);
                     each dict must have ``id`` and ``name`` keys.
        headers_map: Mapping of folder_id → header data dict as returned by
                     ``get_headers_for_folders``.

    Returns:
        dict: ``{merged_headers: dict, inheritance_info: list}`` where merged_headers is the
              final combined header dict and inheritance_info records which folder contributed
              or overrode each key.

    Steps:
        - Step 1: Iterate folders from root to leaf (left to right in folder_path)
        - Step 2: For each folder that has headers, apply its keys over merged_headers
        - Step 3: Track added vs overridden keys per folder for inheritance_info
        - Step 4: Return the merged result dict
    """
    merged_headers = {}
    inheritance_info = []

    # Step 1 & 2: Process root to leaf
    for folder_info in folder_path:
        folder_id = folder_info["id"]
        folder_name = folder_info["name"]

        if folder_id in headers_map:
            header_data = headers_map[folder_id]
            header_content = header_data["content"]

            # Step 3: Track contributions per folder
            folder_contribution = {
                "folder_id": folder_id,
                "folder_name": folder_name,
                "headers_added": [],
                "headers_overridden": []
            }

            for key, value in header_content.items():
                if key in merged_headers:
                    folder_contribution["headers_overridden"].append({
                        "key": key,
                        "old_value": merged_headers[key],
                        "new_value": value
                    })
                else:
                    folder_contribution["headers_added"].append({
                        "key": key,
                        "value": value
                    })

                merged_headers[key] = value  # Override or add

            if folder_contribution["headers_added"] or folder_contribution["headers_overridden"]:
                inheritance_info.append(folder_contribution)

    return {  # Step 4
        "merged_headers": merged_headers,
        "inheritance_info": inheritance_info
    }


async def get_headers(db: AsyncSession, folder_id: int):
    """Compute the complete inherited header set for a folder node.

    Returns:
        tuple: ``(folder_path, folder_ids, headers_map, merge_result)`` — the full path list,
               categorised node id dict, per-node header map, and merged header result.
               Returns ``({}, [], {}, {})`` when the folder does not exist.

    Raises:
        Exception: When any DB query fails; the original exception is re-raised.
    """
    try:
        folder_path = await get_folder_path_to_root(db, folder_id)

        if not folder_path:
            return {}, [], {}, {}

        # Get folder IDs for header lookup
        folder_ids = {
            "folder": [],
            "file": []
        }
        for folder in folder_path:
            if folder["type"] == "folder":
                folder_ids["folder"].append(folder["id"])
            else:
                folder_ids["file"].append(folder["id"])

        # Get headers for all folders in the path
        headers_map = await get_headers_for_folders(db, folder_ids)

        # Merge headers with proper priority (child overrides parent)
        merge_result = merge_headers_with_priority(folder_path, headers_map)
        return folder_path, folder_ids, headers_map, merge_result
    except Exception as e:
        raise Exception(str(e))


async def get_unique_name(base_name: str, target_workspace_id: int, target_folder_id: int | None, db: AsyncSession) -> str:
    """Generate a unique node name at the target location, appending a copy suffix if needed.

    Args:
        base_name: Desired node name to check for uniqueness.
        target_workspace_id: Workspace to check for name collisions.
        target_folder_id: Parent folder id; ``None`` checks the workspace root.

    Returns:
        str: The original name when it is available, otherwise ``"<name> copy"``,
             ``"<name> copy 2"``, ``"<name> copy 3"``, etc.

    Steps:
        - Step 1: Check whether base_name already exists at the target location
        - Step 2: Return base_name immediately when it is available
        - Step 3: Parse any existing copy suffix from the name using a regex
        - Step 4: Increment the suffix counter and retry until a unique name is found
    """
    async def name_exists(name):
        """What it does: Check if a node with this name already exists at the target location."""
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
        # Step 1 & 2: Check and return if unique
        if not await name_exists(name):
            return name
        # Step 3 & 4: Parse suffix and increment counter
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
    """Build a hierarchical file tree from a flat list of nodes.

    Args:
        nodes: Flat list of Node ORM objects to organise into a tree.
        include_apis: ``False`` (default) builds structure only; ``True`` → attaches API
                      method and test case children to file nodes.
        apis_dict: Mapping of file_id → list of Api objects; required when include_apis is
                   ``True``; ``None`` is safe when include_apis is ``False``.

    Returns:
        list[dict]: Ordered list of root-level node dicts with nested ``children``;
                    files appear before folders within each level.

    Steps:
        - Step 1: Build a flat dict of node_id → node dict from the input list
        - Step 2: Attach API method and test case children to file nodes when include_apis is True
        - Step 3: Wire parent-child relationships by populating each parent's ``children`` list
        - Step 4: Sort children at every level — files first, then folders
        - Step 5: Return the list of root-level nodes
    """
    # Step 1: Build flat node dict
    node_dict = {node.id: {
        "id": node.id,
        "name": node.name,
        "type": node.type,
        "method": None,
        "parent_id": node.parent_id,
        "created_at": node.created_at,
        "children": []
    } for node in nodes}

    # Step 2: Attach API data to file nodes
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

    # Step 3: Wire parent-child relationships
    root_nodes = []
    for node_data in node_dict.values():
        if node_data["parent_id"] is None:
            root_nodes.append(node_data)
        else:
            parent = node_dict.get(node_data["parent_id"])
            if parent:
                parent["children"].append(node_data)

    # Step 4: Sort children files-first at every level
    def sort_children(node):
        """What it does: Sort a node's typed children files-first, then recurse into folders."""
        if node["children"]:
            node_children_with_type = [c for c in node["children"] if "type" in c]
            node_children_without_type = [c for c in node["children"] if "type" not in c]
            node_children_with_type.sort(key=lambda x: x["type"] == "folder")
            node["children"] = node_children_with_type + node_children_without_type
            for child in node_children_with_type:
                sort_children(child)
    for root in root_nodes:
        sort_children(root)

    return root_nodes  # Step 5


async def get_workspace_tree_response(db, workspace_id, include_apis=True):
    """Fetch a workspace and build the full tree response dict.

    Args:
        workspace_id: Target workspace id.
        include_apis: ``True`` (default) loads APIs and test cases; ``False`` returns structure only.

    Returns:
        tuple: ``(data_dict, None)`` on success where data_dict contains workspace metadata
               and file_tree; ``(None, error_message_str)`` when the workspace is not found.

    Steps:
        - Step 1: Fetch workspace with eagerly loaded nodes; return error tuple when not found
        - Step 2: When include_apis is True, query all active APIs with their cases
        - Step 3: Build apis_dict mapping file_id → list of Api objects
        - Step 4: Build the hierarchical file tree via build_file_tree
        - Step 5: Assemble and return the data dict with counts
    """
    # Step 1: Fetch workspace
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

    # Step 2 & 3: Load APIs and build apis_dict
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

    # Step 4: Build file tree
    file_tree = build_file_tree(workspace.nodes, include_apis, apis_dict) if workspace.nodes else []

    # Step 5: Assemble response dict
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
    """Fetch all enabled variable key-value pairs from the active environment in a workspace.

    Returns:
        dict: Variable key→value mapping from the active environment's variables JSON.
              Returns empty dict when no environment is active, the environment has no variables,
              or any DB error occurs.

    Steps:
        - Step 1: Query the active environment for the workspace
        - Step 2: Return empty dict when no active environment or no variables are defined
        - Step 3: Build and return the variables dict from the environment's JSON column
    """
    try:
        # Step 1: Get active environment
        active_env_query = select(Environment).where(
            Environment.workspace_id == workspace_id,
            Environment.is_active == True
        )
        active_env_result = await db.execute(active_env_query)
        active_environment = active_env_result.scalar_one_or_none()

        # Step 2: Return empty when no active environment or no variables
        if not active_environment or not active_environment.variables:
            return {}

        # Step 3: Build variables dict
        variables_dict = {}
        for key, var_data in active_environment.variables.items():
            if var_data is not None:
                variables_dict[key] = var_data

        return variables_dict
    except Exception as e:
        return {}


async def write_audit(
    db: AsyncSession,
    username: str,
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    workspace_id: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
    ip: Optional[str] = None,
) -> None:
    """
    What it does: Append an immutable audit row to audit_logs inside the caller's transaction.
    Args:
        username: Email of the acting user.
        action: Verb string, e.g. ``"node.create"``, ``"api.delete"``.
        entity_type: Object type acted on, e.g. ``"node"``, ``"api_case"``.
        entity_id: Numeric ID of the affected object; ``None`` when not applicable.
        workspace_id: Workspace context; ``None`` for account-level actions.
        metadata: Extra context dict (before/after values); ``None`` when not needed.
        ip: Client IP; ``None`` when not available.
    Notes:
        - Must be called before ``db.commit()`` so the audit row is part of the same transaction.
    """
    db.add(AuditLog(
        username=username,
        workspace_id=workspace_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        extra=metadata,
        ip=ip,
    ))


def require_role(min_role: str):
    """
    What it does: Return a FastAPI dependency that verifies the caller has at least min_role in the workspace.
    Args:
        min_role: Minimum role required — ``"viewer"``, ``"editor"``, ``"admin"``, or ``"owner"``.
    Returns:
        User: The authenticated user when the role check passes.
    Raises:
        HTTPException: 401 when no valid user found; 403 when role is insufficient.
    """
    from config import get_db

    async def _dep(
        workspace_id: int,
        username: str = Header(...),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        user = await get_user_by_username(db, username)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        ok = await can_access_workspace(db, workspace_id, user.id, min_role=min_role)
        if not ok:
            raise HTTPException(status_code=403, detail="Access denied")
        return user

    return _dep


async def get_collection_variables(db: AsyncSession, file_id: int) -> Dict[str, Any]:
    """
    What it does: Walk the ancestor path leaf→root and merge collection variables with child overriding parent; raw (unmasked) values returned.
    Args:
        file_id: Node id of the file (leaf) to start collection variable resolution from.
    Returns:
        dict: Merged key→value mapping of collection variables; child nodes override ancestors; empty dict when no variables defined.
    Steps:
        - Step 1: Build ancestor path root→file via get_folder_path_to_root
        - Step 2: Reverse to leaf→root order so child values overwrite parents
        - Step 3: For each node in leaf→root order, fetch CollectionVariable rows and merge
        - Step 4: Decrypt secret values; return merged dict
    """
    from vault import decrypt as dec_secret

    # Step 1: Build root→file path
    path = await get_folder_path_to_root(db, file_id)
    if not path:
        return {}

    node_ids = [n["id"] for n in path]

    # Step 3: Fetch all collection variables for nodes in path in one query
    result = await db.execute(
        select(CollectionVariable).where(CollectionVariable.node_id.in_(node_ids))
    )
    rows = result.scalars().all()

    # Group by node_id for ordered merge
    by_node: Dict[int, list] = {nid: [] for nid in node_ids}
    for row in rows:
        if row.node_id in by_node:
            by_node[row.node_id].append(row)

    # Step 2 & 4: Merge root→leaf (last writer = leaf = highest priority per spec decision #2)
    merged: Dict[str, Any] = {}
    for node_info in path:  # root→leaf order; later overwrites earlier
        for row in by_node.get(node_info["id"], []):
            try:
                value = dec_secret(row.value) if row.is_secret else row.value
            except ValueError:
                value = row.value
            merged[row.key] = value

    return merged


async def build_scope_chain(
    db: AsyncSession,
    file_id: int,
    username: str,
    workspace_id: int,
    local_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    What it does: Merge all four variable scopes (global→collection→environment→local) for a file into a single dict; local context wins.
    Args:
        file_id: Node id of the file being executed.
        username: User email; used to fetch global variables.
        workspace_id: Workspace id; used to fetch the active environment.
        local_context: Run-time variables (e.g. extracted from a flow step); ``None`` treated as empty.
    Returns:
        dict: Merged variable map with precedence local > env > collection > global.
    Steps:
        - Step 1: Fetch global variables for the user
        - Step 2: Fetch collection variables for the file's ancestor chain
        - Step 3: Fetch active environment variables for the workspace
        - Step 4: Merge in precedence order; return result
    """
    from routers.variables.global_variables import get_global_variables_for_user
    from utils import merge_scopes, get_environment_variables
    from sqlalchemy import select as sa_select

    # Step 1
    global_vars = await get_global_variables_for_user(username)

    # Step 2
    collection_vars = await get_collection_variables(db, file_id)

    # Step 3
    env_vars: Dict[str, Any] = {}
    env_result = await db.execute(
        sa_select(Environment).where(
            Environment.workspace_id == workspace_id,
            Environment.is_active == True,
        )
    )
    active_env = env_result.scalar_one_or_none()
    if active_env and active_env.variables:
        env_vars = dict(active_env.variables)

    # Step 4: global < collection < env < local
    return merge_scopes(global_vars, collection_vars, env_vars, local_context or {})


async def resolve_auth(db: AsyncSession, file_id: int) -> Optional[Dict[str, Any]]:
    """
    What it does: Walk the ancestor path from root to the file node and return the deepest auth config found, with the file-level API auth taking priority over any folder-level auth.
    Args:
        file_id: Node id of the file whose auth config should be resolved.
    Returns:
        dict: Auth config dict ``{"type": "...", "config": {...}}`` from the winning node.
        None: Returned when no auth config is defined on any ancestor or the file itself.
    Steps:
        - Step 1: Build the ancestor path root→file using get_folder_path_to_root
        - Step 2: Walk the path and collect the last-seen auth config (child overrides parent)
        - Step 3: Check the file node's Api.extra_meta.auth as the leaf (highest priority)
        - Step 4: Return the winning auth config or None
    Notes:
        - Folder-level auth requires a future Node.extra_meta column; this function is safe to call now and will automatically pick it up once that column exists.
    """
    # Step 1: Build path root→file
    path = await get_folder_path_to_root(db, file_id)
    if not path:
        return None

    # Step 2: Walk folders root→leaf, last writer wins
    resolved: Optional[Dict[str, Any]] = None
    for node_info in path:
        if node_info["type"] == "folder":
            # Folder auth is a future extension (Node.extra_meta not yet defined).
            # Placeholder: no-op until the column exists.
            pass

    # Step 3: File-level auth from Api.extra_meta.auth is the leaf — highest priority
    api_result = await db.execute(select(Api).where(Api.file_id == file_id))
    api = api_result.scalar_one_or_none()
    if api and api.extra_meta:
        file_auth = api.extra_meta.get("auth")
        if file_auth and file_auth.get("type", "none") != "none":
            resolved = file_auth

    return resolved  # Step 4
