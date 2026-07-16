"""
What this file does: Exposes workspace membership routes — invite, join, list, update role, and remove members.
"""

import asyncio
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_db
from common_querys import (
    get_user_by_username,
    has_min_role,
    resolve_workspace_access,
)
from models import User, WorkspaceInvite, WorkspaceMember
from schema import InviteCreate, MemberRoleUpdate, MessageResponse
from utils import ExceptionHandler, create_response, value_correction

router = APIRouter()


async def _send_invite_email(email: str, token: str, workspace_name: str, app_base_url: str) -> None:
    """What it does: Send an HTML workspace invitation email with an accept link; skip silently if SMTP is unconfigured, log and suppress failures."""
    import os, smtplib, logging
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    smtp_username = os.environ.get("SMTP_USERNAME", "")
    if not smtp_username:
        return

    import html as _html
    join_url = f"{app_base_url}/workspace/join/{token}"
    safe_name = _html.escape(workspace_name)
    body_html = f"""
    <p>You have been invited to join the workspace <strong>{safe_name}</strong>.</p>
    <p><a href="{join_url}">Accept Invitation</a></p>
    <p>This link expires in 7 days.</p>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Invitation to join workspace: {workspace_name}"
    msg["From"] = smtp_username
    msg["To"] = email
    msg.attach(MIMEText(body_html, "html"))

    try:
        smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        smtp_password = os.environ.get("SMTP_PASSWORD", "")
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.sendmail(smtp_username, email, msg.as_string())
    except Exception:
        logging.getLogger(__name__).warning("Failed to send invite email to %s", email)


# ---------------------------------------------------------------------------
# POST /workspace/{workspace_id}/invite
# ---------------------------------------------------------------------------
@router.post("/{workspace_id}/invite")
async def invite_member(
    workspace_id: int,
    body: InviteCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /workspace/{workspace_id}/invite — create or refresh a pending invite and fire an invitation email."""
    try:
        access = await resolve_workspace_access(db, username, workspace_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.workspace_id:
            return create_response(404, error_message="Workspace not found")
        if not has_min_role(access, "admin"):
            return create_response(403, error_message="Only workspace owner or admin can invite members")

        workspace_name = access.workspace_name or "workspace"

        existing = await db.execute(
            select(WorkspaceInvite).where(
                and_(
                    WorkspaceInvite.workspace_id == workspace_id,
                    WorkspaceInvite.email == body.email,
                    WorkspaceInvite.accepted.is_(False),
                )
            )
        )
        existing_invite = existing.scalar_one_or_none()
        if existing_invite:
            existing_invite.token = uuid.uuid4().hex
            existing_invite.role = body.role
            existing_invite.expires_at = datetime.now() + timedelta(days=7)
            await db.commit()
            token = existing_invite.token
        else:
            token = uuid.uuid4().hex
            invite = WorkspaceInvite(
                workspace_id=workspace_id,
                email=body.email,
                token=token,
                role=body.role,
                expires_at=datetime.now() + timedelta(days=7),
            )
            db.add(invite)
            await db.commit()

        import os
        app_base_url = os.environ.get("APP_BASE_URL", "http://localhost:5173")
        asyncio.create_task(_send_invite_email(body.email, token, workspace_name, app_base_url))

        return create_response(200, value_correction({
            "email": body.email,
            "role": body.role,
            "token": token,
            "workspace_id": workspace_id,
        }))

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


# ---------------------------------------------------------------------------
# GET /workspace/join/{token}
# ---------------------------------------------------------------------------
@router.get("/join/{token}")
async def join_workspace(
    token: str,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /workspace/join/{token} — validate invite token and add the caller as a workspace member."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        invite_result = await db.execute(
            select(WorkspaceInvite).where(WorkspaceInvite.token == token)
        )
        invite = invite_result.scalar_one_or_none()
        if not invite:
            return create_response(404, error_message="Invitation not found")
        if invite.accepted:
            return create_response(400, error_message="Invitation already accepted")
        if invite.expires_at < datetime.now():
            return create_response(410, error_message="Invitation has expired")
        if invite.email.lower() != user.email.lower():
            return create_response(403, error_message="This invitation was sent to a different email address")

        existing_member = await db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == invite.workspace_id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        )
        member = existing_member.scalar_one_or_none()
        if member:
            member.role = invite.role
            member.joined_at = datetime.now()
        else:
            member = WorkspaceMember(
                workspace_id=invite.workspace_id,
                user_id=user.id,
                role=invite.role,
                joined_at=datetime.now(),
            )
            db.add(member)

        invite.accepted = True
        await db.commit()

        return create_response(200, value_correction({
            "workspace_id": invite.workspace_id,
            "role": invite.role,
        }))

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


# ---------------------------------------------------------------------------
# GET /workspace/{workspace_id}/members
# ---------------------------------------------------------------------------
@router.get("/{workspace_id}/members")
async def list_members(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /workspace/{workspace_id}/members — return joined members and non-expired pending invites."""
    try:
        access = await resolve_workspace_access(db, username, workspace_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.workspace_id:
            return create_response(404, error_message="Workspace not found")
        if not has_min_role(access, "viewer"):
            return create_response(403, error_message="Access denied")

        members_result = await db.execute(
            select(
                WorkspaceMember.user_id,
                WorkspaceMember.role,
                WorkspaceMember.joined_at,
                User.username,
                User.email,
            )
            .join(User, WorkspaceMember.user_id == User.id)
            .where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.joined_at.isnot(None),
                )
            )
        )
        members_list = [
            {
                "user_id": row.user_id,
                "username": row.username,
                "email": row.email,
                "role": row.role,
                "joined_at": str(row.joined_at) if row.joined_at else None,
            }
            for row in members_result.all()
        ]

        invites_result = await db.execute(
            select(
                WorkspaceInvite.id,
                WorkspaceInvite.email,
                WorkspaceInvite.role,
                WorkspaceInvite.expires_at,
                WorkspaceInvite.accepted,
                WorkspaceInvite.created_at,
            )
            .where(
                and_(
                    WorkspaceInvite.workspace_id == workspace_id,
                    WorkspaceInvite.accepted.is_(False),
                    WorkspaceInvite.expires_at > datetime.now(),
                )
            )
        )
        invites_list = [
            {
                "id": row.id,
                "email": row.email,
                "role": row.role,
                "expires_at": str(row.expires_at),
                "accepted": row.accepted,
                "created_at": str(row.created_at),
            }
            for row in invites_result.all()
        ]

        return create_response(200, value_correction({
            "members": members_list,
            "pending_invites": invites_list,
        }))

    except Exception as e:
        return ExceptionHandler(e)


# ---------------------------------------------------------------------------
# PUT /workspace/{workspace_id}/members/{member_user_id}
# ---------------------------------------------------------------------------
@router.put("/{workspace_id}/members/{member_user_id}")
async def update_member_role(
    workspace_id: int,
    member_user_id: int,
    body: MemberRoleUpdate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /workspace/{workspace_id}/members/{member_user_id} — change the role of an existing workspace member."""
    try:
        access = await resolve_workspace_access(db, username, workspace_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.workspace_id:
            return create_response(404, error_message="Workspace not found")
        if not has_min_role(access, "admin"):
            return create_response(403, error_message="Only workspace owner or admin can update roles")

        member_result = await db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == member_user_id,
                )
            )
        )
        member = member_result.scalar_one_or_none()
        if not member:
            return create_response(404, error_message="Member not found")

        member.role = body.role
        await db.commit()

        return create_response(200, value_correction({
            "user_id": member.user_id,
            "workspace_id": member.workspace_id,
            "role": member.role,
        }))

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


# ---------------------------------------------------------------------------
# DELETE /workspace/{workspace_id}/members/{member_user_id}
# ---------------------------------------------------------------------------
@router.delete("/{workspace_id}/members/{member_user_id}")
async def remove_member(
    workspace_id: int,
    member_user_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /workspace/{workspace_id}/members/{member_user_id} — remove a member from the workspace."""
    try:
        access = await resolve_workspace_access(db, username, workspace_id)
        if not access.user:
            return create_response(400, error_message="User not found")
        if not access.workspace_id:
            return create_response(404, error_message="Workspace not found")
        if not has_min_role(access, "admin"):
            return create_response(403, error_message="Only workspace owner or admin can remove members")

        member_result = await db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == member_user_id,
                )
            )
        )
        member = member_result.scalar_one_or_none()
        if not member:
            return create_response(404, error_message="Member not found")

        await db.delete(member)
        await db.commit()

        return create_response(200, value_correction({"message": "Member removed"}), MessageResponse)

    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
