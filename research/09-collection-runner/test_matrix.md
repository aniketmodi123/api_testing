# Test Matrix — Collection Runner

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Bulk run N cases | All results persisted |
| H2 | Scheduled run fires | Execution created, results stored |
| H3 | Alert on failure | Email/webhook fires |
| H4 | Partial pass | Execution status = "partial" |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Auth injected per case | Unchanged after auth_strategies changes |
| R2 | Variable resolution per case | Unchanged after scope chain changes |
| R3 | Result snapshot stored | Unchanged |
