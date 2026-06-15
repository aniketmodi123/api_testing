# Test Matrix — Auth Helpers

LAST_UPDATED: 2026-06-15

## Happy Path
| ID | Scenario | Input | Expected |
|---|---|---|---|
| H1 | Bearer auth | config{type:bearer,token} | Authorization: Bearer <t> sent |
| H2 | API key in header | {apikey,in:header,name} | header injected |
| H3 | API key in query | {apikey,in:query} | ?name=key appended |
| H4 | Basic auth | {user,pass} | Authorization: Basic b64(user:pass) |
| H5 | OAuth2 client-cred | grant config | token fetched, cached, injected |
| H6 | AWS sigv4 | creds+region+service | valid signature header |
| H7 | JWT builder | claims+secret | signed JWT in header |
| H8 | Inherited auth | folder auth, file none | folder auth applied |

## Edge Cases
| ID | Trap # | Scenario | Expected |
|---|---|---|---|
| E1 | 1 | cached token expired | auto-refresh before send |
| E2 | 2 | folder auth + file auth | file (leaf) wins |
| E3 | 5 | auth secret in run snapshot | scrubbed |
| E4 | 4 | basic with `:`/unicode in pass | correct b64 |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | OAuth grant fails (bad creds) | safe error, no token cached |
| X2 | GET token status | returns status, never raw token |
| X3 | invalid auth type | 422 |
| X4 | OAuth token_url = internal IP | SSRF blocked (phase_0) |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | requests with manual Authorization header | still send |
| R2 | header inheritance | unchanged |
| R3 | execute-direct / run_case / bulk | all inject auth consistently |
