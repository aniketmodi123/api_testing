"""
What this file does: Exposes DELETE /node/{node_id} for recursively deleting a node and all its children, APIs, and test cases.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import has_min_role, resolve_node_access, get_workspace_tree_response, write_audit
from models import Api, ApiCase, Node
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.delete("/{node_id}")
async def delete_node(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """DELETE /node/{node_id} — recursively delete a node plus all child nodes, associated APIs, and test cases; return updated workspace tree."""
    try:
        na = await resolve_node_access(db, username, node_id)
        if na.user is None:
            return create_response(400, error_message="User not found")
        if na.node is None:
            return create_response(404, error_message="Node not found")
        if not has_min_role(na, "editor"):
            return create_response(403, error_message="Access denied")

        workspace_id = na.node.workspace_id
        node_type = na.node.type

        # Collect all descendant ids (including the root) via a recursive CTE — one query
        cte_sql = text("""
            WITH RECURSIVE descendants AS (
                SELECT id, type FROM nodes WHERE id = :root_id
                UNION ALL
                SELECT n.id, n.type FROM nodes n
                JOIN descendants d ON n.parent_id = d.id
            )
            SELECT id FROM descendants
        """)
        ids_result = await db.execute(cte_sql, {"root_id": node_id})
        all_ids: list[int] = [row[0] for row in ids_result.fetchall()]

        # Bulk delete: cases → apis → nodes (FK constraint order)
        await db.execute(
            delete(ApiCase).where(
                ApiCase.api_id.in_(select(Api.id).where(Api.file_id.in_(all_ids)))
            )
        )
        await db.execute(delete(Api).where(Api.file_id.in_(all_ids)))
        await db.execute(delete(Node).where(Node.id.in_(all_ids)))

        await write_audit(
            db,
            username=na.user.username,
            action="node.delete",
            entity_type="node",
            entity_id=node_id,
            workspace_id=workspace_id,
        )
        await db.commit()

        message = f"{node_type.title()} deleted successfully"
        if len(all_ids) > 1:
            message += f" (including {len(all_ids) - 1} child items)"

        data, err = await get_workspace_tree_response(db, workspace_id, include_apis=True)
        if not data:
            return create_response(404, error_message=err or "Workspace not found after delete.")
        return create_response(200, value_correction(data), message=message)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
