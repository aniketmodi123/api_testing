# Research — Audit Logs

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_2_audit_rbac/research.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/audit.py` | `GET /audit` endpoint |
| `backend/src/common_querys.py` | `write_audit(db, ...)` helper + `require_role(min_role)` dependency |
| `backend/src/models.py` | `AuditLog` model |

## AuditLog Model
```
AuditLog
  id
  username        varchar(255) indexed
  workspace_id    int indexed nullable  (null for account-level ops)
  action          varchar(100)  e.g. "node.create", "api_case.delete", "node.version.restore"
  entity_type     varchar(50)
  entity_id       int
  metadata        JSON  (contextual info)
  ip              varchar(45)
  created_at      datetime indexed
```
Composite index: `(workspace_id, created_at)`. Append-only — no update/delete endpoints.

## write_audit Pattern
```python
# Called right before commit, same transaction:
await write_audit(db, username=user.username, workspace_id=ws_id,
                  action="node.create", entity_type="node", entity_id=node.id,
                  metadata={"name": node.name}, ip=request.client.host)
# If audit insert fails → whole mutation rolls back (atomicity)
```

## require_role Pattern
```python
def require_role(min_role: str):
    async def dep(workspace_id: int, username: str = Header(...), db=Depends(get_db)):
        user = await get_user_by_username(db, username)
        if not user or not await can_access_workspace(db, workspace_id, user.id, min_role=min_role):
            raise HTTPException(403, "Access denied")
        return user
    return dep
```
