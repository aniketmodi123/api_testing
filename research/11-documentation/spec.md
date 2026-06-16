# Spec — Documentation + Publishing

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_9_documentation/spec.md

## Goal
Auto-generated, shareable docs for a collection — endpoints, params, example cases. Publish to a public read-only page via unguessable token.

## Backend (shipped)

### Model
PublishedDoc — see research.md for full schema.

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/node/{node_id}/docs/generate` | editor | Walk subtree → render → upsert |
| POST | `/node/{node_id}/docs/publish` | admin | Set public_token → returns token |
| DELETE | `/node/{node_id}/docs/publish` | admin | Revoke (set token = null) |
| GET | `/docs/{public_token}` | none (public) | Return rendered doc JSON |

## Frontend (missing)
| Component | Purpose |
|---|---|
| DocGenerateView | "Generate docs" button + stats (api_count, case_count) |
| PublicDocPage | Render doc JSON as human-readable page (no login required) |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | One doc per node | Upsert | Regenerate always reflects current state |
| 2 | Public token | `secrets.token_hex(32)` | Consistent with mock server pattern |
| 3 | Publish gate | Admin role | Workspace-level action |
| 4 | Secret scrub | MVP: skip (cases store user values, not resolved) | Phase 4 already prevents secret storage in cases |
| 5 | Doc is a snapshot | Not live | Regenerate to reflect current collection state |

## Known Constraints
- No pagination on APIs in doc — collections rarely exceed 100 APIs
- `public_token = null` → doc is private
- Public page must NOT include case headers (auth tokens)
