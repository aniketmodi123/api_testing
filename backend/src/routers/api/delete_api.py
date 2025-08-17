from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import (
    get_db,
    get_user_by_username,
    verify_node_ownership
)
from models import Api
from utils import (
    ExceptionHandler,
    create_response
)

router = APIRouter()


@router.delete("/file/{file_id}/api")
async def delete_file_api(
    file_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
    force: bool = False
):
    """Delete API from a file along with all its test cases"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Verify file ownership
        file_node = await verify_node_ownership(db, file_id, user.id)
        if not file_node:
            return create_response(206, error_message="File not found or access denied")

        if file_node.type != "file":
            return create_response(400, error_message="Can only delete API from files, not folders")

        # Get API from file with cases
        result = await db.execute(
            select(Api)
            .options(selectinload(Api.cases))
            .where(Api.file_id == file_id)
        )
        api = result.scalar_one_or_none()

        if not api:
            return create_response(206, error_message="No API found in this file")

        # Check for test cases
        cases_count = len(api.cases) if hasattr(api, 'cases') else 0
        if cases_count > 0 and not force:
            return create_response(
                400,
                error_message=f"API has {cases_count} test cases. Use force=true to delete API with all its test cases"
            )

        api_name = api.name

        # Delete API (cascade will delete test cases)
        await db.delete(api)
        await db.commit()

        return create_response(200, {
            "message": f"API '{api_name}' deleted successfully from file '{file_node.name}'",
            "deleted_cases": cases_count,
            "file_id": file_id,
            "file_name": file_node.name
        })

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)

