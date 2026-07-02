"""
What this file does: Provides CRUD for per-workspace governance rules and a lint endpoint
that evaluates all active APIs in a workspace against those rules, returning a violations report.
"""
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common_querys import can_access_workspace, get_user_by_username, write_audit
from config import get_db
from models import Api, ApiCase as ApiCaseModel, GovernanceRule, Node
from utils import ExceptionHandler, create_response

router = APIRouter()


class GovernanceRuleBody(BaseModel):
    """Create or update a governance rule for a workspace.

    Attributes:
        name: Short display label for the rule.
        rule_type: ``"naming"`` checks path/name against a regex; ``"required_field"``
                   checks that a header or param always appears; ``"status_code"`` checks
                   that at least one ApiCase for every Api expects a given status code.
        target: What is inspected — ``"path"``, ``"name"``, ``"header"``, ``"param"``.
        value: Regex pattern (naming) or expected value / status code string.
        enabled: ``True`` to include in lint runs; ``False`` to skip without deleting.
    """
    name: str
    rule_type: str
    target: str
    value: str
    enabled: bool = True


class LintViolation(BaseModel):
    """Represent a single governance violation found during a lint run.

    Attributes:
        api_id: ID of the offending Api row.
        api_name: Display name of the offending Api.
        endpoint: URL endpoint of the offending Api.
        rule_id: ID of the GovernanceRule that was violated.
        rule_name: Display name of that rule.
        message: Human-readable description of what failed.
    """
    api_id: int
    api_name: str
    endpoint: str
    rule_id: int
    rule_name: str
    message: str


class GovernanceRuleResponse(BaseModel):
    """Represent a governance rule as returned to the caller.

    Attributes:
        id: Rule row id.
        name: Display label.
        rule_type: ``"naming"``, ``"required_field"``, or ``"status_code"``.
        target: ``"path"``, ``"name"``, ``"header"``, or ``"param"``.
        value: Regex pattern (naming) or expected value/status code.
        enabled: ``True`` when the rule is included in lint runs.
        created_at: ISO timestamp the rule was created.
    """
    id: int
    name: str
    rule_type: str
    target: str
    value: str
    enabled: bool
    created_at: str


class LintReport(BaseModel):
    """Summary and per-violation detail from a governance lint run.

    Attributes:
        total_apis: Number of active APIs evaluated.
        violations_count: Total number of rule violations found.
        violations: List of individual violation details.
    """
    total_apis: int
    violations_count: int
    violations: List[LintViolation]


_VALID_RULE_TYPES = {"naming", "required_field", "status_code"}
_VALID_TARGETS = {"path", "name", "header", "param"}


def _check_rule(rule: GovernanceRule, api: Api, cases: list) -> Optional[str]:
    """What it does: Evaluate one rule against one Api+cases and return a violation message or None."""
    if rule.rule_type == "naming":
        subject = api.endpoint if rule.target == "path" else api.name
        if not re.search(rule.value, subject):
            return f"{rule.target} '{subject}' does not match pattern '{rule.value}'"

    elif rule.rule_type == "required_field":
        if rule.target == "header":
            missing = all(
                not (c.headers or {}).get(rule.value)
                for c in cases
            ) if cases else True
            if missing:
                return f"No case includes required header '{rule.value}'"
        elif rule.target == "param":
            missing = all(
                not (c.params or {}).get(rule.value)
                for c in cases
            ) if cases else True
            if missing:
                return f"No case includes required param '{rule.value}'"

    elif rule.rule_type == "status_code":
        expected = rule.value
        found = any(
            str((c.expected or {}).get("status_code", "")) == expected
            for c in cases
        )
        if not found:
            return f"No case expects status code {expected}"

    return None


@router.get("/workspace/{workspace_id}/governance/rules")
async def list_governance_rules(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """GET /workspace/{workspace_id}/governance/rules — list all governance rules for a workspace."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        access = await can_access_workspace(db, workspace_id, user.id, min_role="viewer")
        if not access:
            return create_response(403, error_message="Access denied")

        rows = (await db.execute(
            select(GovernanceRule).where(GovernanceRule.workspace_id == workspace_id)
            .order_by(GovernanceRule.id)
        )).scalars().all()

        return create_response(200, [
            {
                "id": r.id,
                "name": r.name,
                "rule_type": r.rule_type,
                "target": r.target,
                "value": r.value,
                "enabled": r.enabled,
                "created_at": str(r.created_at),
            }
            for r in rows
        ], GovernanceRuleResponse)
    except Exception as e:
        return ExceptionHandler(e)


@router.post("/workspace/{workspace_id}/governance/rules")
async def create_governance_rule(
    workspace_id: int,
    payload: GovernanceRuleBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /workspace/{workspace_id}/governance/rules — create a governance rule; admin only."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        access = await can_access_workspace(db, workspace_id, user.id, min_role="admin")
        if not access:
            return create_response(403, error_message="Admin role required")

        if payload.rule_type not in _VALID_RULE_TYPES:
            return create_response(400, error_message=f"rule_type must be one of {sorted(_VALID_RULE_TYPES)}")

        if payload.target not in _VALID_TARGETS:
            return create_response(400, error_message=f"target must be one of {sorted(_VALID_TARGETS)}")

        if payload.rule_type == "naming":
            try:
                re.compile(payload.value)
            except re.error as exc:
                return create_response(400, error_message=f"Invalid regex pattern: {exc}")

        rule = GovernanceRule(
            workspace_id=workspace_id,
            name=payload.name,
            rule_type=payload.rule_type,
            target=payload.target,
            value=payload.value,
            enabled=payload.enabled,
        )
        db.add(rule)
        await db.flush()
        rule_id = rule.id
        await write_audit(
            db, username, "governance_rule.create", "governance_rule", rule_id,
            workspace_id=workspace_id, metadata={"name": payload.name},
        )
        await db.commit()
        await db.refresh(rule)

        return create_response(201, {
            "id": rule.id,
            "name": rule.name,
            "rule_type": rule.rule_type,
            "target": rule.target,
            "value": rule.value,
            "enabled": rule.enabled,
            "created_at": str(rule.created_at),
        }, GovernanceRuleResponse)
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.put("/governance/rules/{rule_id}")
async def update_governance_rule(
    rule_id: int,
    payload: GovernanceRuleBody,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """PUT /governance/rules/{rule_id} — update a governance rule; admin only."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        rule = (await db.execute(
            select(GovernanceRule).where(GovernanceRule.id == rule_id)
        )).scalar_one_or_none()

        if not rule:
            return create_response(404, error_message="Rule not found")

        access = await can_access_workspace(db, rule.workspace_id, user.id, min_role="admin")
        if not access:
            return create_response(403, error_message="Admin role required")

        if payload.rule_type not in _VALID_RULE_TYPES:
            return create_response(400, error_message=f"rule_type must be one of {sorted(_VALID_RULE_TYPES)}")

        if payload.target not in _VALID_TARGETS:
            return create_response(400, error_message=f"target must be one of {sorted(_VALID_TARGETS)}")

        if payload.rule_type == "naming":
            try:
                re.compile(payload.value)
            except re.error as exc:
                return create_response(400, error_message=f"Invalid regex pattern: {exc}")

        rule.name = payload.name
        rule.rule_type = payload.rule_type
        rule.target = payload.target
        rule.value = payload.value
        rule.enabled = payload.enabled
        await write_audit(
            db, username, "governance_rule.update", "governance_rule", rule_id,
            workspace_id=rule.workspace_id, metadata={"name": payload.name},
        )
        await db.commit()
        await db.refresh(rule)

        return create_response(200, {
            "id": rule.id,
            "name": rule.name,
            "rule_type": rule.rule_type,
            "target": rule.target,
            "value": rule.value,
            "enabled": rule.enabled,
            "created_at": str(rule.created_at),
        }, GovernanceRuleResponse)
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.delete("/governance/rules/{rule_id}")
async def delete_governance_rule(
    rule_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """DELETE /governance/rules/{rule_id} — remove a governance rule; admin only."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        rule = (await db.execute(
            select(GovernanceRule).where(GovernanceRule.id == rule_id)
        )).scalar_one_or_none()

        if not rule:
            return create_response(404, error_message="Rule not found")

        access = await can_access_workspace(db, rule.workspace_id, user.id, min_role="admin")
        if not access:
            return create_response(403, error_message="Admin role required")

        await db.delete(rule)
        await write_audit(
            db, username, "governance_rule.delete", "governance_rule", rule_id,
            workspace_id=rule.workspace_id,
        )
        await db.commit()

        return create_response(200, message="Rule deleted")
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)


@router.post("/workspace/{workspace_id}/governance/lint")
async def lint_workspace(
    workspace_id: int,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /workspace/{workspace_id}/governance/lint — run all enabled rules against every active API; returns a violations report."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")

        access = await can_access_workspace(db, workspace_id, user.id, min_role="viewer")
        if not access:
            return create_response(403, error_message="Access denied")

        rules = (await db.execute(
            select(GovernanceRule).where(
                GovernanceRule.workspace_id == workspace_id,
                GovernanceRule.enabled.is_(True),
            )
        )).scalars().all()

        if not rules:
            return create_response(200, {"total_apis": 0, "violations_count": 0, "violations": []}, LintReport)

        # load all active apis in workspace via node join
        apis = (await db.execute(
            select(Api)
            .join(Node, Node.id == Api.file_id)
            .where(Node.workspace_id == workspace_id, Api.is_active.is_(True))
        )).scalars().all()

        if not apis:
            return create_response(200, {"total_apis": 0, "violations_count": 0, "violations": []}, LintReport)

        api_ids = [a.id for a in apis]

        # build api_id → cases map in one query
        case_rows = (await db.execute(
            select(ApiCaseModel).where(ApiCaseModel.api_id.in_(api_ids))
        )).scalars().all()

        cases_by_api: dict = {}
        for c in case_rows:
            cases_by_api.setdefault(c.api_id, []).append(c)

        violations = []
        for api in apis:
            api_cases = cases_by_api.get(api.id, [])
            for rule in rules:
                msg = _check_rule(rule, api, api_cases)
                if msg:
                    violations.append({
                        "api_id": api.id,
                        "api_name": api.name,
                        "endpoint": api.endpoint,
                        "rule_id": rule.id,
                        "rule_name": rule.name,
                        "message": msg,
                    })

        return create_response(200, {
            "total_apis": len(apis),
            "violations_count": len(violations),
            "violations": violations,
        }, LintReport)
    except Exception as e:
        return ExceptionHandler(e)
