# Test Matrix — OpenAPI Specs + Contract Testing + Regression Diff

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_6_openapi_specs/README.md + phases/phase_7_contract_testing/README.md

## Happy Path
| ID | Scenario | Expected |
|---|---|---|
| H1 | Import OpenAPI 3.0 spec | Nodes/apis/cases created from paths |
| H2 | Import Swagger 2.0 spec | Same result (normalized) |
| H3 | Export collection → OpenAPI | Valid 3.0.3 JSON |
| H4 | cURL → request | Correct method/headers/body |
| H5 | Request → cURL | Valid cURL string |
| H6 | Contract test — matching schema | 0 violations |
| H7 | Contract test — schema mismatch | Violations list with path + message |
| H8 | Regression diff — no changes | 0 changes |
| H9 | Regression diff — field changed | Changed field in diff output |

## Edge Cases
| ID | Scenario | Expected |
|---|---|---|
| E1 | External `$ref` URL in spec | 400 — SSRF blocked |
| E2 | Circular `$ref` | 400 — max-depth exceeded |
| E3 | Idempotent re-import | No duplicate nodes (name-dedup suffix) |
| E4 | Contract: Api not in workspace | Skip, add to unmatched list |
| E5 | Diff: case in base not compare | Marked "removed" |
| E6 | Diff: non-JSON response body | Diff as raw string equality |

## Error Cases
| ID | Scenario | Expected |
|---|---|---|
| X1 | Malformed YAML/JSON spec | 400 with parse error |
| X2 | >500 paths in spec | 400 with limit message |
| X3 | cURL with -d @filename | 400 — file-based body not supported |

## Regression
| ID | Existing feature | Must still work |
|---|---|---|
| R1 | bulk_import node creation | Unchanged (spec import reuses it) |
| R2 | validator.py jsonschema | Unchanged |
| R3 | BulkTestResult storage | Unchanged (diff reads it) |
