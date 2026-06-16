# Spec — Governance

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_13_governance/spec.md

## Goal
Org-level API linting: define rules per workspace (admin), lint active APIs, get violations report.

## Backend (shipped)

### Endpoints
```
GET  /workspace/{id}/governance/rules      viewer+   list all rules
POST /workspace/{id}/governance/rules      admin     create rule
PUT  /governance/rules/{id}               admin     update rule
DELETE /governance/rules/{id}             admin     delete rule
POST /workspace/{id}/governance/lint      viewer+   run lint → violations report
```

## Frontend (missing)
| Component | Purpose |
|---|---|
| GovernanceRules | Admin editor for ruleset |
| LintReport | Violations list with API + rule details |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Rules per workspace | Not global | Different teams have different standards |
| 2 | Admin-only writes | Same RBAC as monitor/mock | Lint rules are org policy |
| 3 | Lint is ephemeral | Not stored | Same as contract testing; saves a table |
| 4 | Lint only active APIs | Inactive excluded | Same as bulk runner |
