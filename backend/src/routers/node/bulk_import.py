"""
What this file does: Exposes POST /node/bulk-import for atomically importing a collection of nodes with API data from a parsed Postman or cURL payload.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import can_access_workspace, get_user_by_username, get_workspace_tree_response
from models import Api, ApiCase, Node
from schema import BulkImportRequest
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.post("/node/bulk-import")
async def bulk_import_nodes(
    payload: BulkImportRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /node/bulk-import — import a tree of nodes with API data; resolves parent references via temp_id and deduplicates names."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        if not await can_access_workspace(db, payload.workspace_id, user.id, min_role="editor"):
            return create_response(403, error_message="Workspace access denied")

        # Pre-load all existing (parent_id, name) pairs in the workspace in one query
        # to avoid an N+1 SELECT per imported item during dedup checks.
        existing_result = await db.execute(
            select(Node.parent_id, Node.name).where(Node.workspace_id == payload.workspace_id)
        )
        # existing_names: set of (parent_id_or_None, name)
        existing_names: set[tuple] = {(row.parent_id, row.name) for row in existing_result.all()}

        # Map temp_id -> real DB Node id
        temp_to_real: dict[str, int] = {}

        # Topological sort: process items whose parent is already resolved
        items = list(payload.items)
        remaining_passes = len(items) + 1
        processed_ids: set[str] = set()

        while items and remaining_passes > 0:
            remaining_passes -= 1
            still_pending: list = []

            for item in items:
                if item.parent_temp_id and item.parent_temp_id not in temp_to_real:
                    still_pending.append(item)
                    continue

                parent_id = temp_to_real.get(item.parent_temp_id) if item.parent_temp_id else None

                # Dedup check against in-memory set — no extra DB query per item
                name = item.name
                if (parent_id, name) in existing_names:
                    name = f"{name} (imported)"

                node = Node(
                    workspace_id=payload.workspace_id,
                    name=name,
                    type=item.type,
                    parent_id=parent_id,
                )
                db.add(node)
                await db.flush()

                # Track the new name so later items in the same batch see it
                existing_names.add((parent_id, name))
                temp_to_real[item.temp_id] = node.id

                if item.type == "file" and item.api:
                    api_data = item.api
                    api = Api(
                        file_id=node.id,
                        name=api_data.name,
                        method=api_data.method.upper(),
                        endpoint=api_data.endpoint,
                        description=api_data.description or "",
                        is_active=True,
                    )
                    db.add(api)
                    await db.flush()

                    for case_data in (item.cases or []):
                        db.add(
                            ApiCase(
                                api_id=api.id,
                                name=case_data.name,
                                headers=case_data.headers or {},
                                params=case_data.params or {},
                                body=case_data.body or {},
                                expected=case_data.expected or {},
                            )
                        )

                processed_ids.add(item.temp_id)

            items = still_pending

        if items:
            await db.rollback()
            return create_response(400, error_message="Could not resolve parent references — check temp_id / parent_temp_id values")

        await db.commit()

        data, err = await get_workspace_tree_response(db, payload.workspace_id, include_apis=True)
        if not data:
            return create_response(404, error_message=err or "Import succeeded but workspace tree unavailable")

        return create_response(201, value_correction(data), message=f"Imported {len(processed_ids)} items")

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
