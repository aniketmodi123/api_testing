# Phase 11 — Collaboration — comments + version control

**Status:** not-started (stub)
**Phase:** 11
**Depends on:** Phase 2 (audit/RBAC)
**Estimated scope:** full-stack · M

## What the user sees
Comment threads on nodes/APIs/cases/flows, and version history with diff + restore for
collections. Builds on existing unlimited self-hosted workspace members (differentiator X9 — no
per-seat tax).

## Deliverables
- [ ] `comments` table (polymorphic entity_type/entity_id, threaded)
- [ ] `node_versions` table (snapshot + restore)
- [ ] Comment CRUD + version snapshot/restore endpoints
- [ ] FE CommentThread + VersionHistoryPanel (diff + restore)
- [ ] Tests: restore integrity, author/admin delete only

## Tasks → Subtasks (this is a STUB — do T0 first)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root docs
- [ ] T1 `comments` model + migration (polymorphic entity_type/entity_id, threaded)
- [ ] T2 Comment CRUD endpoints + FE CommentThread
- [ ] T3 `node_versions` model + snapshot/restore endpoints
- [ ] T4 FE VersionHistoryPanel (diff + restore)
- [ ] T5 Tests: restore integrity, author/admin-only delete

## Reuse
Existing members/roles, AuditLog (phase_2), TestResult diff view pattern (phase_4 test work).

## Definition of Done
Threaded comments attach to any entity; snapshot/restore round-trips a collection accurately.
