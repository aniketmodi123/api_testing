# 04 — Variables

Status: Research complete — spec in-progress
Coverage: 75% (up from 60% — deep research added FE components, full dynamic var catalog, edge cases, data scope gap documented)

---

## Implemented

- Global variables (`GlobalVariable` model, per-user cross-workspace)
- Environment variables (`Environment.variables` JSON, one active per workspace)
- `${ts}` dynamic timestamp token (legacy syntax)
- Secret variable masking (`is_secret` flag, `***` in UI)
- Secret encryption at rest — global vars encrypted via `vault.py` (Fernet)
- 4-scope precedence documented: local > env > collection > global

---

## Missing (backend)

- Collection variables (`CollectionVariable` model + node-scoped CRUD) — model designed, endpoints not wired
- Local (run-scoped) variables — no request-scoped map in runner
- Full scope resolver: build_scope_chain() + get_collection_variables() walk-to-root
- Dynamic variable tokens: full catalog (`{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$guid}}`, `{{$randomBoolean}}`, `{{$randomFirstName}}`, `{{$randomLastName}}`, `{{$randomFullName}}`, `{{$randomUserName}}`, `{{$randomPhoneNumber}}`, `{{$randomUrl}}`, `{{$randomIP}}`, `{{$randomFloat}}` and ~30 more)
- `/resolve/preview` endpoint — resolve text + winning scope per var
- `/node/{node_id}/variables/{key}/reveal` — secret reveal endpoint
- `/variables/global/{key}/reveal` — global secret reveal endpoint
- Variable key validation (`^[a-zA-Z0-9_-]+$`, max 255 chars)

---

## Missing (frontend)

- `CollectionVarEditor` — two-column table (key / value / secret toggle) in collection Variables tab
- `EnvironmentVarEditor` — three-column (key / initial value / current value) with Persist All / Reset All buttons
- `EnvironmentQuickLook` — eye icon top-bar widget showing active env vars inline
- `InlineVarHighlight` — CodeMirror decoration: orange (found) / red (missing) / purple (dynamic)
- `VarHoverTooltip` — resolved value + scope badge + conflict indicator on hover
- `DynamicVarAutocomplete` — `{{` trigger autocomplete with two sections: scope vars + dynamic vars
- `VarConflictBadge` — shows lower-priority scope values in tooltip
- `SecretRevealButton` — eye toggle in var editor rows

---

## Missing (design decisions deferred)

- **Data scope (5th scope)** — CSV/JSON data file per-iteration in Collection Runner; deferred to `09-collection-runner`
- **Initial vs Current value two-value model** — Postman stores two separate slots; APIPilot deferred; `current_value` in localStorage until DB schema updated; banner shown to user

---

## Research Gaps Found (deep research 2026-06-16)

Total gaps: **33** across spec, FE components, edge cases, and test matrix.
See `research.md` → "Gap Analysis" section for complete enumeration.

Key gaps that changed the spec:
1. Data scope (5th scope) — was entirely absent from spec
2. Initial vs Current value model — was missing; now documented as deferred
3. Dynamic variable catalog — spec had 3 tokens; research found 40+; priority tiers added to spec
4. Nested `{{}}` behavior — not documented; now in edge cases and test matrix
5. Variable key validation rule — not specified; now added to spec
6. FE components: 6 components were missing from spec (EnvironmentQuickLook, VarConflictBadge, SecretRevealButton, VarHoverTooltip, DynamicVarAutocomplete, EnvironmentVarEditor)
7. Secret reveal endpoints — new (2 endpoints); not in original API contracts
8. Reveal audit logging — security requirement added to reveal endpoints

---

## Current Task

Collection variable CRUD endpoints + scope chain resolver

## Next Task

Dynamic tokens (Priority 1: `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$guid}}`, `{{$randomBoolean}}`, `{{$randomFirstName}}`, `{{$randomLastName}}`, `{{$randomEmail}}`, `{{$randomInt}}`) + resolve preview endpoint

## Dependencies

- 22-security (secret encryption — done via vault.py)
- 05-environments (env scope source)
- 09-collection-runner (data scope — deferred)

## Priority

P1
