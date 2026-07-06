"""
What this file does: Async flow execution engine — iterates ordered FlowStep records, resolves variables, sends requests, extracts jsonpath values into run context, evaluates conditions, and persists per-step results with secrets masked.
"""

import asyncio
import time as _time
from typing import Any, Dict, Optional

from sqlalchemy import select

from common_querys import build_scope_chain, write_audit
from config import SessionLocal
from models import Api, Flow, FlowRun, FlowStep, FlowStepResult, Node
from routers.runner.execute_direct import send_request
from utils import logs, merge_scopes, resolve_variables
from vault import decrypt as dec_secret

MAX_STEPS = 100
_SECRET_PLACEHOLDER = "***"


def _jsonpath_extract(data: Any, path: str) -> Any:
    """What it does: Extract a value from a JSON structure using a jsonpath expression; return None when path does not match."""
    try:
        from jsonpath_ng import parse as jp_parse
        expr = jp_parse(path)
        matches = expr.find(data)
        if matches:
            return matches[0].value
    except Exception:
        pass
    return None


def _mask_secrets(obj: Any, secret_keys: set) -> Any:
    """What it does: Recursively replace values for keys in secret_keys with *** in a dict/list/str structure."""
    if isinstance(obj, dict):
        return {k: (_SECRET_PLACEHOLDER if k in secret_keys else _mask_secrets(v, secret_keys)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_mask_secrets(i, secret_keys) for i in obj]
    return obj


def _eval_condition(condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """What it does: Evaluate a simple condition dict {var, op, value} against the current run context; return True when condition passes."""
    var_name = condition.get("var", "")
    op = condition.get("op", "eq")
    expected = condition.get("value")
    actual = context.get(var_name)

    try:
        if op == "eq":
            return str(actual) == str(expected)
        if op == "neq":
            return str(actual) != str(expected)
        if op == "gt":
            return float(actual) > float(expected)
        if op == "lt":
            return float(actual) < float(expected)
        if op == "contains":
            return str(expected) in str(actual)
        if op == "exists":
            return actual is not None
    except Exception:
        pass
    return False


async def execute_flow(flow_id: int, username: str, input_vars: Optional[Dict[str, Any]] = None, run_id: Optional[int] = None) -> int:
    """
    What it does: Execute all steps of a flow in order within its own DB session; return the FlowRun.id.
    Args:
        flow_id: Id of the flow to execute.
        username: Email of the triggering user; used for auth resolution and audit.
        input_vars: Optional caller-supplied local variables injected as the initial run context.
        run_id: Existing FlowRun to execute into (the stub the trigger route created so it could
            return an id immediately); ``None`` creates a fresh FlowRun.
    Returns:
        int: The FlowRun.id this execution wrote its results to.
    Steps:
        - Step 1: Open own DB session; load flow + steps; reuse the stub FlowRun or create one
        - Step 2: For each step in order, resolve variables against full scope chain + run context
        - Step 3: Execute step action (request / condition / delay / set_var)
        - Step 4: On request: extract jsonpath vars into context; mask secrets; persist FlowStepResult
        - Step 5: On condition: evaluate; skip remaining steps when condition fails with no on_false handler
        - Step 6: Mark FlowRun completed or failed; write audit row; return run_id
    """
    async with SessionLocal() as db:
        # Step 1: Load flow and resolve the run row (reuse stub if the trigger route made one)
        flow_result = await db.execute(select(Flow).where(Flow.id == flow_id))
        flow = flow_result.scalar_one_or_none()
        if not flow:
            raise ValueError(f"Flow {flow_id} not found")

        steps_result = await db.execute(
            select(FlowStep).where(FlowStep.flow_id == flow_id).order_by(FlowStep.step_order)
        )
        steps = steps_result.scalars().all()

        run = None
        if run_id is not None:
            run_result = await db.execute(select(FlowRun).where(FlowRun.id == run_id))
            run = run_result.scalar_one_or_none()
        if run is None:
            run = FlowRun(flow_id=flow_id, status="running", context=input_vars or {})
            db.add(run)
            await db.flush()
        run_id = run.id

        context: Dict[str, Any] = dict(input_vars or {})
        run_error: Optional[str] = None
        step_count = 0

        try:
            for step in steps:
                step_count += 1
                if step_count > MAX_STEPS:
                    raise RuntimeError("Flow exceeded max step guard")

                step_start = _time.time()
                result_kwargs: Dict[str, Any] = {
                    "run_id": run_id,
                    "step_id": step.id,
                    "step_order": step.step_order,
                    "success": False,
                    "duration_ms": 0,
                }

                try:
                    if step.type == "delay":
                        delay_ms = (step.config or {}).get("delay_ms", 0)
                        await asyncio.sleep(max(0, delay_ms) / 1000)
                        result_kwargs["success"] = True

                    elif step.type == "set_var":
                        for k, v in (step.config or {}).items():
                            context[k] = resolve_variables(v, context)
                        result_kwargs["success"] = True

                    elif step.type == "condition":
                        cond = step.condition or {}
                        passed = _eval_condition(cond, context)
                        result_kwargs["success"] = True
                        if not passed:
                            on_false = cond.get("on_false", "stop")
                            if on_false == "stop":
                                db.add(FlowStepResult(**result_kwargs))
                                await db.flush()
                                break  # stop flow — condition not met

                    elif step.type == "request":
                        # Load api for this step
                        if not step.api_id:
                            raise ValueError("Request step missing api_id")

                        api_result = await db.execute(select(Api).where(Api.id == step.api_id))
                        api = api_result.scalar_one_or_none()
                        if not api:
                            raise ValueError(f"Api {step.api_id} not found")

                        # Load workspace_id via file node
                        node_result = await db.execute(select(Node.workspace_id).where(Node.id == api.file_id))
                        workspace_id = node_result.scalar_one_or_none()

                        # Build merged scope: global < collection < env < local context
                        scope = await build_scope_chain(db, api.file_id, username, workspace_id, context)

                        # Resolve request parts
                        resolved_url = resolve_variables(api.endpoint, scope)
                        resolved_headers = resolve_variables(api.extra_meta.get("headers", {}) if api.extra_meta else {}, scope)
                        resolved_body = resolve_variables(api.extra_meta.get("body") if api.extra_meta else None, scope)
                        step_config = step.config or {}

                        # Step-level overrides from config
                        if step_config.get("headers"):
                            resolved_headers = merge_scopes(resolved_headers, resolve_variables(step_config["headers"], scope))
                        if step_config.get("body") is not None:
                            resolved_body = resolve_variables(step_config["body"], scope)
                        if step_config.get("params"):
                            resolved_params = resolve_variables(step_config["params"], scope)
                        else:
                            resolved_params = {}

                        # Auth injection (sync apply_auth only — oauth2 deferred per known constraint)
                        from auth_strategies import apply_auth
                        from common_querys import resolve_auth
                        auth_config = await resolve_auth(db, api.file_id)
                        if auth_config:
                            body_bytes = None
                            if resolved_body is not None:
                                import json as _json
                                body_bytes = _json.dumps(resolved_body).encode() if isinstance(resolved_body, (dict, list)) else str(resolved_body).encode()
                            auth_headers, auth_params = apply_auth(
                                auth_config,
                                method=api.method.upper(),
                                url=resolved_url,
                                existing_headers=resolved_headers,
                                body_bytes=body_bytes,
                            )
                            for k, v in auth_headers.items():
                                if k not in resolved_headers:
                                    resolved_headers[k] = v
                            resolved_params = {**auth_params, **resolved_params}

                        send_result = await send_request(
                            method=api.method,
                            url=resolved_url,
                            headers=resolved_headers,
                            params=resolved_params,
                            body=resolved_body,
                            body_type=step_config.get("body_type", "JSON"),
                            timeout=float(step_config.get("timeout", 30)),
                        )

                        # Extract jsonpath vars into context
                        extracted: Dict[str, Any] = {}
                        if step.extract:
                            response_json = send_result.get("json")
                            for var_name, path in step.extract.items():
                                value = _jsonpath_extract(response_json, path)
                                if value is not None:
                                    context[var_name] = value
                                    extracted[var_name] = value
                                else:
                                    logs(f"Flow step {step.step_order}: jsonpath '{path}' no match for var '{var_name}'", type="warning")

                        # Mask secrets before persist
                        # Collect secret keys from scope (keys whose raw value differs from global/collection encrypted store)
                        # Simple heuristic: mask Authorization header value in request snapshot
                        request_snapshot = {
                            "method": api.method.upper(),
                            "url": resolved_url,
                            "headers": {k: ("***" if k.lower() == "authorization" else v) for k, v in resolved_headers.items()},
                            "body": resolved_body,
                        }
                        response_snapshot = {
                            "status_code": send_result["status_code"],
                            "headers": dict(send_result["headers"]),
                            "body": send_result.get("text", ""),
                        }

                        result_kwargs.update({
                            "success": True,
                            "request": request_snapshot,
                            "response": response_snapshot,
                            "extracted": extracted or None,
                        })

                except Exception as step_err:
                    result_kwargs["error_message"] = str(step_err)
                    result_kwargs["success"] = False
                    logs(f"Flow {flow_id} run {run_id} step {step.step_order} failed: {step_err}", type="error")
                    result_kwargs["duration_ms"] = int((_time.time() - step_start) * 1000)
                    db.add(FlowStepResult(**result_kwargs))
                    await db.flush()
                    run_error = str(step_err)
                    break

                result_kwargs["duration_ms"] = int((_time.time() - step_start) * 1000)
                db.add(FlowStepResult(**result_kwargs))
                await db.flush()

            # Step 6: Finalise run
            run.status = "failed" if run_error else "completed"
            run.context = context
            import datetime as _dt
            run.finished_at = _dt.datetime.now()
            if run_error:
                run.error_message = run_error

            await write_audit(db, username, "flow.run", "flow", flow_id, flow.workspace_id, {"run_id": run_id, "status": run.status})
            await db.commit()

        except Exception as engine_err:
            run.status = "failed"
            run.error_message = str(engine_err)
            import datetime as _dt
            run.finished_at = _dt.datetime.now()
            await db.commit()
            logs(f"Flow engine fatal error flow={flow_id} run={run_id}: {engine_err}", type="error")

    return run_id
