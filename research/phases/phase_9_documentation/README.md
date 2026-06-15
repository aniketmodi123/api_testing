# Phase 9 — Documentation + Publishing

**Status:** not-started (stub)
**Phase:** 9
**Depends on:** Phase 2 (audit/RBAC for publish)
**Estimated scope:** full-stack · M

## What the user sees
Auto-generated, shareable docs for a collection — endpoints, params, example requests/responses
(reuse saved cases as examples). Publish to a public read-only page via token.

## Deliverables
- [ ] `published_docs` table (node-scoped, public_token nullable)
- [ ] `POST /node/{id}/docs/generate` render collection → doc model
- [ ] `POST /node/{id}/docs/publish` (admin) → public_token
- [ ] `GET /docs/{public_token}` (public, no secrets rendered)
- [ ] FE DocGenerateView + public PublicDocPage
- [ ] Tests: no secret rendered, public access works

## Tasks → Subtasks (this is a STUB — do T0 first)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root docs
- [ ] T1 `published_docs` model + migration
- [ ] T2 `POST /node/{id}/docs/generate` render collection → doc model
- [ ] T3 `POST /node/{id}/docs/publish` (admin) → public_token
- [ ] T4 `GET /docs/{public_token}` public (no secrets rendered)
- [ ] T5 FE DocGenerateView + public PublicDocPage
- [ ] T6 Tests: no secret leak, public access

## Reuse
`Api.description` + `ApiCase` (examples), markdown render, public-route handling.

## Definition of Done
Generate + publish docs; public page renders collection; zero secret values leak into output.
