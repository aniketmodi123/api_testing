# 15 — Collaboration (Comments)

Status: Partial
Coverage: 40%

## Implemented (backend)
- `Comment` model (polymorphic entity_type/entity_id, threaded via parent_id)
- Comment CRUD: POST, GET (by entity), DELETE (author or admin)
- Immutable comments (no edit endpoint — audit integrity)

## Missing
- FE CommentThread component
- FE integration into node/api/case/flow views

## Current Task
None (backend done)

## Next Task
FE CommentThread

## Dependencies
- audit-logs (write_audit for comment actions — done)
- 14-workspaces (RBAC gate)

## Priority
P2

## Differentiator
X9 — unlimited collaborators, no seat tax
