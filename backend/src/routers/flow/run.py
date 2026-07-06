"""
What this file does: Exposes POST /flow/{id}/run (async fire-and-forget), GET /flow/{id}/runs (history list), and GET /flow/run/{run_id} (single run detail with step results).
"""

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username
from config import get_db
from models import Flow, FlowRun, FlowStepResult
from utils import ExceptionHandler, create_response

router = APIRouter()


class FlowRunRequest(BaseModel):
    """Request body for POST /flow/{flow_id}/run.

    Attributes:
        input_vars: Optional caller-supplied local variables injected as the initial run context; ``None`` for no pre-seeded vars.
    """

    input_vars: Optional[Dict[str, Any]] = None


class FlowRunAcceptedResponse(BaseModel):
    """Represent the immediate response from POST /flow/{flow_id}/run.

    Attributes:
        run_id: FlowRun id created for this execution; poll GET /flow/run/{run_id} for results.
        status: Always ``"running"`` at trigger time.
    """

    run_id: int
    status: str


class FlowStepResultOut(BaseModel):
    """Represent one step's outcome within a FlowRunDetailResponse.

    Attributes:
        id: Primary key.
        step_id: FlowStep that was executed.
        step_order: Execution order at run time.
        success: ``True`` when the step completed without error.
        request: Outgoing request snapshot (secrets masked); ``None`` for non-request steps.
        response: Response snapshot (secrets masked); ``None`` for non-request steps.
        extracted: Variables extracted via jsonpath; ``None`` when no extraction ran.
        duration_ms: Wall-clock step duration.
        error_message: Failure message; ``None`` when the step succeeded.
        created_at: Timestamp the result was recorded, as a string.
    """

    id: int
    step_id: Optional[int] = None
    step_order: int
    success: bool
    request: Optional[Dict[str, Any]] = None
    response: Optional[Dict[str, Any]] = None
    extracted: Optional[Dict[str, Any]] = None
    duration_ms: int
    error_message: Optional[str] = None
    created_at: str


class FlowRunSummaryResponse(BaseModel):
    """Represent one FlowRun row from GET /flow/{flow_id}/runs.

    Attributes:
        id: Primary key.
        flow_id: Flow this run belongs to.
        status: ``"running"`` | ``"completed"`` | ``"failed"``.
        started_at: Execution start timestamp, as a string.
        finished_at: Execution end timestamp; ``None`` while still running.
        error_message: Top-level failure message; ``None`` when the run succeeded.
    """

    id: int
    flow_id: int
    status: str
    started_at: str
    finished_at: Optional[str] = None
    error_message: Optional[str] = None


class FlowRunDetailResponse(FlowRunSummaryResponse):
    """Represent a single run with all step results from GET /flow/run/{run_id}.

    Attributes:
        steps: Per-step results ordered by step_order.
    """

    steps: List[FlowStepResultOut]


def _run_to_dict(run: FlowRun, steps: Optional[List[FlowStepResult]] = None) -> Dict[str, Any]:
    """What it does: Serialize a FlowRun (and optionally its step results) to a response dict."""
    d: Dict[str, Any] = {
        "id": run.id,
        "flow_id": run.flow_id,
        "status": run.status,
        "started_at": str(run.started_at),
        "finished_at": str(run.finished_at) if run.finished_at else None,
        "error_message": run.error_message,
    }
    if steps is not None:
        d["steps"] = [
            {
                "id": s.id,
                "step_id": s.step_id,
                "step_order": s.step_order,
                "success": s.success,
                "request": s.request,
                "response": s.response,
                "extracted": s.extracted,
                "duration_ms": s.duration_ms,
                "error_message": s.error_message,
                "created_at": str(s.created_at),
            }
            for s in sorted(steps, key=lambda x: x.step_order)
        ]
    return d


async def _background_execute(flow_id: int, username: str, input_vars: Optional[Dict[str, Any]], run_id: int) -> None:
    """What it does: Run the flow engine in a background task against the stub FlowRun already returned to the caller; errors are logged by the engine itself."""
    from routers.flow.engine import execute_flow
    try:
        await execute_flow(flow_id, username, input_vars, run_id=run_id)
    except Exception as e:
        from utils import logs
        logs(f"Background flow execution failed flow={flow_id} run={run_id}: {e}", type="error")


@router.post("/flow/{flow_id}/run")
async def run_flow(
    flow_id: int,
    payload: FlowRunRequest,
    background_tasks: BackgroundTasks,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /flow/{flow_id}/run — trigger async flow execution; return run_id immediately; requires editor role."""
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

        # Create a stub FlowRun so we can return run_id immediately
        run = FlowRun(flow_id=flow_id, status="running", context=payload.input_vars or {})
        db.add(run)
        await db.flush()
        run_id = run.id
        await db.commit()

        # Fire engine in background; engine opens its own session and writes into the stub run
        background_tasks.add_task(_background_execute, flow_id, username, payload.input_vars, run_id)

        return create_response(202, data={"run_id": run_id, "status": "running"}, schema=FlowRunAcceptedResponse)
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.get("/flow/{flow_id}/runs")
async def list_flow_runs(
    flow_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /flow/{flow_id}/runs — list past runs for a flow ordered newest first; requires viewer role."""
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

        runs_result = await db.execute(
            select(FlowRun).where(FlowRun.flow_id == flow_id).order_by(FlowRun.started_at.desc()).limit(50)
        )
        runs = runs_result.scalars().all()

        return create_response(200, data=[_run_to_dict(r) for r in runs], schema=FlowRunSummaryResponse)
    except Exception as e:
        return ExceptionHandler(e)


@router.get("/flow/run/{run_id}")
async def get_flow_run(
    run_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /flow/run/{run_id} — return a single flow run with all step results; requires viewer role."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(401, error_message="User not found")

        run_result = await db.execute(select(FlowRun).where(FlowRun.id == run_id))
        run = run_result.scalar_one_or_none()
        if not run:
            return create_response(404, error_message="Run not found")

        # Load parent flow to check workspace access
        flow_result = await db.execute(select(Flow).where(Flow.id == run.flow_id))
        flow = flow_result.scalar_one_or_none()
        if not flow:
            return create_response(404, error_message="Flow not found")

        ok = await can_access_workspace(db, flow.workspace_id, user.id, min_role="viewer")
        if not ok:
            return create_response(403, error_message="Access denied")

        steps_result = await db.execute(
            select(FlowStepResult).where(FlowStepResult.run_id == run_id)
        )
        steps = steps_result.scalars().all()

        return create_response(200, data=_run_to_dict(run, steps), schema=FlowRunDetailResponse)
    except Exception as e:
        return ExceptionHandler(e)
