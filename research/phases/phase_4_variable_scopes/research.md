# Research — Variable Scopes

LAST_UPDATED: 2026-06-15

## Existing Code to Reuse
| File | Function/Component | How to use |
|---|---|---|
| utils.py | `resolve_variables(data, variables, ts)` | extend to take merged scope map + dynamic tokens; keep signature back-compatible |
| common_querys.py | `get_workspace_variables` (env), `get_folder_path_to_root` | env scope + walk pattern for collection vars |
| routers/variables/global_variables.py | `get_global_variables_for_user` | global scope source |
| routers/environment/resolve_variables.py | existing resolve endpoint | base for /resolve/preview |
| utils/secrets.py (phase_1) | encrypt/decrypt | secret collection vars |
| frontend CodeMirror editors (RequestPanel) | json/url editing | attach inline highlight decoration |

## Patterns in this Codebase
```python
# Walk-to-root pattern (reuse for collection vars):
folder_ids = await get_folder_path_to_root(db, file_id)   # leaf→root
# collect vars per folder, child overrides parent (like merge_headers_with_priority)

# resolve_variables currently: {{VAR}} + ${ts}. Extend dynamic tokens:
# {{$uuid}} {{$randomInt}} {{$randomEmail}} evaluated at resolve time
```

## API Contracts
| Endpoint | Input | Output | Notes |
|---|---|---|---|
| GET /node/{id}/variables | — | list | collection scope |
| GET /resolve/preview | text, file_id | {resolved, vars:[{name,value,scope,unresolved}]} | secrets masked |

## Component Patterns
VariableScopePanel mirrors existing EnvironmentManager tabs. InlineVarPreview = CodeMirror
decoration (the repo already uses @uiw/react-codemirror) highlighting `{{...}}` + tooltip with
resolved value + scope badge.

## Gotchas
| # | Thing | Why it trips you up | How to handle |
|---|---|---|---|
| 1 | resolve_variables called in many places | signature change breaks callers | add optional param, default old behavior |
| 2 | env var already "active environment" only | collection adds another source | merge order explicit |
| 3 | dynamic token in assertion | flaky | resolve once, store in run context |
| 4 | secret value masking in preview | leak risk | never return decrypted secret in preview |
