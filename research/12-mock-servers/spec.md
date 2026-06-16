# Spec — Mock Servers

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_8_mock_servers/spec.md

## Goal
Spin up a mock server from a collection. Routes match by method/path/matcher and return canned or templated responses. Differentiator X10 — promote real captured responses in one click.

## Backend (shipped)

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/mock` | editor | Create mock server |
| GET | `/mock?workspace_id=` | viewer | List servers for workspace |
| GET | `/mock/{server_id}` | viewer | Server detail + routes |
| PUT | `/mock/{server_id}` | editor | Update |
| DELETE | `/mock/{server_id}` | admin | Delete server + all routes |
| POST | `/mock/{server_id}/route` | editor | Add route |
| PUT | `/mock/{server_id}/route/{route_id}` | editor | Update route |
| DELETE | `/mock/{server_id}/route/{route_id}` | editor | Delete route |
| POST | `/mock/{server_id}/route/from-history` | editor | Create route from RequestHistory |
| POST | `/mock/{server_id}/route/from-result` | editor | Create route from BulkTestResult |
| ANY | `/m/{public_token}/{path:path}` | none (public) | Serve matched route |

## Frontend (missing)
| Component | Purpose |
|---|---|
| MockServerList | Create / list / delete servers |
| MockRouteEditor | Add / edit / delete routes; from-history shortcut |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Rate limit store | In-process dict | MVP; Redis later |
| 2 | Token generation | `secrets.token_hex(32)` | 64 hex chars, unguessable |
| 3 | Route conflict | Priority DESC, first match wins | Simple, predictable |
| 4 | Response body template | Reuse `resolve_variables` | Already handles `{{$uuid}}` etc |

## Known Constraints
- Rate limit resets on process restart (in-memory)
- `from-history` + `from-result` never copy auth/cred data
