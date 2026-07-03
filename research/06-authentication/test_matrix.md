# Test Matrix — Authentication (Request Auth Helpers)

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_3_auth_helpers/test_matrix.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Bearer auth | `Authorization: Bearer <t>` sent |
| H2 | API key in header | Header injected |
| H3 | API key in query | `?name=key` appended to URL |
| H4 | Basic auth | `Authorization: Basic base64(user:pass)` |
| H5 | OAuth2 client-cred | Token fetched, cached, injected |
| H6 | AWS SigV4 | Valid signature header |
| H7 | JWT builder | Signed JWT in header |
| H8 | Inherited auth | Folder auth applied when file has none |

## Edge Cases
| ID | Scenario | Expected |
|---|---|---|
| E1 | Cached OAuth token expired | Auto-refresh before send |
| E2 | Folder auth + file auth | File (leaf) wins |
| E3 | Auth secret in run snapshot | Scrubbed |
| E4 | Basic with `:` or unicode in password | Correct utf-8 b64 |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | OAuth grant fails (bad creds) | Safe error, no token cached |
| X2 | GET token status endpoint | Returns status, never raw token |
| X3 | Invalid auth type | 422 |
| X4 | OAuth token_url = internal IP | SSRF blocked |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Requests with manual Authorization header | Still sent |
| R2 | Header inheritance | Unchanged |
| R3 | execute-direct / run_case / bulk | All inject auth consistently |
