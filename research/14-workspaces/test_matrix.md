# Test Matrix — Workspaces

LAST_UPDATED: 2026-06-16

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Create workspace | Persisted, owner role assigned |
| H2 | Invite member | Email sent, 7-day token created |
| H3 | Accept invite | WorkspaceMember row created |
| H4 | Role-based access | Viewer blocked from write endpoint |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | `can_access_workspace` gate | All new endpoints use it correctly |
| R2 | Member invite flow | Unchanged |
