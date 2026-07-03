# Test Matrix — Variables

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_4_variable_scopes/test_matrix.md + phases/phase_1_secrets_vault/test_matrix.md + deep research 2026-06-16

---

## Happy Path

| ID | Scenario | Input | Expected |
|---|---|---|---|
| H1 | Collection var CRUD | upsert/list/delete | Persisted, scoped to node |
| H2 | Precedence env vs global | Key in global+env | Env value wins |
| H3 | Full 4-scope chain | Key in all 4 scopes | Local wins |
| H4 | Dynamic `{{$guid}}` | In body | Valid UUID v4 substituted |
| H5 | Preview endpoint | text + node_id | Resolved + winning scope per var |
| H6 | Secret global var save | `{key,value,is_secret:true}` | DB stores ciphertext, not plaintext |
| H7 | List secret var | GET global/collection vars | Value = `***` |
| H8 | Runner resolves secret | `{{TOKEN}}` in request | Decrypted value sent to target server |
| H9 | Enc→dec roundtrip | Any string | Identical output |
| H10 | `{{$timestamp}}` in URL | In request URL | Replaced with Unix timestamp (integer seconds) |
| H11 | `{{$isoTimestamp}}` in body | In JSON body | Replaced with ISO 8601 UTC string |
| H12 | `{{$randomEmail}}` in body | In request body | Valid email address substituted |
| H13 | `{{$randomBoolean}}` in body | In request body | `true` or `false` string substituted |
| H14 | `{{$randomFirstName}}` in body | In request body | Valid first name string substituted |
| H15 | `{{$randomInt}}` in body | `{"qty": {{$randomInt}}}` | Valid integer string; result is valid JSON |
| H16 | `${ts}` legacy token | In request URL | Still replaced with timestamp (backward compat) |
| H17 | Collection var inherits from parent folder | Var set on parent node, child request | Resolved from parent (walk-to-root) |
| H18 | Environment var wins over collection var | Same key in env + collection | Env value used |
| H19 | Global var fallback | Key only in global | Global value used |
| H20 | Empty string value var | `{{emptyVar}}` where value = `""` | Replaced with empty string (not left as literal) |
| H21 | Reveal secret global var | GET `/variables/global/{key}/reveal` | Returns decrypted plaintext to caller only |
| H22 | Reveal secret collection var | GET `/node/{id}/variables/{key}/reveal` | Returns decrypted plaintext to caller only |

---

## Edge Cases

| ID | Trap | Scenario | Expected |
|---|---|---|---|
| E1 | Nested folder same key | Two ancestor folders define same key | Deepest node (leaf-closest) wins |
| E2 | Dynamic token in url + assertion | `{{$randomInt}}` in body used twice | Two DIFFERENT random values (per-occurrence evaluation) |
| E3 | Unknown var | `{{unknownVar}}` in body | Literal `{{unknownVar}}` kept; flagged "unresolved" in preview |
| E4 | Secret collection var preview | Preview with secret var | Value masked `***`; scope badge shown |
| E5 | Flip is_secret false→true | Existing plaintext var marked secret | Value re-encrypted on save |
| E6 | Key rotation | Versioned ciphertext prefix | Old ciphertext (`v1:...`) still decryptable |
| E7 | Nested variable syntax | `{{base_{{env}}}}` in URL | Left as-is (not resolved); flagged as unparseable in preview |
| E8 | Empty string vs undefined | `{{emptyVar}}` (value = `""`) vs `{{missingVar}}` (not defined) | Empty string → replaced with `""`; undefined → literal kept |
| E9 | JSON body raw substitution order | `{"n": {{$randomInt}}}` | Substitution on raw text before JSON parse; result is valid JSON number |
| E10 | JSON body with quoted template | `{"name": "{{$randomFirstName}}"}` | Substitution inside quotes; result is valid JSON string |
| E11 | Case-sensitive key lookup | `{{baseUrl}}` and `{{BaseUrl}}` both defined | Each resolves to its own value independently |
| E12 | Dynamic var case sensitivity | `{{$guid}}` vs `{{$GUID}}` | `{{$GUID}}` is unrecognized → left as literal |
| E13 | Collection Runner iteration — env var persistence | Iteration 1 sets `pm.environment.set(k, v)` | Value available in iteration 2 |
| E14 | Collection Runner iteration — local var no-persist | Iteration 1 sets local var | NOT available in iteration 2 |
| E15 | Variable key with spaces | `key name` as variable key | Rejected at API boundary (422); not stored |
| E16 | Variable key with special chars | `key!@#` as variable key | Rejected at API boundary (422) |
| E17 | Secret in Initial Value warning | User enters secret key name with value in Initial Value field | UI shows warning: "Initial values are shared; use Current Value for secrets" |
| E18 | `{{$randomInt}}` in URL and in expected value of assertion | Two places in same request run | Two different values; assertion may fail — documented behavior |

---

## Error Cases

| ID | Scenario | Expected |
|---|---|---|
| X1 | Viewer upserts collection var | 403 Forbidden |
| X2 | Duplicate key same node | Upsert updates existing row; no duplicate created |
| X3 | Preview on node not owned | 403 Forbidden |
| X4 | `SECRET_ENC_KEY` unset in prod | Fail fast at startup (application refuses to start) |
| X5 | Decrypt corrupt ciphertext | Safe error logged with context; no value leaked; not a 500 to client |
| X6 | Any endpoint returns plaintext secret | MUST never happen — assert in tests that `***` appears in list responses |
| X7 | Variable key empty string | 422 Validation error |
| X8 | Variable key length > 255 chars | 422 Validation error |
| X9 | Variable key fails pattern `[a-zA-Z0-9_-]+` | 422 Validation error |
| X10 | node_id not found | 404 Not Found |
| X11 | Reveal endpoint — viewer role on someone else's secret | 403 Forbidden |
| X12 | Reveal endpoint — secret not found | 404 Not Found |
| X13 | Bulk upsert with duplicate keys in request body | 422 — request body must have unique keys |

---

## Highlighting & UI Tests (Frontend)

| ID | Scenario | Expected |
|---|---|---|
| U1 | `{{foundVar}}` in URL field (var in scope) | Orange highlight on token |
| U2 | `{{missingVar}}` in URL field (var not in scope) | Red highlight on token |
| U3 | `{{$guid}}` in URL field (dynamic var) | Purple/grey highlight (always valid) |
| U4 | Hover over orange `{{foundVar}}` | Tooltip shows: resolved value + scope badge |
| U5 | Hover over red `{{missingVar}}` | Tooltip shows: "Unresolved variable" message |
| U6 | Hover over `{{$guid}}` | Tooltip shows: "Dynamic variable — evaluated at request time" |
| U7 | Hover over secret var `{{TOKEN}}` | Tooltip shows scope badge + `***` (not plaintext) |
| U8 | Var conflict — same key in env + global | Tooltip shows env value (winner) + global value (grayed, loser) |
| U9 | Switch active environment | Highlights update live — previously orange vars may go red |
| U10 | Type `{{` in URL field | Autocomplete dropdown appears |
| U11 | Type `{{base` in URL field | Autocomplete filters to vars starting with "base" |
| U12 | Type `{{$rand` in URL field | Autocomplete shows dynamic var section filtered to `$rand*` |
| U13 | Select from autocomplete | `{{selectedVar}}` inserted at cursor |
| U14 | Press Escape in autocomplete | Dropdown dismissed |
| U15 | Environment Quick Look eye icon click | Dropdown shows all active env vars with current values |
| U16 | Environment Quick Look — secret var row | Value shows `***`; reveal button present |
| U17 | Environment Quick Look — reveal secret | Value revealed inline; re-click to mask |
| U18 | Var editor — toggle is_secret on row | Value field switches to password input type |
| U19 | Var editor — add new row | Empty row appended; focus on key field |
| U20 | Var editor — delete row | Row removed; changes staged; save required |

---

## Regression

| ID | Existing feature | Must still work |
|---|---|---|
| R1 | Env var resolution `{{VAR}}` | Unchanged |
| R2 | Global var resolution | Unchanged |
| R3 | `${ts}` token | Still works (legacy; alongside new `{{$timestamp}}`) |
| R4 | Runner case execution with env-only setups | Same results |
| R5 | Non-secret vars | Plaintext, searchable, unchanged |
| R6 | Existing plaintext secrets pre-migration | Runner still resolves during transition |
| R7 | RequestPanel body editor | `{{var}}` highlighting does not break existing CodeMirror setup |
| R8 | Collection header inheritance | Adding collection vars router does not break existing header walk |
| R9 | Environment list/switch | Switching env updates highlight colors and quick look dropdown |
| R10 | API runner execute flow | resolve_variables function changes are backward-compatible |

---

## Dynamic Variable Coverage Tests

| ID | Token | Scenario | Assertion |
|---|---|---|---|
| D1 | `{{$guid}}` | In request body | Output matches UUID v4 regex |
| D2 | `{{$timestamp}}` | In URL | Output is integer string (Unix seconds) |
| D3 | `{{$isoTimestamp}}` | In body | Output matches ISO 8601 UTC format |
| D4 | `{{$randomInt}}` | In body | Output is integer string in range 0–1000 |
| D5 | `{{$randomBoolean}}` | In body | Output is `"true"` or `"false"` |
| D6 | `{{$randomEmail}}` | In body | Output matches email regex |
| D7 | `{{$randomFirstName}}` | In body | Output is non-empty string |
| D8 | `{{$randomLastName}}` | In body | Output is non-empty string |
| D9 | `{{$randomFullName}}` | In body | Output contains space (first + last) |
| D10 | `{{$randomFloat}}` | In body | Output is float string |
| D11 | `{{$randomUserName}}` | In body | Output is alphanumeric string |
| D12 | `{{$randomPhoneNumber}}` | In body | Output is non-empty string |
| D13 | `{{$randomUrl}}` | In body | Output starts with `http` |
| D14 | `{{$randomIP}}` | In body | Output matches IPv4 regex |
| D15 | Unknown `{{$notARealToken}}` | In body | Left as literal `{{$notARealToken}}` |
