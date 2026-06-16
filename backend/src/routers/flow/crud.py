"""
What this file does: Exposes CRUD endpoints for Flow and FlowStep; validates that steps form a valid DAG (no cycles, valid step types) on create and update.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username
from config import get_db
from models import Flow, FlowStep
from utils import ExceptionHandler, create_response

router = APIRouter()

MAX_STEPS = 100


# ---------- Pydantic schemas ----------

class FlowStepIn(BaseModel):
    """Input schema for a single flow step.

    Attributes:
        step_order: Zero-based position in the execution sequence.
        type: Step kind — ``"request"``, ``"condition"``, ``"delay"``, or ``"set_var"``.
        api_id: Api to call; ``None`` for non-request steps.
        config: Step-type-specific parameters (e.g. ``{delay_ms: 500}`` for delay).
        extract: Jsonpath extraction rules ``{var_name: "$.path"}``; ``None`` for no extraction.
        condition: Branch condition ``{var, op, value, on_false_skip_to}``; ``None`` for non-condition steps.
    """

    step_order: int
    type: str
    api_id: Optional[int] = None
    config: Optional[Dict[str, Any]] = None
    extract: Optional[Dict[str, Any]] = None
    condition: Optional[Dict[str, Any]] = None


class FlowIn(BaseModel):
    """Request body for POST/PUT /flow[/{id}].

    Attributes:
        name: Flow display name.
        description: Optional free-text note; ``None`` when not provided.
        graph: UI canvas layout JSON; ``None`` when not yet positioned.
        enabled: ``True`` to allow the flow to be executed.
        steps: Ordered list of steps that make up the flow.
    """

    name: str
    description: Optional[str] = None
    graph: Optional[Dict[str, Any]] = None
    enabled: bool = True
    steps: List[FlowStepIn] = []


# ---------- Helpers ----------

def _validate_steps(steps: List[FlowStepIn]) -> Optional[str]:
    """What it does: Validate step list for max size, valid types, and duplicate orders; return error string or None."""
    valid_types = {"request", "condition", "delay", "set_var"}
    if len(steps) > MAX_STEPS:
        return f"Flow exceeds maximum of {MAX_STEPS} steps"
    orders_seen: set = set()
    for s in steps:
        if s.type not in valid_types:
            return f"Invalid step type: {s.type}"
        if s.step_order in orders_seen:
            return f"Duplicate step_order: {s.step_order}"
        orders_seen.add(s.step_order)
        if s.type == "request" and s.api_id is None:
            return "Step of type 'request' must have an api_id"
    return None


def _flow_to_dict(flow: Flow) -> Dict[str, Any]:
    """What it does: Serialize a Flow ORM object and its steps to a response dict."""
    return {
        "id": flow.id,
        "workspace_id": flow.workspace_id,
        "name": flow.name,
        "description": flow.description,
        "graph": flow.graph,
        "enabled": flow.enabled,
        "created_at": str(flow.created_at),
        "updated_at": str(flow.updated_at),
        "steps": [
            {
                "id": s.id,
                "step_order": s.step_order,
                "type": s.type,
                "api_id": s.api_id,
                "config": s.config,
                "extract": s.extract,
                "condition": s.condition,
            }
            for s in (flow.steps or [])
        ],
    }


# ---------- Endpoints ----------

@router.post("/workspace/{workspace_id}/flow")
async def create_flow(
    workspace_id: int,
    payload: FlowIn,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /workspace/{workspace_id}/flow — create a flow with its steps; requires editor role."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        ok = await can_access_workspace(db, workspace_id, user.id, min_role="editor")
        if not ok:
            return create_response(403, error_message="Access denied")

        err = _validate_steps(payload.steps)
        if err:
            return create_response(400, error_message=err)

        flow = Flow(
            workspace_id=workspace_id,
            name=payload.name,
            description=payload.description,
            graph=payload.graph,
            enabled=payload.enabled,
        )
        db.add(flow)
        await db.flush()

        for s in payload.steps:
            db.add(FlowStep(
                flow_id=flow.id,
                step_order=s.step_order,
                type=s.type,
                api_id=s.api_id,
                config=s.config,
                extract=s.extract,
                condition=s.condition,
            ))

        await db.commit()
        await db.refresh(flow)

        # Eager-load steps for response
        steps_result = await db.execute(select(FlowStep).where(FlowStep.flow_id == flow.id).order_by(FlowStep.step_order))
        flow.steps = steps_result.scalars().all()

        return create_response(201, data=_flow_to_dict(flow))
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.get("/workspace/{workspace_id}/flow")
async def list_flows(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /workspace/{workspace_id}/flow — list all flows in the workspace; requires viewer role."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        ok = await can_access_workspace(db, workspace_id, user.id, min_role="viewer")
        if not ok:
            return create_response(403, error_message="Access denied")

        result = await db.execute(
            select(Flow).where(Flow.workspace_id == workspace_id).order_by(Flow.created_at.desc())
        )
        flows = result.scalars().all()

        data = [{"id": f.id, "name": f.name, "description": f.description, "enabled": f.enabled, "created_at": str(f.created_at)} for f in flows]
        return create_response(200, data=data)
    except Exception as e:
        return ExceptionHandler(e)


@router.get("/flow/{flow_id}")
async def get_flow(
    flow_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /flow/{flow_id} — return a flow with all its steps; requires viewer role."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        flow_result = await db.execute(select(Flow).where(Flow.id == flow_id))
        flow = flow_result.scalar_one_or_none()
        if not flow:
            return create_response(404, error_message="Flow not found")

        ok = await can_access_workspace(db, flow.workspace_id, user.id, min_role="viewer")
        if not ok:
            return create_response(403, error_message="Access denied")

        steps_result = await db.execute(select(FlowStep).where(FlowStep.flow_id == flow_id).order_by(FlowStep.step_order))
        flow.steps = steps_result.scalars().all()

        return create_response(200, data=_flow_to_dict(flow))
    except Exception as e:
        return ExceptionHandler(e)


@router.put("/flow/{flow_id}")
async def update_flow(
    flow_id: int,
    payload: FlowIn,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /flow/{flow_id} — replace a flow's metadata and steps; requires editor role."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        flow_result = await db.execute(select(Flow).where(Flow.id == flow_id))
        flow = flow_result.scalar_one_or_none()
        if not flow:
            return create_response(404, error_message="Flow not found")

        ok = await can_access_workspace(db, flow.workspace_id, user.id, min_role="editor")
        if not ok:
            return create_response(403, error_message="Access denied")

        err = _validate_steps(payload.steps)
        if err:
            return create_response(400, error_message=err)

        flow.name = payload.name
        flow.description = payload.description
        flow.graph = payload.graph
        flow.enabled = payload.enabled

        # Replace steps: delete existing then insert new
        await db.execute(delete(FlowStep).where(FlowStep.flow_id == flow_id))
        for s in payload.steps:
            db.add(FlowStep(
                flow_id=flow_id,
                step_order=s.step_order,
                type=s.type,
                api_id=s.api_id,
                config=s.config,
                extract=s.extract,
                condition=s.condition,
            ))

        await db.commit()
        await db.refresh(flow)
        steps_result = await db.execute(select(FlowStep).where(FlowStep.flow_id == flow_id).order_by(FlowStep.step_order))
        flow.steps = steps_result.scalars().all()

        return create_response(200, data=_flow_to_dict(flow))
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.delete("/flow/{flow_id}")
async def delete_flow(
    flow_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /flow/{flow_id} — delete a flow and all its steps and runs; requires editor role."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        flow_result = await db.execute(select(Flow).where(Flow.id == flow_id))
        flow = flow_result.scalar_one_or_none()
        if not flow:
            return create_response(404, error_message="Flow not found")

        ok = await can_access_workspace(db, flow.workspace_id, user.id, min_role="editor")
        if not ok:
            return create_response(403, error_message="Access denied")

        await db.delete(flow)
        await db.commit()
        return create_response(200, message="Flow deleted")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
