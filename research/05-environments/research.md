# Research — Environments

LAST_UPDATED: 2026-06-16

## Existing Code
| File | What it does |
|---|---|
| `backend/src/models.py` | `Environment` model: `id, workspace_id(FK), name, variables(JSON), created_at` |
| `backend/src/routers/environment/` | Save, resolve, list, delete endpoints |
| `backend/src/common_querys.py` | `get_workspace_variables(db, workspace_id)` — returns active env vars |

## Known Limitation
`Environment.variables` is a flat JSON dict `{key: value}`. No per-entry metadata (is_secret, description). Adding per-entry metadata requires reshaping to `{key: {value, is_secret}}` — a breaking schema change. Deferred to 04-variables phase.

## Gotchas
- Only one environment is "active" per workspace at a time
- Env vars are not encrypted at rest (whole-env, no per-entry flag)
- `get_workspace_variables` returns the full dict — callers must handle secret masking themselves
