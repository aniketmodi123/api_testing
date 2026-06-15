# Test Matrix — Flows

LAST_UPDATED: 2026-06-15

## Happy Path
| ID | Scenario | Input | Expected |
|---|---|---|---|
| H1 | Create flow | graph + steps | persisted |
| H2 | 2-step chain | step1 login → extract token → step2 uses {{token}} | step2 sends token, both pass |
| H3 | Conditional branch | condition true | branch path taken |
| H4 | Delay step | delay 500ms | run waits then continues |
| H5 | Run history | GET runs | lists past runs + status |
| H6 | Step results | GET run/{id} | per-step request/response |

## Edge Cases
| ID | Trap # | Scenario | Expected |
|---|---|---|---|
| E1 | 1 | cyclic graph on save | rejected (DAG validation) |
| E2 | 2 | step fails | run marked failed at step, results captured |
| E3 | 3 | jsonpath no match | var unresolved, flagged |
| E4 | 5 | secret in context | masked in step results |
| E5 | 6 | two concurrent runs | independent contexts |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | viewer runs flow | 403 |
| X2 | run non-existent flow | 206 not found |
| X3 | step target internal IP | SSRF blocked (phase_0) |
| X4 | max-steps exceeded | run aborts safely |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | execute_direct single send | unchanged after refactor to shared fn |
| R2 | run_case / bulk_run | unchanged |
| R3 | variable + auth resolution | reused identically in flow steps |
