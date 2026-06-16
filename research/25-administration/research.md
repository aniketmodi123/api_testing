# Research — Administration

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_15_differentiator_polish/spec.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/meta/comparison.py` | `GET /meta/comparison` — 16-row feature comparison sheet |
| `backend/src/routers/meta/__init__.py` | Package init |
| `backend/src/security.py` | `/meta/` prefix exempted from auth (public) |

## /meta/comparison Response
16 feature rows covering all differentiators + parity features.
Format: `[{feature, postman, apipilot, edge}]`
No DB queries — static JSON response.

## Notes
`/meta/` exemption in `security.py` — consistent with `/docs/` and `/m/` exemptions. Added via `startswith("/meta/")` check.
