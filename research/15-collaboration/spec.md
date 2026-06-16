# Spec — Collaboration (Comments)

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_11_collaboration/spec.md

## Goal
Threaded comment system on any entity (node/api/api_case/flow). Builds on existing unlimited self-hosted workspace members (X9).

## Backend (shipped)
See research.md for model + endpoints.

## Frontend (missing)
| Component | Purpose |
|---|---|
| CommentThread | List + add comments threaded by parent_id |
| Integration | Mount CommentThread in node/api/case/flow detail views |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | No comment edit | Immutable | Audit integrity |
| 2 | Author/admin delete only | Standard moderation | Viewer can delete own comment |
| 3 | Polymorphic entity | entity_type + entity_id | Avoids 4 separate comment tables |
