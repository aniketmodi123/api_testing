# Spec — Environments

STATUS: stable (existing feature; deferred changes)
LAST_CHANGED: 2026-06-16

## Current State
Environments work end-to-end. No new backend work until 04-variables per-entry secret flag ships.

## Deferred Changes (blocked on 04-variables)
- Per-entry `is_secret` flag: reshape `Environment.variables` from `{key: value}` to `{key: {value, is_secret}}` — expand→migrate→contract
- Encrypt secret env var entries via `vault.py` on save; decrypt at resolve

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Env var encryption | Deferred to 04-variables | `Environment.variables` has no per-entry is_secret flag; adding now is a breaking schema change |
| 2 | Active env per workspace | One active at a time | Matches Postman UX |
