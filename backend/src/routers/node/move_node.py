"""
What this file does: Exposes POST /node/{node_id}/move for moving a node to a new workspace/folder via copy-then-delete.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import (
    can_access_workspace,
    get_unique_name,
    get_workspace_tree_response,
    get_user_by_username,
)
from models import Api, ApiCase, Node
from routers.node.copy_node import copy_node_recursive
from schema import NodeCopyRequest
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/{node_id}/move")
async def move_node(
    node_id: int,
    request: NodeCopyRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /node/{node_id}/move — copy the node to the target location with a unique name, then delete the original."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        result = await db.execute(select(Node).where(Node.id == node_id))
        source_node = result.scalar_one_or_none()
        if not source_node:
            return create_response(404, error_message="Node not found")

        # Move deletes from source and writes into target — require editor on both
        if not await can_access_workspace(db, source_node.workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Source workspace access denied")
        if not await can_access_workspace(db, request.target_workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Target workspace access denied")

        unique_name = await get_unique_name(
            request.new_name or source_node.name,
            request.target_workspace_id,
            request.target_folder_id,
            db,
        )

        await copy_node_recursive(
            source_node,
            request.target_workspace_id,
            request.target_folder_id,
            unique_name,
            db,
        )

        # Collect all descendant ids of the source node for bulk delete
        cte_sql = text("""
            WITH RECURSIVE descendants AS (
                SELECT id FROM nodes WHERE id = :root_id
                UNION ALL
                SELECT n.id FROM nodes n
                JOIN descendants d ON n.parent_id = d.id
            )
            SELECT id FROM descendants
        """)
        ids_result = await db.execute(cte_sql, {"root_id": node_id})
        all_ids: list[int] = [row[0] for row in ids_result.fetchall()]

        await db.execute(
            delete(ApiCase).where(
                ApiCase.api_id.in_(select(Api.id).where(Api.file_id.in_(all_ids)))
            )
        )
        await db.execute(delete(Api).where(Api.file_id.in_(all_ids)))
        await db.execute(delete(Node).where(Node.id.in_(all_ids)))

        # Single commit covers both copy and delete
        await db.commit()

        data, err = await get_workspace_tree_response(db, request.target_workspace_id, include_apis=True)
        if not data:
            return create_response(404, error_message=err or "Workspace not found after move.")
        message = f"{source_node.type.title()} moved successfully"
        return create_response(200, value_correction(data), message=message)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
