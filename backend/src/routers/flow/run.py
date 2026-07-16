"""
What this file does: Exposes POST /flow/{id}/run (async fire-and-forget), GET /flow/{id}/runs (history list), and GET /flow/run/{run_id} (single run detail with step results).
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import has_min_role, resolve_workspace_access
from config import get_db
from models import Flow, FlowRun, FlowStepResult
from utils import create_response

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


def _run_to_dict(run: Any, steps: Optional[List[Any]] = None) -> Dict[str, Any]:
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
            for s in steps
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

    # Create a stub FlowRun so we can return run_id immediately
    run = FlowRun(flow_id=flow_id, status="running", context=payload.input_vars or {})
    db.add(run)
    await db.flush()
    run_id = run.id
    await db.commit()

    # Fire engine in background; engine opens its own session and writes into the stub run
    background_tasks.add_task(_background_execute, flow_id, username, payload.input_vars, run_id)

    return create_response(202, data={"run_id": run_id, "status": "running"}, schema=FlowRunAcceptedResponse)


@router.get("/flow/{flow_id}/runs")
async def list_flow_runs(
    flow_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /flow/{flow_id}/runs — list past runs for a flow ordered newest first; requires viewer role."""
    flow_row = (await db.execute(
        select(Flow.id, Flow.workspace_id).where(Flow.id == flow_id)
    )).first()
    if not flow_row:
        return create_response(404, error_message="Flow not found")

    access = await resolve_workspace_access(db, username, flow_row.workspace_id)
    if not access.user:
        return create_response(401, error_message="User not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    runs = (await db.execute(
        select(
            FlowRun.id, FlowRun.flow_id, FlowRun.status,
            FlowRun.started_at, FlowRun.finished_at, FlowRun.error_message,
        )
        .where(FlowRun.flow_id == flow_id)
        .order_by(FlowRun.started_at.desc())
        .limit(50)
    )).all()

    return create_response(200, data=[_run_to_dict(r) for r in runs], schema=FlowRunSummaryResponse)


@router.get("/flow/run/{run_id}")
async def get_flow_run(
    run_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /flow/run/{run_id} — return a single flow run with all step results; requires viewer role."""
    # Join FlowRun + Flow.workspace_id in one query to avoid a separate Flow lookup
    join_row = (await db.execute(
        select(FlowRun, Flow.workspace_id)
        .join(Flow, Flow.id == FlowRun.flow_id)
        .where(FlowRun.id == run_id)
    )).first()
    if not join_row:
        return create_response(404, error_message="Run not found")
    run, workspace_id = join_row

    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(401, error_message="User not found")
    if not has_min_role(access, "viewer"):
        return create_response(403, error_message="Access denied")

    steps = (await db.execute(
        select(FlowStepResult)
        .where(FlowStepResult.run_id == run_id)
        .order_by(FlowStepResult.step_order)
    )).scalars().all()

    return create_response(200, data=_run_to_dict(run, steps), schema=FlowRunDetailResponse)
