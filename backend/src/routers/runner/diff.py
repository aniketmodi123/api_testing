"""
What this file does: Computes a field-level diff between two BulkTestExecution result sets and returns added, removed, and changed fields per case.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username
from config import get_db
from models import BulkTestExecution, BulkTestResult, BulkTestSchedule
from utils import ExceptionHandler, create_response

router = APIRouter()

_MISSING = object()
_MAX_VAL_LEN = 500


# ---------- Diff helpers ----------

def _truncate(val: Any) -> Any:
    """What it does: Truncate string representations longer than 500 chars to avoid noise in diff output."""
    if isinstance(val, str) and len(val) > _MAX_VAL_LEN:
        return val[:_MAX_VAL_LEN] + "…"
    return val


def _walk_diff(prefix: str, a: Any, b: Any, out: List[Dict[str, Any]]) -> None:
    """What it does: Recursively compare two JSON values and append {field, change, ...} entries to out."""
    if isinstance(a, dict) and isinstance(b, dict):
        all_keys = set(list(a.keys()) + list(b.keys()))
        for k in sorted(all_keys):
            path = f"{prefix}.{k}" if prefix else k
            av = a.get(k, _MISSING)
            bv = b.get(k, _MISSING)
            if av is _MISSING:
                out.append({"field": path, "change": "added", "value": _truncate(bv)})
            elif bv is _MISSING:
                out.append({"field": path, "change": "removed", "value": _truncate(av)})
            elif isinstance(av, dict) and isinstance(bv, dict):
                _walk_diff(path, av, bv, out)
            elif av != bv:
                out.append({"field": path, "change": "changed", "from": _truncate(av), "to": _truncate(bv)})
    else:
        if a != b:
            out.append({"field": prefix or "root", "change": "changed", "from": _truncate(a), "to": _truncate(b)})


def _diff_case(base_result: BulkTestResult, cmp_result: BulkTestResult) -> List[Dict[str, Any]]:
    """What it does: Return field-level changes between two BulkTestResult rows for the same case."""
    changes: List[Dict[str, Any]] = []

    # Top-level fields
    if base_result.status_code != cmp_result.status_code:
        changes.append({
            "field": "status_code",
            "change": "changed",
            "from": base_result.status_code,
            "to": cmp_result.status_code,
        })
    if base_result.success != cmp_result.success:
        changes.append({
            "field": "success",
            "change": "changed",
            "from": base_result.success,
            "to": cmp_result.success,
        })

    # Response body diff
    base_body = (base_result.response or {}).get("body") or {}
    cmp_body = (cmp_result.response or {}).get("body") or {}

    if isinstance(base_body, (dict, list)) and isinstance(cmp_body, (dict, list)):
        _walk_diff("body", base_body, cmp_body, changes)
    elif base_body != cmp_body:
        changes.append({
            "field": "body",
            "change": "changed",
            "from": _truncate(str(base_body)),
            "to": _truncate(str(cmp_body)),
        })

    return changes


async def _load_results_by_case(db: AsyncSession, exec_id: int) -> Dict[int, BulkTestResult]:
    """What it does: Return a dict of case_id → BulkTestResult for all results of an execution."""
    rows = (
        await db.execute(
            select(BulkTestResult).where(BulkTestResult.execution_id == exec_id)
        )
    ).scalars().all()
    return {r.case_id: r for r in rows}


async def _get_exec_workspace(db: AsyncSession, exec_id: int) -> Optional[int]:
    """What it does: Return the workspace_id for a BulkTestExecution via its schedule; None when not found."""
    row = (
        await db.execute(
            select(BulkTestSchedule.workspace_id)
            .join(BulkTestExecution, BulkTestExecution.schedule_id == BulkTestSchedule.id)
            .where(BulkTestExecution.id == exec_id)
        )
    ).first()
    return row[0] if row else None


# ---------- Route handler ----------

@router.get("/run/{exec_id}/diff")
async def regression_diff(
    exec_id: int,
    compare_exec_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /run/{exec_id}/diff — diff two bulk execution result sets; surface added, removed, and changed response fields per case.

    Steps:
        - Step 1: Authenticate user; resolve workspace for base execution.
        - Step 2: Verify viewer access on workspace; ensure compare execution belongs to same workspace.
        - Step 3: Load BulkTestResult rows for both executions keyed by case_id.
        - Step 4: Walk all case_ids from both sets; diff matched pairs; mark missing cases as added/removed.
        - Step 5: Return per-case change list.
    """
    try:
        # Step 1: auth + resolve workspace
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        workspace_id = await _get_exec_workspace(db, exec_id)
        if workspace_id is None:
            return create_response(206, error_message="Execution not found")

        # Step 2: RBAC + compare exec workspace check
        access = await can_access_workspace(db, workspace_id, user.id, min_role="viewer")
        if not access:
            return create_response(403, error_message="Access denied")

        cmp_workspace_id = await _get_exec_workspace(db, compare_exec_id)
        if cmp_workspace_id is None:
            return create_response(206, error_message="Compare execution not found")
        if cmp_workspace_id != workspace_id:
            return create_response(403, error_message="Executions belong to different workspaces")

        # Step 3: load results
        base_map = await _load_results_by_case(db, exec_id)
        cmp_map = await _load_results_by_case(db, compare_exec_id)

        # Step 4: diff all cases
        all_case_ids = set(base_map.keys()) | set(cmp_map.keys())
        case_diffs = []

        for case_id in sorted(all_case_ids):
            base_r = base_map.get(case_id)
            cmp_r = cmp_map.get(case_id)

            if base_r is None:
                case_diffs.append({
                    "case_id": case_id,
                    "case_name": cmp_r.case_name,
                    "change": "added",
                    "changes": [],
                })
                continue

            if cmp_r is None:
                case_diffs.append({
                    "case_id": case_id,
                    "case_name": base_r.case_name,
                    "change": "removed",
                    "changes": [],
                })
                continue

            changes = _diff_case(base_r, cmp_r)
            case_diffs.append({
                "case_id": case_id,
                "case_name": base_r.case_name,
                "change": "modified" if changes else "unchanged",
                "changes": changes,
            })

        # Step 5: return summary
        modified = sum(1 for c in case_diffs if c["change"] == "modified")
        added = sum(1 for c in case_diffs if c["change"] == "added")
        removed = sum(1 for c in case_diffs if c["change"] == "removed")

        return create_response(200, data={
            "base_exec_id": exec_id,
            "compare_exec_id": compare_exec_id,
            "summary": {
                "total_cases": len(case_diffs),
                "modified": modified,
                "added": added,
                "removed": removed,
                "unchanged": len(case_diffs) - modified - added - removed,
            },
            "cases": case_diffs,
        })
    except Exception as e:
        return ExceptionHandler(e)
