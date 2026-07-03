# Test Matrix — Mock Servers

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_8_mock_servers/README.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Create server + route | Persisted |
| H2 | Public serve — exact path match | Route response returned |
| H3 | Public serve — template path `{id}` | Matches `/api/users/42` |
| H4 | Priority — two matching routes | Highest priority wins |
| H5 | Create route from history | Route created with response from snapshot |
| H6 | Dynamic body `{{$uuid}}` | UUID substituted in response |
| H7 | Delay configured | Response delayed by delay_ms |

## Edge Cases
| ID | Scenario | Expected |
|---|---|---|
| E1 | Disabled server | 503 |
| E2 | No matching route | 404 |
| E3 | Rate limit exceeded | 429 |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Bad public_token | 404 |
| X2 | Route from history copies auth header | MUST NOT happen |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | `/m/` prefix public (no auth) | security.py exemption intact |
| R2 | `resolve_variables` dynamic tokens | Unchanged |
