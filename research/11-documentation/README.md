# 11 — Documentation + Publishing

Status: Partial
Coverage: 40%

## Implemented (backend)
- `PublishedDoc` model
- `POST /node/{id}/docs/generate` — walk subtree → render doc model → upsert
- `POST /node/{id}/docs/publish` — set public_token (admin)
- `DELETE /node/{id}/docs/publish` — revoke token
- `GET /docs/{public_token}` — public read (no auth), no secrets rendered

## Missing
- FE DocGenerateView (trigger generate + show stats)
- FE PublicDocPage (render doc JSON as readable page)
- `GET /docs` list endpoint (list published docs in workspace)

## Current Task
None (backend done)

## Next Task
FE DocGenerateView

## Dependencies
- 23-governance (RBAC for publish — admin gate already in place)
- 07-collections (node tree walk — done)

## Priority
P2
