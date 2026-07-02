"""
What this file does: Exposes GET /{folder_id}/headers/complete and /inheritance-preview for resolving inherited folder headers up to the workspace root.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any

from config import get_db
from common_querys import get_user_by_username, can_access_workspace, get_headers
from models import Node, Header
from schema import CompleteHeadersResponse, HeaderInheritancePreviewResponse
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()




@router.get("/{folder_id}/headers/complete")
async def get_complete_folder_headers(
    folder_id: int,
    username: str = FastAPIHeader(...),
    include_inheritance_details: bool = FastAPIHeader(False, alias="include-details"),
    db: AsyncSession = Depends(get_db)
):
    """GET /{folder_id}/headers/complete — return merged headers inherited from all ancestor folders, with child headers taking priority."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Fetch folder, then require at least viewer access
        folder_result = await db.execute(select(Node).where(Node.id == folder_id))
        target_folder = folder_result.scalar_one_or_none()
        if not target_folder:
            return create_response(404, error_message="Folder not found")
        if not await can_access_workspace(db, target_folder.workspace_id, user.id, min_role="viewer"):
            return create_response(403, error_message="Access denied")

        # Get path from root to target folder
        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, folder_id)
        if not folder_path:
            return create_response(404, error_message="Folder not found")

        # Prepare response data
        data = {
            "folder_id": folder_id,
            "folder_name": target_folder.name,
            "workspace_id": target_folder.workspace_id,
            "complete_headers": merge_result["merged_headers"],
            "headers_count": len(merge_result["merged_headers"]),
            "inheritance_path": [
                {
                    "id": folder["id"],
                    "name": folder["name"],
                    "has_headers": folder["id"] in headers_map
                } for folder in folder_path
            ],
            "folders_with_headers": len([f_id for f_id in folder_ids if f_id in headers_map])
        }

        # Add detailed inheritance information if requested
        if include_inheritance_details:
            data["inheritance_details"] = merge_result["inheritance_info"]
            data["raw_headers_by_folder"] = {
                str(folder_id): headers_map.get(folder_id, {}).get("content", {})
                for folder_id in folder_ids
                if folder_id in headers_map
            }

        return create_response(200, value_correction(data), CompleteHeadersResponse)

    except Exception as e:
        return ExceptionHandler(e)


# Bonus: Get inheritance preview (useful for UI)
@router.get("/{folder_id}/headers/inheritance-preview")
async def get_headers_inheritance_preview(
    folder_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """GET /{folder_id}/headers/inheritance-preview — return per-folder header contributions along the ancestor path without merging."""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Fetch folder, then require at least viewer access
        folder_result = await db.execute(select(Node).where(Node.id == folder_id))
        target_folder = folder_result.scalar_one_or_none()
        if not target_folder:
            return create_response(404, error_message="Folder not found")
        if not await can_access_workspace(db, target_folder.workspace_id, user.id, min_role="viewer"):
            return create_response(403, error_message="Access denied")

        # Get path from root to target folder
        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, folder_id)
        if not folder_path:
            return create_response(404, error_message="Folder not found")

        # Build inheritance preview
        inheritance_preview = []
        for i, folder_info in enumerate(folder_path):
            folder_id_iter = folder_info["id"]
            folder_data = {
                "level": i + 1,
                "folder_id": folder_id_iter,
                "folder_name": folder_info["name"],
                "has_headers": folder_id_iter in headers_map,
                "headers": {},
                "headers_count": 0
            }

            if folder_id_iter in headers_map:
                header_content = headers_map[folder_id_iter]["content"]
                folder_data["headers"] = header_content
                folder_data["headers_count"] = len(header_content)
                folder_data["header_id"] = headers_map[folder_id_iter]["id"]
                folder_data["created_at"] = headers_map[folder_id_iter]["created_at"]

            inheritance_preview.append(folder_data)

        data = {
            "target_folder_id": folder_id,
            "target_folder_name": target_folder.name,
            "inheritance_path": inheritance_preview,
            "total_levels": len(folder_path),
            "folders_with_headers": len([f for f in inheritance_preview if f["has_headers"]])
        }

        return create_response(200, value_correction(data), HeaderInheritancePreviewResponse)

    except Exception as e:
        return ExceptionHandler(e)