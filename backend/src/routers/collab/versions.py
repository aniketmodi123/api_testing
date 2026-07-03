"""
What this file does: Provides node version snapshot and restore endpoints — capture a point-in-time snapshot of a node subtree and restore it additively.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username, write_audit
from config import get_db
from models import Api, ApiCase, Node, NodeVersion
from utils import ExceptionHandler, create_response

router = APIRouter()


class VersionCreate(BaseModel):
    message: Optional[str] = None


class NodeVersionMeta(BaseModel):
    """Version snapshot metadata returned by create and list endpoints (no snapshot body).

    Attributes:
        id: Primary key of the version.
        node_id: Node the snapshot was captured from.
        author_username: Email of the user who created the snapshot.
        message: Description of the snapshot; ``None`` when not provided.
        created_at: ISO timestamp when the snapshot was taken; ``None`` if unset.
    """

    id: int
    node_id: int
    author_username: str
    message: Optional[str] = None
    created_at: Optional[str] = None


class NodeVersionDetail(NodeVersionMeta):
    """Full version snapshot including the captured subtree blob.

    Attributes:
        snapshot: JSON blob of the node subtree at snapshot time (node + children + apis + cases).
    """

    snapshot: Dict[str, Any]


async def _snapshot_node(db: AsyncSession, node: Node) -> Dict[str, Any]:
    """What it does: Recursively capture a node and its full subtree (children + apis + cases) as a plain dict for storage."""
    node_data = {
        "id": node.id,
        "workspace_id": node.workspace_id,
        "name": node.name,
        "type": node.type,
        "parent_id": node.parent_id,
        "created_at": str(node.created_at) if node.created_at else None,
    }

    if node.type == "file":
        api = (
            await db.execute(select(Api).where(Api.file_id == node.id))
        ).scalar_one_or_none()

        if api:
            cases = (
                await db.execute(select(ApiCase).where(ApiCase.api_id == api.id))
            ).scalars().all()
            api_data = {
                "id": api.id,
                "file_id": api.file_id,
                "name": api.name,
                "method": api.method,
                "endpoint": api.endpoint,
                "description": api.description,
                "is_active": api.is_active,
                "extra_meta": api.extra_meta,
            }
            cases_data = [
                {
                    "id": c.id,
                    "api_id": c.api_id,
                    "name": c.name,
                    "headers": c.headers,
                    "params": c.params,
                    "body": c.body,
                    "expected": c.expected,
                }
                for c in cases
            ]
            return {"node": node_data, "apis": [{"api": api_data, "cases": cases_data}]}

        return {"node": node_data, "apis": []}

    children_rows = (
        await db.execute(select(Node).where(Node.parent_id == node.id))
    ).scalars().all()

    children = []
    for child in children_rows:
        children.append(await _snapshot_node(db, child))

    return {"node": node_data, "children": children}


async def _restore_node(db: AsyncSession, snapshot: Dict[str, Any]) -> None:
    """What it does: Additively restore apis and cases from a snapshot dict into the live DB, upserting by (node+method+endpoint) and (api+name)."""
    node_data = snapshot.get("node", {})
    node_id = node_data.get("id")

    if snapshot.get("children"):
        for child_snap in snapshot["children"]:
            await _restore_node(db, child_snap)
        return

    for api_entry in snapshot.get("apis", []):
        api_snap = api_entry.get("api", {})
        cases_snap = api_entry.get("cases", [])

        existing_api = (
            await db.execute(
                select(Api).where(
                    Api.file_id == node_id,
                    Api.method == api_snap.get("method"),
                    Api.endpoint == api_snap.get("endpoint"),
                )
            )
        ).scalar_one_or_none()

        if existing_api:
            existing_api.name = api_snap.get("name", existing_api.name)
            existing_api.description = api_snap.get("description", existing_api.description)
            existing_api.extra_meta = api_snap.get("extra_meta", existing_api.extra_meta)
            api_id = existing_api.id
        else:
            new_api = Api(
                file_id=node_id,
                name=api_snap.get("name", ""),
                method=api_snap.get("method", "GET"),
                endpoint=api_snap.get("endpoint", "/"),
                description=api_snap.get("description"),
                is_active=api_snap.get("is_active", True),
                extra_meta=api_snap.get("extra_meta"),
            )
            db.add(new_api)
            await db.flush()
            api_id = new_api.id

        for case_snap in cases_snap:
            existing_case = (
                await db.execute(
                    select(ApiCase).where(
                        ApiCase.api_id == api_id,
                        ApiCase.name == case_snap.get("name"),
                    )
                )
            ).scalar_one_or_none()

            if existing_case:
                existing_case.headers = case_snap.get("headers", existing_case.headers)
                existing_case.params = case_snap.get("params", existing_case.params)
                existing_case.body = case_snap.get("body", existing_case.body)
                existing_case.expected = case_snap.get("expected", existing_case.expected)
            else:
                db.add(ApiCase(
                    api_id=api_id,
                    name=case_snap.get("name", ""),
                    headers=case_snap.get("headers"),
                    params=case_snap.get("params"),
                    body=case_snap.get("body", {}),
                    expected=case_snap.get("expected", {}),
                ))


@router.post("/node/{node_id}/version")
async def create_version(
    node_id: int,
    payload: VersionCreate,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /node/{node_id}/version — capture a snapshot of the node subtree for version history."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
        if not node:
            return create_response(404, error_message="Node not found")

        access = await can_access_workspace(db, node.workspace_id, user.id, min_role="editor")
        if not access:
            return create_response(403, error_message="Editor access required")

        snapshot = await _snapshot_node(db, node)

        version = NodeVersion(
            node_id=node_id,
            snapshot=snapshot,
            author_username=username,
            message=payload.message,
        )
        db.add(version)
        await db.flush()
        await write_audit(db, username, "node.version.create", "node_version", version.id, workspace_id=node.workspace_id)
        await db.commit()
        await db.refresh(version)

        return create_response(201, data={
            "id": version.id,
            "node_id": version.node_id,
            "author_username": version.author_username,
            "message": version.message,
            "created_at": str(version.created_at) if version.created_at else None,
        }, schema=NodeVersionMeta)
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.get("/node/{node_id}/versions")
async def list_versions(
    node_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /node/{node_id}/versions — list all snapshots for a node, newest first."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        node = (await db.execute(select(Node).where(Node.id == node_id))).scalar_one_or_none()
        if not node:
            return create_response(404, error_message="Node not found")

        access = await can_access_workspace(db, node.workspace_id, user.id, min_role="viewer")
        if not access:
            return create_response(403, error_message="Access denied")

        versions = (
            await db.execute(
                select(NodeVersion)
                .where(NodeVersion.node_id == node_id)
                .order_by(NodeVersion.created_at.desc())
            )
        ).scalars().all()

        return create_response(200, data=[
            {
                "id": v.id,
                "node_id": v.node_id,
                "author_username": v.author_username,
                "message": v.message,
                "created_at": str(v.created_at) if v.created_at else None,
            }
            for v in versions
        ], schema=NodeVersionMeta)
    except Exception as e:
        return ExceptionHandler(e)


@router.get("/node/version/{version_id}")
async def get_version(
    version_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /node/version/{version_id} — return the full snapshot JSON for a version."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        version = (
            await db.execute(select(NodeVersion).where(NodeVersion.id == version_id))
        ).scalar_one_or_none()
        if not version:
            return create_response(404, error_message="Version not found")

        node = (await db.execute(select(Node).where(Node.id == version.node_id))).scalar_one_or_none()
        if not node:
            return create_response(404, error_message="Node not found")

        access = await can_access_workspace(db, node.workspace_id, user.id, min_role="viewer")
        if not access:
            return create_response(403, error_message="Access denied")

        return create_response(200, data={
            "id": version.id,
            "node_id": version.node_id,
            "author_username": version.author_username,
            "message": version.message,
            "created_at": str(version.created_at) if version.created_at else None,
            "snapshot": version.snapshot,
        }, schema=NodeVersionDetail)
    except Exception as e:
        return ExceptionHandler(e)


@router.post("/node/version/{version_id}/restore")
async def restore_version(
    version_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /node/version/{version_id}/restore — additively restore apis and cases from the snapshot into the live node; does not delete extra items.

    Notes:
        - Additive only: apis/cases in the live DB but absent from the snapshot are left untouched.
        - Upsert key for Api: (file_id, method, endpoint). Upsert key for ApiCase: (api_id, name).
    """
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        version = (
            await db.execute(select(NodeVersion).where(NodeVersion.id == version_id))
        ).scalar_one_or_none()
        if not version:
            return create_response(404, error_message="Version not found")

        node = (await db.execute(select(Node).where(Node.id == version.node_id))).scalar_one_or_none()
        if not node:
            return create_response(404, error_message="Node not found")

        access = await can_access_workspace(db, node.workspace_id, user.id, min_role="editor")
        if not access:
            return create_response(403, error_message="Editor access required")

        await _restore_node(db, version.snapshot)

        await write_audit(
            db, username, "node.version.restore", "node_version", version_id,
            workspace_id=node.workspace_id,
        )
        await db.commit()

        return create_response(200, message="Version restored")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
