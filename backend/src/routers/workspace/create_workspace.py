from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import List, Optional

from config import get_db, get_user_by_username
from models import User, Workspace, Node
from schema import WorkspaceCreateRequest, WorkspaceUpdateRequest
from utils import (
    ExceptionHandler,
    create_response,
    value_correction
)

router = APIRouter()


@router.post("/create")
async def create_workspace(
    workspace_data: WorkspaceCreateRequest,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new workspace"""
    try:
        # Get user
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        # Create workspace
        new_workspace = Workspace(
            user_id=user.id,
            name=workspace_data.name,
            description=workspace_data.description
        )

        db.add(new_workspace)
        await db.commit()
        return create_response(201, {"message":"Workspace created successfully"})

    except Exception as e:
        await db.rollback()
        ExceptionHandler(e)
