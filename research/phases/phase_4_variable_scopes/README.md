# Phase 4 — Variable Scopes — full chain + live preview (differentiator X3)

**Status:** not-started
**Phase:** 4
**Depends on:** Phase 1 (secrets)
**Estimated scope:** full-stack · M

---

## What the user sees after this is done
Variables resolve through the full Postman scope chain — global → collection → environment →
local(run) — with the right precedence. New: a **collection variables** tab, **dynamic
variables** (`{{$randomEmail}}` etc.), and a **live inline preview** that shows the resolved
value across the whole chain as you type (differentiator X3 — Postman only shows it on hover).

## Deliverables
- [ ] `collection_variables` table (node-scoped) + CRUD endpoints
- [ ] Resolution chain extended: global→collection→environment→local
- [ ] Dynamic variable tokens (faker set) in resolve_variables (extends `${ts}`)
- [ ] `GET /resolve/preview` — resolved value + which scope won
- [ ] FE VariableScopePanel (collection tab) + inline {{var}} highlight/preview
- [ ] Secrets in collection vars encrypted (phase_1)

## Tasks → Subtasks (execute in order; each subtask = one PR ≤1 day)
> Detail in spec.md / reuse in research.md. Check off when its test_matrix rows pass.

### T1 — Collection variables   [files: models.py, routers/node/variables.py, alembic]   [reuse: global_variables upsert pattern]   [done when: H1,X1,X2 green]
- [ ] T1.1 `CollectionVariable` model + migration (unique node_id,key)
- [ ] T1.2 GET/PUT/DELETE `/node/{node_id}/variables` (encrypt secrets)

### T2 — Scope chain resolver   [files: common_querys.py, utils.py]   [reuse: get_folder_path_to_root, merge pattern, resolve_variables]   [done when: H2,H3,E1 green]
- [ ] T2.1 `get_collection_variables(file_id)` walk leaf→root, child overrides
- [ ] T2.2 `build_scope_chain` → global→collection→env→local; extend `resolve_variables` (optional param, back-compatible)

### T3 — Dynamic tokens   [files: utils.py]   [done when: H4,E2 green]
- [ ] T3.1 Add `{{$uuid}}`/`{{$randomInt}}`/`{{$randomEmail}}` (keep `${ts}`); evaluate once per run

### T4 — Resolve preview   [files: routers/environment/resolve preview]   [done when: H5,E3,E4,X3 green]
- [ ] T4.1 `GET /resolve/preview` → resolved text + winning scope per var; mask secrets

### T5 — Inline highlight UI   [files: components/RequestPanel InlineVarPreview, EnvironmentManager/VariableScopePanel]   [done when: tabs + tooltip render]
- [ ] T5.1 VariableScopePanel collection tab
- [ ] T5.2 CodeMirror decoration: highlight `{{var}}` + tooltip resolved value + scope badge (X3)

## AI agent files
| File | Purpose |
|---|---|
| spec.md | Backend + frontend changes |
| research.md | Existing code to reuse |
| test_matrix.md | Acceptance tests |
