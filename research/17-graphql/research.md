# Research — GraphQL

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/runner/` | `graphql_introspect.py` — introspection query endpoint |
| `backend/src/routers/runner/execute_direct.py` | GraphQL body mode: sends query + variables as JSON body |

## Notes
GraphQL body type sent as JSON: `{"query": "...", "variables": {...}}`. The runner handles this as a standard JSON body — no special processing. Introspection is a separate dedicated endpoint.
