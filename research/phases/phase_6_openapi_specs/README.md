# Phase 6 — OpenAPI & Schema Management — bidirectional import/export (differentiator X6)

**Status:** not-started (stub — full spec at phase start)
**Phase:** 6
**Depends on:** Phase 0 (Alembic)
**Estimated scope:** full-stack · L

## What the user sees
Import an OpenAPI/Swagger spec → auto-generate the collection (folders/files/APIs/cases). Export
the reverse. Round-trip cURL ⇄ request ⇄ collection (differentiator X6 — Postman import is lossy
and one-way-ish).

## Deliverables
- [ ] `api_specs` table (workspace-scoped, format, raw, parsed, version)
- [ ] `POST /spec/import` → generate nodes/apis/cases (extend existing `node/bulk_import`)
- [ ] `GET /spec` list/detail
- [ ] Export collection → OpenAPI
- [ ] cURL ⇄ request both directions
- [ ] FE SpecImportModal with tree-diff preview
- [ ] Tests: parse, idempotent re-import, `$ref` SSRF block

## Tasks → Subtasks (this is a STUB — do T0 first)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root api-design.md/database-design.md
- [ ] T1 `api_specs` model + migration
- [ ] T2 `POST /spec/import` parse OpenAPI/Swagger → nodes/apis/cases (extend bulk_import); `$ref` SSRF-blocked
- [ ] T3 `GET /spec` list/detail; export collection → OpenAPI
- [ ] T4 cURL ⇄ request both directions
- [ ] T5 FE SpecImportModal (tree-diff preview)
- [ ] T6 Tests: parse, idempotent re-import, SSRF

## Reuse
`routers/node/bulk_import.py` (already imports trees), `ImportExport` FE component, validator.py.

## Definition of Done
Import an OpenAPI spec → working collection with runnable cases; export back; preview diff; SSRF-safe.
