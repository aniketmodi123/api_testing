"""
What this file does: Exposes GET /{folder_id}/headers/complete and /inheritance-preview for resolving inherited folder headers up to the workspace root.
"""

from fastapi import APIRouter, Depends, Header as FastAPIHeader
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import resolve_node_access, has_min_role, get_headers
from schema import CompleteHeadersResponse, HeaderInheritancePreviewResponse
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


@router.get("/{folder_id}/headers/complete")
async def get_complete_folder_headers(
    folder_id: int,
    username: str = FastAPIHeader(...),
    include_inheritance_details: bool = FastAPIHeader(False, alias="include-details"),
    db: AsyncSession = Depends(get_db),
):
    """GET /{folder_id}/headers/complete — return merged headers inherited from all ancestor folders, with child headers taking priority."""
    try:
        access = await resolve_node_access(db, username, folder_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.node:
            return create_response(404, error_message="Folder not found")
        if not has_min_role(access, "viewer"):
            return create_response(403, error_message="Access denied")

        target_folder = access.node

        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, folder_id)
        if not folder_path:
            return create_response(404, error_message="Folder not found")

        all_node_ids = folder_ids.get("folder", []) + folder_ids.get("file", [])
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
                    "has_headers": folder["id"] in headers_map,
                }
                for folder in folder_path
            ],
            "folders_with_headers": len([f_id for f_id in all_node_ids if f_id in headers_map]),
        }

        if include_inheritance_details:
            data["inheritance_details"] = merge_result["inheritance_info"]
            data["raw_headers_by_folder"] = {
                str(fid): headers_map.get(fid, {}).get("content", {})
                for fid in all_node_ids
                if fid in headers_map
            }

        return create_response(200, value_correction(data), CompleteHeadersResponse)

    except Exception as e:
        return ExceptionHandler(e)


@router.get("/{folder_id}/headers/inheritance-preview")
async def get_headers_inheritance_preview(
    folder_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /{folder_id}/headers/inheritance-preview — return per-folder header contributions along the ancestor path without merging."""
    try:
        access = await resolve_node_access(db, username, folder_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.node:
            return create_response(404, error_message="Folder not found")
        if not has_min_role(access, "viewer"):
            return create_response(403, error_message="Access denied")

        target_folder = access.node

        folder_path, folder_ids, headers_map, merge_result = await get_headers(db, folder_id)
        if not folder_path:
            return create_response(404, error_message="Folder not found")

        inheritance_preview = []
        for i, folder_info in enumerate(folder_path):
            folder_id_iter = folder_info["id"]
            folder_data = {
                "level": i + 1,
                "folder_id": folder_id_iter,
                "folder_name": folder_info["name"],
                "has_headers": folder_id_iter in headers_map,
                "headers": {},
                "headers_count": 0,
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
            "folders_with_headers": len([f for f in inheritance_preview if f["has_headers"]]),
        }

        return create_response(200, value_correction(data), HeaderInheritancePreviewResponse)

    except Exception as e:
        return ExceptionHandler(e)
