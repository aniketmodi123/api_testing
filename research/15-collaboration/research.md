# Research — Collaboration (Comments)

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_11_collaboration/spec.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/collab/` | Comment CRUD endpoints |
| `backend/src/models.py` | `Comment` model |

## Comment Model
```
Comment
  id
  workspace_id      FK → workspaces CASCADE
  entity_type       varchar(20)  "node"|"api"|"api_case"|"flow"
  entity_id         int
  author_username   varchar(255)
  body              text
  parent_id         FK → comments SET NULL nullable  (threaded reply)
  created_at        datetime
```
Indexes: `(entity_type, entity_id)`, `(workspace_id)`.

No update endpoint — immutable for audit trail.
Delete allowed: author or admin only.

## Endpoints
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/workspace/{ws_id}/comment` | editor | Add comment |
| GET | `/workspace/{ws_id}/comments?entity_type=&entity_id=` | viewer | List for entity (threaded) |
| DELETE | `/comment/{comment_id}` | viewer (author) or admin | Delete own or any as admin |
