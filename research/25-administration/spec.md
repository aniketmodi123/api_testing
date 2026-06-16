# Spec — Administration

STATUS: stable (meta endpoint done; admin dashboard deferred)
LAST_CHANGED: 2026-06-16

## Shipped
- `GET /meta/comparison` — public comparison endpoint

## Pending
- Admin dashboard (FE) — user list, deactivation, system health

## Decision Table
| # | Decision | Reason |
|---|---|---|
| D1 | /meta/ routes public (no auth) | Comparison table must load on landing page without login |
| D2 | Static JSON comparison | No DB needed; fast; frontend can render without hardcoding |
