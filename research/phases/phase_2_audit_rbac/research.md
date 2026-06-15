# Research — Audit + RBAC Extension

LAST_UPDATED: 2026-06-15

## Existing Code to Reuse
| File | Function/Component | How to use |
|---|---|---|
| routers/workspace/members.py | `can_access_workspace(db, ws_id, user.id, min_role=...)` | wrap in `require_role` dependency |
| common_querys.py | `get_user_by_username`, `verify_node_ownership` | identity + ownership before audit |
| utils.py | `create_response`, `ExceptionHandler`, `logs` | response + error + log |
| models.py | `WorkspaceMember.role` (viewer/editor/admin) | role hierarchy source |

## Patterns in this Codebase
```python
# Existing gate (members.py):
has_access = await can_access_workspace(db, workspace_id, user.id, min_role="admin")
if not has_access:
    return create_response(403, error_message="Access denied")

# New reusable dependency form:
def require_role(min_role: str):
    async def dep(workspace_id: int, username: str = Header(...), db=Depends(get_db)):
        user = await get_user_by_username(db, username)
        if not user or not await can_access_workspace(db, workspace_id, user.id, min_role=min_role):
            raise HTTPException(403, "Access denied")
        return user
    return dep
```

## API Contracts
| Endpoint | Input | Output | Notes |
|---|---|---|---|
| GET /audit | workspace_id, limit, offset | wrapped list rows | admin only |

## Component Patterns
AuditLogTable mirrors existing list components (HistoryPanel) — paginated table, RTK Query.

## Gotchas
| # | Thing | Why it trips you up | How to handle |
|---|---|---|---|
| 1 | 403 via raise vs create_response | middleware/handler differences | match existing: handlers return create_response(403); dependency may raise HTTPException (caught by unified handler) |
| 2 | role order viewer<editor<admin | string compare wrong | keep numeric rank map in can_access_workspace (already there) |
| 3 | audit in same txn | if handler commits late, audit may miss on early return | write audit right before commit |
