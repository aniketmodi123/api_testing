"""
What this file does: Computes a field-level diff between two BulkTestExecution result sets and returns added, removed, and changed fields per case.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import resolve_workspace_access
from config import get_db
from models import BulkTestExecution, BulkTestResult, BulkTestSchedule
from schema import RegressionDiffResponse
from utils import create_response

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
        - Step 1: Load workspace IDs for both executions in one query; verify both exist and share a workspace.
        - Step 2: Auth + access check via resolve_workspace_access (1 query).
        - Step 3: Load BulkTestResult rows for both executions in one query, partitioned in Python.
        - Step 4: Walk all case_ids from both sets; diff matched pairs; mark missing cases as added/removed.
        - Step 5: Return per-case change list.
    """
    # Step 1: Resolve both execution workspace IDs in one query
    exec_rows = (await db.execute(
        select(BulkTestExecution.id, BulkTestSchedule.workspace_id)
        .join(BulkTestSchedule, BulkTestExecution.schedule_id == BulkTestSchedule.id)
        .where(BulkTestExecution.id.in_([exec_id, compare_exec_id]))
    )).all()
    ws_by_exec: Dict[int, int] = {row[0]: row[1] for row in exec_rows}

    workspace_id: Optional[int] = ws_by_exec.get(exec_id)
    if workspace_id is None:
        return create_response(404, error_message="Execution not found")

    cmp_workspace_id: Optional[int] = ws_by_exec.get(compare_exec_id)
    if cmp_workspace_id is None:
        return create_response(404, error_message="Compare execution not found")
    if cmp_workspace_id != workspace_id:
        return create_response(403, error_message="Executions belong to different workspaces")

    # Step 2: Auth + access check (1 query)
    access = await resolve_workspace_access(db, username, workspace_id)
    if not access.user:
        return create_response(400, error_message="User not found")
    if not access.can_access:
        return create_response(403, error_message="Access denied")

    # Step 3: Load results for both executions in one query
    all_results = (await db.execute(
        select(BulkTestResult)
        .where(BulkTestResult.execution_id.in_([exec_id, compare_exec_id]))
    )).scalars().all()
    base_map: Dict[int, BulkTestResult] = {r.case_id: r for r in all_results if r.execution_id == exec_id}
    cmp_map: Dict[int, BulkTestResult] = {r.case_id: r for r in all_results if r.execution_id == compare_exec_id}

    # Step 4: Diff all cases
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

    # Step 5: Return summary
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
    }, schema=RegressionDiffResponse)
