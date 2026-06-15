# Spec — Variable Scopes

STATUS: not-started
LAST_CHANGED: 2026-06-15

## Goal
Complete the variable scope chain (global→collection→environment→local), add dynamic tokens and a live resolution preview.

## Deliverables
1. `collection_variables` table scoped to a folder node (subtree).
2. Resolver merges 4 scopes with deterministic precedence (local highest, global lowest).
3. Dynamic tokens (`{{$randomEmail}}`, `{{$randomInt}}`, `{{$uuid}}`, keep `${ts}`).
4. `/resolve/preview` returns value + winning scope.
5. FE collection vars tab + inline highlight.

## Backend Changes
### New Models
| Model | Fields | Notes |
|---|---|---|
| CollectionVariable | id, node_id(FK), key, value(enc if secret), is_secret, created_at | unique(node_id,key) |

### New Endpoints
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | /node/{node_id}/variables | viewer | list collection vars |
| PUT | /node/{node_id}/variables | editor | bulk upsert |
| DELETE | /node/{node_id}/variables/{key} | editor | delete |
| GET | /resolve/preview | viewer | resolve text + winning scope per var |

### Modified Endpoints / Logic
| File | Change |
|---|---|
| utils.py `resolve_variables` | accept merged 4-scope map; add dynamic-token expansion |
| common_querys.py | `get_collection_variables(file_id)` walk node→root collecting vars; `build_scope_chain` |
| routers/runner/* | pass local(run) context + collection vars into resolve |
| main.py | register collection vars router; import CollectionVariable |

## Frontend Changes
### New Components
| Component | Location | Purpose |
| VariableScopePanel | components/EnvironmentManager | tabs Global/Env/Collection |
| InlineVarPreview | components/RequestPanel | highlight {{var}} + show resolved value (X3) |
### Modified Components
| RequestPanel | wire inline preview into URL/body/header editors |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Collection var scope | node subtree (walk to root) | mirrors header inheritance |
| 2 | Precedence | local>env>collection>global | matches Postman semantics |
| 3 | Dynamic tokens | extend resolve_variables (one place) | single resolver, reuse everywhere |
| 4 | Preview | server endpoint (auth + secret-aware) | masks secrets, shows winning scope (X3) |
| 5 | Secret collection vars | encrypt (phase_1) | consistency |

## Edge Cases
| # | Trap | How it breaks | Fix |
|---|---|---|---|
| 1 | Same key in 2 scopes | which wins? | precedence order, surface in preview |
| 2 | Nested folders both define key | deepest collection wins | walk leaf→root, first-set wins |
| 3 | Dynamic token in expected/assertion | non-deterministic test | evaluate once per run, reuse value |
| 4 | Secret var in preview response | leak | mask secret values in preview |
| 5 | Unknown {{var}} | leaves literal or errors | leave literal + flag "unresolved" in preview |

## Open Questions
| # | Question | Recommendation |
|---|---|---|
| 1 | Local var source (set-from-response vs manual) | both; chaining (phase_5) sets local vars |
| 2 | Dynamic token catalog size | start small (email/int/uuid/timestamp), grow on demand |
