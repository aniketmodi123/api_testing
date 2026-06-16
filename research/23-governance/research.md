# Research — Governance

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_13_governance/spec.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/governance/rules.py` | All 5 endpoints + rule engine |
| `backend/src/routers/governance/__init__.py` | Package init |
| `backend/src/models.py` | `GovernanceRule` model |

## GovernanceRule Model
```
GovernanceRule
  id
  workspace_id    FK → workspaces CASCADE
  name            varchar(255)
  rule_type       varchar(50)  CHECK IN ('naming','required_field','status_code')
  target          varchar(100) CHECK IN ('path','name','header','param')
  value           text  — regex (naming) or field name / status code string
  enabled         bool default True
  created_at      datetime
```
Index: `ix_governance_rule_workspace` on `workspace_id`.

## Rule Engine Logic
| rule_type | target | Evaluation |
|---|---|---|
| naming | path | `re.search(value, api.endpoint)` |
| naming | name | `re.search(value, api.name)` |
| required_field | header | Any ApiCase for this Api has `headers[value]` set |
| required_field | param | Any ApiCase has `params[value]` set |
| status_code | (any) | Any ApiCase has `expected.status_code == value` |

## Lint Response Shape
```json
{
  "total_apis": 12,
  "violations_count": 3,
  "violations": [
    {"api_id": 5, "api_name": "...", "endpoint": "...", "rule_id": 2, "rule_name": "...", "message": "..."}
  ]
}
```

## Gotchas
- One query loads all cases for all apis → avoids N+1; empty api_ids list guarded with early return
- Lint only checks active APIs (inactive excluded same as bulk runner)
