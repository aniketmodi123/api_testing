# 05 — Environments

Status: Existing
Coverage: 80%

## Implemented
- Environment model (`Environment.variables` JSON, one active per workspace)
- Create/switch/delete environments
- `{{VAR}}` substitution from active environment

## Missing
- Per-entry `is_secret` flag on env var entries (currently whole-env, not per-key)
- Environment duplication/cloning UI
- Env import/export (JSON)

## Current Task
None — secret per-entry encryption deferred to 04-variables phase (requires schema change)

## Next Task
Per-entry `is_secret` flag (extends 04-variables scope chain work)

## Dependencies
- 04-variables (per-entry secret encryption deferred here)

## Priority
P2
