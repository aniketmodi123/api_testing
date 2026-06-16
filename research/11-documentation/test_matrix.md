# Test Matrix — Documentation + Publishing

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_9_documentation/README.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Generate docs for collection | PublishedDoc created, api_count + case_count returned |
| H2 | Publish docs (admin) | public_token returned |
| H3 | Public read GET /docs/{token} | Doc JSON returned, no auth required |
| H4 | Revoke publish | GET /docs/{token} → 404 |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Non-admin tries to publish | 403 |
| X2 | GET /docs/{bad_token} | 404 |
| X3 | Doc contains ApiCase headers | MUST NOT be in response |
| X4 | Doc contains plaintext secrets | MUST NOT appear (cases store var references, not values) |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Node tree walk | Unchanged (BFS same as monitor/mock) |
