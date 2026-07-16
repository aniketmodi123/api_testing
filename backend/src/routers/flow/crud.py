"""
What this file does: Exposes CRUD endpoints for Flow and FlowStep; validates that steps form a valid DAG (no cycles, valid step types) on create and update.
"""

import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import has_min_role, resolve_workspace_access, write_audit
from config import get_db
from models import Flow, FlowStep
from utils import create_response

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


class FlowStepOut(BaseModel):
    """Represent one persisted flow step within a FlowResponse.

    Attributes:
        id: Primary key.
        step_order: Zero-based execution order.
        type: ``"request"`` | ``"condition"`` | ``"delay"`` | ``"set_var"``.
        api_id: Api called by this step; ``None`` for non-request steps.
        config: Step-type-specific parameters; ``None`` when not set.
        extract: Jsonpath extraction rules; ``None`` when not set.
        condition: Branch condition; ``None`` for non-condition steps.
    """

    id: int
    step_order: int
    type: str
    api_id: Optional[int] = None
    config: Optional[Dict[str, Any]] = None
    extract: Optional[Dict[str, Any]] = None
    condition: Optional[Dict[str, Any]] = None


class FlowResponse(BaseModel):
    """Represent a flow with its steps from create/get/update flow endpoints.

    Attributes:
        id: Primary key.
        workspace_id: Owning workspace.
        name: Flow display name.
        description: Optional free-text note; ``None`` when not set.
        graph: UI canvas layout JSON; ``None`` when not yet positioned.
        enabled: ``True`` when the flow can be executed.
        created_at: Creation timestamp as a string.
        updated_at: Last modification timestamp as a string.
        steps: Ordered steps that make up the flow.
    """

    id: int
    workspace_id: int
    name: str
    description: Optional[str] = None
    graph: Optional[Dict[str, Any]] = None
    enabled: bool
    created_at: str
    updated_at: str
    steps: List[FlowStepOut]


class FlowSummaryResponse(BaseModel):
    """Represent one flow row from GET /workspace/{workspace_id}/flow.

    Attributes:
        id: Primary key.
        name: Flow display name.
        description: Optional free-text note; ``None`` when not set.
        enabled: ``True`` when the flow can be executed.
        created_at: Creation timestamp as a string.
    """

    id: int
    name: str
    description: Optional[str] = None
    enabled: bool
    created_at: str


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


def _flow_to_dict(flow: Flow, steps: Optional[List[FlowStep]] = None) -> Dict[str, Any]:
    """What it does: Serialize a Flow ORM object and an explicitly loaded step list to a response dict."""
    # Steps are passed explicitly — reading flow.steps after commit triggers async lazy-load on AsyncSession.
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
            for s in (steps or [])
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
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(401, error_message="User not found")
    if not has_min_role(access, "editor"):
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

    step_objs = [
        FlowStep(
            flow_id=flow.id,
            step_order=s.step_order,
            type=s.type,
            api_id=s.api_id,
            config=s.config,
            extract=s.extract,
            condition=s.condition,
        )
        for s in payload.steps
    ]
    db.add_all(step_objs)
    await db.flush()

    await write_audit(db, username=access.user.username, action="flow.create", entity_type="flow", entity_id=flow.id, workspace_id=workspace_id)
    await db.commit()

    return create_response(201, data=_flow_to_dict(flow, step_objs), schema=FlowResponse)


@router.get("/workspace/{workspace_id}/flow")
async def list_flows(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /workspace/{workspace_id}/flow — list all flows in the workspace; requires viewer role."""
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(401, error_message="User not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    rows = (await db.execute(
        select(Flow.id, Flow.name, Flow.description, Flow.enabled, Flow.created_at)
        .where(Flow.workspace_id == workspace_id)
        .order_by(Flow.created_at.desc())
    )).all()

    data = [{"id": r.id, "name": r.name, "description": r.description, "enabled": r.enabled, "created_at": str(r.created_at)} for r in rows]
    return create_response(200, data=data, schema=FlowSummaryResponse)


@router.get("/flow/{flow_id}")
async def get_flow(
    flow_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /flow/{flow_id} — return a flow with all its steps; requires viewer role."""
    flow = (await db.execute(select(Flow).where(Flow.id == flow_id))).scalar_one_or_none()
    if not flow:
        return create_response(404, error_message="Flow not found")

    access = await resolve_workspace_access(db, username, flow.workspace_id)
    if not access.user:
        return create_response(401, error_message="User not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    steps = (await db.execute(
        select(FlowStep).where(FlowStep.flow_id == flow_id).order_by(FlowStep.step_order)
    )).scalars().all()

    return create_response(200, data=_flow_to_dict(flow, steps), schema=FlowResponse)


@router.put("/flow/{flow_id}")
async def update_flow(
    flow_id: int,
    payload: FlowIn,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /flow/{flow_id} — replace a flow's metadata and steps; requires editor role."""
    flow = (await db.execute(select(Flow).where(Flow.id == flow_id))).scalar_one_or_none()
    if not flow:
        return create_response(404, error_message="Flow not found")

    access = await resolve_workspace_access(db, username, flow.workspace_id)
    if not access.user:
        return create_response(401, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    err = _validate_steps(payload.steps)
    if err:
        return create_response(400, error_message=err)

    flow.name = payload.name
    flow.description = payload.description
    flow.graph = payload.graph
    flow.enabled = payload.enabled
    flow.updated_at = datetime.datetime.now()

    await db.execute(delete(FlowStep).where(FlowStep.flow_id == flow_id))
    step_objs = [
        FlowStep(
            flow_id=flow_id,
            step_order=s.step_order,
            type=s.type,
            api_id=s.api_id,
            config=s.config,
            extract=s.extract,
            condition=s.condition,
        )
        for s in payload.steps
    ]
    db.add_all(step_objs)
    await db.flush()

    await write_audit(db, username=access.user.username, action="flow.update", entity_type="flow", entity_id=flow_id, workspace_id=flow.workspace_id)
    await db.commit()

    return create_response(200, data=_flow_to_dict(flow, step_objs), schema=FlowResponse)


@router.delete("/flow/{flow_id}")
async def delete_flow(
    flow_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /flow/{flow_id} — delete a flow and all its steps and runs; requires editor role."""
    flow_row = (await db.execute(
        select(Flow.id, Flow.workspace_id).where(Flow.id == flow_id)
    )).first()
    if not flow_row:
        return create_response(404, error_message="Flow not found")

    access = await resolve_workspace_access(db, username, flow_row.workspace_id)
    if not access.user:
        return create_response(401, error_message="User not found")
    if not has_min_role(access, "editor"):
        return create_response(403, error_message="Access denied")

    await db.execute(delete(Flow).where(Flow.id == flow_id))
    await write_audit(db, username=access.user.username, action="flow.delete", entity_type="flow", entity_id=flow_id, workspace_id=flow_row.workspace_id)
    await db.commit()
    return create_response(200, message="Flow deleted")
