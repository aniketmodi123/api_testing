from fastapi import APIRouter, Depends, Header as FastAPIHeader, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict, Any

from config import get_db, get_user_by_username, serialize_data, verify_folder_ownership
from models import User, Workspace, Node, Header
from schema import HeaderResponse
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


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
            .where(and_(Node.id == current_id, Node.type == "folder"))
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


@router.get("/{folder_id}/headers/complete")
async def get_complete_folder_headers(
    folder_id: int,
    username: str = FastAPIHeader(...),
    include_inheritance_details: bool = FastAPIHeader(False, alias="include-details"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get complete headers for a folder by inheriting from all parent folders.
    Child folder headers override parent folder headers for duplicate keys.

    Path: folder1 -> folder2 -> folder3 -> folder4
    Priority: folder1 (lowest) -> folder2 -> folder3 -> folder4 (highest)
    """
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify folder ownership
        target_folder = await verify_folder_ownership(db, folder_id, user.id)
        if not target_folder:
            return create_response(404, error_message="Folder not found or access denied")

        # Get path from root to target folder
        folder_path = await get_folder_path_to_root(db, folder_id)

        if not folder_path:
            return create_response(400, error_message="Could not determine folder path")

        # Get folder IDs for header lookup
        folder_ids = [folder["id"] for folder in folder_path]

        # Get headers for all folders in the path
        headers_map = await get_headers_for_folders(db, folder_ids)

        # Merge headers with proper priority (child overrides parent)
        merge_result = merge_headers_with_priority(folder_path, headers_map)

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

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)


# Bonus: Get inheritance preview (useful for UI)
@router.get("/{folder_id}/headers/inheritance-preview")
async def get_headers_inheritance_preview(
    folder_id: int,
    username: str = FastAPIHeader(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a preview of header inheritance without merging.
    Shows what headers each folder contributes separately.
    """
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify folder ownership
        target_folder = await verify_folder_ownership(db, folder_id, user.id)
        if not target_folder:
            return create_response(404, error_message="Folder not found or access denied")

        # Get path from root to target folder
        folder_path = await get_folder_path_to_root(db, folder_id)

        # Get folder IDs for header lookup
        folder_ids = [folder["id"] for folder in folder_path]

        # Get headers for all folders in the path
        headers_map = await get_headers_for_folders(db, folder_ids)

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

        return create_response(200, value_correction(data))

    except Exception as e:
        ExceptionHandler(e)