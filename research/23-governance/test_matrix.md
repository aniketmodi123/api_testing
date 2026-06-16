# Test Matrix — Governance

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_13_governance/README.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Create naming rule | Persisted |
| H2 | Lint: path violates naming rule | Violation in report |
| H3 | Lint: no violations | violations_count = 0 |
| H4 | Disable rule | Not evaluated in lint |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Non-admin creates rule | 403 |
| X2 | Invalid rule_type | 422 |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Api + ApiCase queries | Unchanged after governance queries added |
