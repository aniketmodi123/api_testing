# Research — Documentation + Publishing

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_9_documentation/spec.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/docs/` | Generate + publish + public read endpoints |
| `backend/src/models.py` | `PublishedDoc` model |
| `backend/src/common_querys.py` | `get_workspace_tree_response` — BFS walk for doc generation |

## PublishedDoc Model
```
PublishedDoc
  id
  node_id           FK → nodes CASCADE
  workspace_id      int indexed  (denormalized for access check)
  generated_by      varchar(255)  username
  public_token      varchar(64) unique nullable  (null = not published)
  content           JSON  (rendered doc model)
  created_at        datetime  (when last generated)
  updated_at        datetime onupdate
```
One row per node — upserted on each generate call (not append).

## Doc Content JSON Shape
```json
{
  "title": "Node name",
  "description": "...",
  "generated_at": "ISO8601",
  "apis": [
    {
      "id": 1, "name": "...", "method": "GET", "endpoint": "/...",
      "cases": [{"name": "...", "headers": {}, "params": {}, "body": {}, "expected": {}}]
    }
  ]
}
```

## Token Generation
`secrets.token_hex(32)` — 64 hex chars, unguessable. Same pattern as mock servers.

## Security Rules
- Public endpoint `GET /docs/{token}` — no auth required
- Must never return `ApiCase.headers` (could contain auth)
- Cases store user-entered values (not resolved secrets) — no scrub needed at MVP
- `public_token = null` → 404 on public read
