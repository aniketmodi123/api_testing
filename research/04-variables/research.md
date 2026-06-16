# Research — Variables

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_4_variable_scopes/research.md + phases/phase_1_secrets_vault/research.md + deep Postman docs research (training knowledge, cutoff Aug 2025)
CANONICAL DOCS: https://learning.postman.com/docs/sending-requests/variables/variables/
                https://learning.postman.com/docs/sending-requests/variables/variable-scopes/
                https://learning.postman.com/docs/writing-scripts/script-references/variables-list/
                https://learning.postman.com/docs/sending-requests/variables/managing-environments/

> FLAG: Postman has been actively evolving its Variables UI since mid-2024 (Flows integration,
> variable debugging panel). Anything labelled [POST-AUG-2025-UNCERTAIN] may have changed.

---

## Existing Code to Reuse

| File | Function/Component | How to use |
|---|---|---|
| `backend/src/utils.py` | `resolve_variables(data, variables, ts)` | Extend to take merged 4-scope map + dynamic tokens; keep signature back-compatible |
| `backend/src/common_querys.py` | `get_workspace_variables` (env), `get_folder_path_to_root` | Env scope + walk pattern for collection vars |
| `backend/src/routers/variables/global_variables.py` | `get_global_variables_for_user` | Global scope source; encrypt on upsert when `is_secret` |
| `backend/src/routers/environment/resolve_variables.py` | Existing resolve endpoint | Base for `/resolve/preview` |
| `backend/src/vault.py` | `encrypt()`, `decrypt()`, `is_ciphertext()` | Secret collection vars |
| `frontend/src/` | CodeMirror editors (RequestPanel) | Attach inline highlight decoration for `{{var}}` |

---

## Models

- `GlobalVariable` — `backend/src/models.py`: `id, username(idx), key, value, is_secret`
- `Environment` — `backend/src/models.py`: `variables` JSON field, `workspace_id`
- `CollectionVariable` — needs: `id, node_id(FK), key, value(enc if secret), is_secret`; unique(node_id, key)

---

## Patterns

```python
# Walk-to-root pattern (reuse for collection vars):
folder_ids = await get_folder_path_to_root(db, file_id)   # leaf→root
# collect vars per folder, child overrides parent (like merge_headers_with_priority)

# resolve_variables currently: {{VAR}} + ${ts}. Extend dynamic tokens:
# {{$uuid}} {{$randomInt}} {{$randomEmail}} evaluated at resolve time

# Current masking (global_variables.py) — keep masking, add encryption underneath:
"value": "***" if r.is_secret else r.value          # list response: unchanged
# write path becomes:
existing.value = vault.encrypt(item.value) if item.is_secret else item.value
# runner read path:
raw = vault.decrypt(r.value) if r.is_secret else r.value
```

---

## API Contracts (existing)

| Endpoint | Input | Output | Notes |
|---|---|---|---|
| GET `/variables/global` | — | values masked `***` | unchanged |
| POST `/variables/global` | `items{value,is_secret}` | ok | encrypts secret values |
| `/environment/resolve*` | keys | resolved values | decrypts secrets internally |

---

## New Endpoints Needed

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/node/{node_id}/variables` | viewer | List collection vars |
| PUT | `/node/{node_id}/variables` | editor | Bulk upsert |
| DELETE | `/node/{node_id}/variables/{key}` | editor | Delete |
| GET | `/resolve/preview` | viewer | Resolve text + winning scope per var |

---

## Full Variable Scope Model (Postman Reference)

### The 5 Scopes (Postman has 5, APIPilot spec currently covers 4)

Postman defines **5** scopes (APIPilot currently specifies 4 — Data scope is missing from spec):

| Scope | Postman name | Lifetime | Persisted? | Shared? |
|---|---|---|---|---|
| Data | Data Variables | Collection Runner iteration | No | No |
| Local | Local Variables | Single request/pre-request script | No | No |
| Environment | Environment Variables | While env is active | Yes (server) | Yes (team) |
| Collection | Collection Variables | Entire collection | Yes (server) | Yes (team) |
| Global | Global Variables | Workspace-wide | Yes (server) | Yes (team) |

**Scope resolution chain (highest → lowest priority):**
```
Data > Local > Environment > Collection > Global
```

APIPilot's current spec says `local > env > collection > global` — this is correct for the 4-scope model.
To add Data scope, a CSV/JSON file upload flow to the Collection Runner is required (separate feature).

---

### Scope Details

#### Global Scope
- Workspace-wide; all collections and environments in the workspace can read globals.
- Set via UI (Environment → Globals) or scripting via `pm.globals.set(key, value)`.
- Persisted to Postman servers; visible and editable by all workspace members.
- Two values per variable: **Initial Value** (synced, visible to team) and **Current Value** (local only, runtime).
- Best for: base URLs shared across all collections, workspace-wide toggles.
- Anti-pattern: never store secrets in global Initial Value (synced to server, visible to team).

#### Collection Scope
- Scoped to a single collection; variables travel with the collection on export/import.
- Set via collection editor (Variables tab) or `pm.collectionVariables.set(key, value)`.
- Two values: Initial Value (synced with collection) and Current Value (local only).
- Inheritance in Postman: collection-level only — NOT folder-level in Postman itself.
  > **APIPilot deviation**: APIPilot extends this to per-folder (node subtree walk). This is a
  > differentiator vs Postman. Decision #1 in spec.md is correct. Document this clearly in UI.
- Best for: collection-specific base URLs, auth tokens scoped to one collection.

#### Environment Scope
- Only the **currently active** environment's variables are in scope.
- Switching environments swaps the entire env variable set.
- Set via Environment editor or `pm.environment.set(key, value)`.
- Two values: Initial Value (synced) and Current Value (local/runtime).
- Best for: per-environment configs (dev/staging/prod base URLs, API keys).
- `pm.environment.get(key)` reads from active environment only.

#### Local Scope
- Lives only for the duration of the pre-request script or test script that sets it.
- Set via `pm.variables.set(key, value)`.
- Not persisted anywhere; gone when the script finishes.
- Highest priority in the 4-scope chain (excluding Data).
- Best for: computed intermediate values, one-time tokens in a request.

#### Data Scope (missing from APIPilot spec — gap)
- Provided by a CSV or JSON data file uploaded to the Collection Runner.
- Each runner iteration reads one row (CSV) or one object (JSON) from the data file.
- Read only via `pm.iterationData.get(key)`.
- Highest priority of all 5 scopes — overrides local, env, collection, global.
- Variables from data file are available in request body/URL/headers as `{{variableName}}`.
- Data variables are NOT settable — they are read-only from the file.
- Available only during Collection Runner execution — not in single-request mode.
- APIPilot impact: implement when building the full Collection Runner with data-driven testing.
  Mark as deferred until Collection Runner (09-collection-runner) is built.

---

## Initial Value vs Current Value (Critical Distinction)

This is one of the most important and most misunderstood aspects of Postman variables.

### How it works in Postman
Every persisted variable (global, collection, environment) has **two separate value slots**:

| Slot | Name | Synced to server? | Visible to team? | Used at runtime? |
|---|---|---|---|---|
| Initial Value | "initial value" | YES | YES | No (only default) |
| Current Value | "current value" | NO | NO (local only) | YES |

- When you **share** a collection or environment, only Initial Values travel with it.
- When you **run** a request, the Current Value is used. If Current Value is empty, Initial Value is the fallback.
- Setting a variable via script (`pm.environment.set(...)`) updates the **Current Value only**.
- Resetting to initial: Postman provides a "Reset All" button in environment editor — copies Initial → Current.

### Security implication
- Secrets (tokens, passwords, API keys) should go in **Current Value only** — they are never synced.
- If a secret is put in Initial Value, it is synced to Postman's servers and visible to all workspace members.
- Postman shows a warning icon when a variable that looks like a secret (contains "token", "key", "password" in name) has a non-empty Initial Value.

### APIPilot mapping
APIPilot currently has `is_secret` flag but only one value column. To match Postman fully:
- `initial_value` — stored plaintext (or encrypted if secret), synced/shared
- `current_value` — stored locally per user, never leaves the client

> This is a significant schema change. Current spec stores one value. Two-value model requires
> either a new column or a separate `user_variable_overrides` table keyed on (variable_id, username).
> Recommendation: defer full two-value model to a later iteration; for now, treat stored value as
> Initial Value and note that Current Value = Initial Value (no per-user override yet).
> Flag this limitation prominently in the UI.

---

## Dynamic Variables (Full Catalog)

Postman calls these "dynamic variables" — prefixed with `$` in `{{$name}}` syntax.
They are evaluated at request-send time, not stored anywhere.

### Currently in APIPilot spec
| Token | Output |
|---|---|
| `${ts}` | Unix timestamp (existing, non-standard syntax) |
| `{{$uuid}}` | UUID4 string |
| `{{$randomInt}}` | Random int 1–1000 |
| `{{$randomEmail}}` | Random email string |

### Full Postman Dynamic Variable Catalog (missing from spec)

#### Timestamp / ID
| Variable | Description | Example |
|---|---|---|
| `{{$guid}}` | UUID v4 | `"110d2345-1b60-4c7c-b174-..."` |
| `{{$timestamp}}` | Current Unix timestamp (seconds) | `1718300000` |
| `{{$isoTimestamp}}` | ISO 8601 UTC timestamp | `"2024-06-13T12:00:00.000Z"` |
| `{{$randomUUID}}` | UUID v4 (alias for $guid) | same format |

> NOTE: APIPilot uses `${ts}` (dollar-brace syntax) for timestamp — this differs from Postman's
> `{{$timestamp}}` double-brace syntax. Both should be supported. The `${ts}` is legacy; add
> `{{$timestamp}}` and `{{$isoTimestamp}}` as the canonical forms.

#### Integer / Number
| Variable | Description | Range |
|---|---|---|
| `{{$randomInt}}` | Random integer | 0–1000 |
| `{{$randomFloat}}` | Random float | 0.0–1.0 (2 decimal places) |
| `{{$randomPrice}}` | Random price | 10.00–999.00 |

#### Boolean
| Variable | Description |
|---|---|
| `{{$randomBoolean}}` | `true` or `false` |

#### Text / String
| Variable | Description |
|---|---|
| `{{$randomAlphaNumeric}}` | Single alphanumeric char |
| `{{$randomWord}}` | Random English word |
| `{{$randomWords}}` | 1–5 random English words |
| `{{$randomLocale}}` | Random locale code (e.g. `en`, `fr`) |

#### Name
| Variable | Description |
|---|---|
| `{{$randomFirstName}}` | Random first name |
| `{{$randomLastName}}` | Random last name |
| `{{$randomFullName}}` | Random full name |
| `{{$randomNamePrefix}}` | Mr., Mrs., Dr., etc. |
| `{{$randomNameSuffix}}` | Jr., Sr., etc. |

#### Internet / Contact
| Variable | Description |
|---|---|
| `{{$randomEmail}}` | Random email address |
| `{{$randomExampleEmail}}` | Email with @example.com domain |
| `{{$randomUserName}}` | Random username (no special chars) |
| `{{$randomUrl}}` | Random URL |
| `{{$randomDomainName}}` | Random domain name |
| `{{$randomDomainSuffix}}` | .com, .net, .org, etc. |
| `{{$randomDomainWord}}` | Domain word without TLD |
| `{{$randomIP}}` | Random IPv4 address |
| `{{$randomIPV6}}` | Random IPv6 address |
| `{{$randomMACAddress}}` | Random MAC address |
| `{{$randomPassword}}` | Random password string |
| `{{$randomUserAgent}}` | Random browser user agent string |
| `{{$randomProtocol}}` | `http` or `https` |
| `{{$randomSemver}}` | Random semantic version string |

#### Address / Location
| Variable | Description |
|---|---|
| `{{$randomCity}}` | Random city name |
| `{{$randomStreetName}}` | Random street name |
| `{{$randomStreetAddress}}` | Full street address |
| `{{$randomCountry}}` | Random country name |
| `{{$randomCountryCode}}` | 2-letter ISO country code |
| `{{$randomLatitude}}` | Random latitude (-90 to 90) |
| `{{$randomLongitude}}` | Random longitude (-180 to 180) |
| `{{$randomZipCode}}` | Random ZIP/postal code |
| `{{$randomTimeZone}}` | Random timezone (e.g. "America/New_York") |

#### Phone / Finance
| Variable | Description |
|---|---|
| `{{$randomPhoneNumber}}` | Random phone number |
| `{{$randomPhoneNumberExt}}` | Phone number with extension |
| `{{$randomBankAccount}}` | Random 8-digit bank account number |
| `{{$randomBankAccountName}}` | Random bank account type name |
| `{{$randomCreditCardMask}}` | Masked CC number (e.g. `3622-****-****-4852`) |
| `{{$randomBankAccountIban}}` | Random IBAN |
| `{{$randomBankAccountBic}}` | Random BIC/SWIFT code |
| `{{$randomCurrencyCode}}` | 3-letter currency code |
| `{{$randomCurrencyName}}` | Currency name |
| `{{$randomCurrencySymbol}}` | Currency symbol |
| `{{$randomBitcoin}}` | Bitcoin wallet address |
| `{{$randomTransactionType}}` | payment, deposit, withdrawal, etc. |

#### Company / Business
| Variable | Description |
|---|---|
| `{{$randomCompanyName}}` | Random company name |
| `{{$randomCompanySuffix}}` | Inc., LLC, Ltd., etc. |
| `{{$randomBs}}` | Random business buzzword phrase |
| `{{$randomCatchPhrase}}` | Random marketing phrase |
| `{{$randomDepartment}}` | Random department name |
| `{{$randomJobTitle}}` | Random job title |
| `{{$randomJobDescriptor}}` | Random job descriptor adjective |
| `{{$randomJobArea}}` | Random job area |
| `{{$randomJobType}}` | Random job type |

#### Color / Image / File
| Variable | Description |
|---|---|
| `{{$randomAbbreviation}}` | Random abbreviation |
| `{{$randomAdjective}}` | Random adjective |
| `{{$randomNoun}}` | Random noun |
| `{{$randomVerb}}` | Random verb |
| `{{$randomIngverb}}` | Random gerund verb |
| `{{$randomPhrase}}` | Random phrase |
| `{{$randomHexColor}}` | Random hex color code |
| `{{$randomRGB}}` | Random RGB color string |
| `{{$randomAvatarImage}}` | Random avatar image URL |
| `{{$randomImageUrl}}` | Random image URL |
| `{{$randomImageDataUri}}` | Random image as data URI |
| `{{$randomAbstractImage}}` | Random abstract image URL |
| `{{$randomAnimalsImage}}` | Random animals image URL |
| `{{$randomBusinessImage}}` | Random business image URL |
| `{{$randomCityImage}}` | Random city image URL |
| `{{$randomFoodImage}}` | Random food image URL |
| `{{$randomNightlifeImage}}` | Random nightlife image URL |
| `{{$randomNatureImage}}` | Random nature image URL |
| `{{$randomFashionImage}}` | Random fashion image URL |
| `{{$randomPeopleImage}}` | Random people image URL |
| `{{$randomSportsImage}}` | Random sports image URL |
| `{{$randomTechImage}}` | Random tech image URL |
| `{{$randomTransportImage}}` | Random transport image URL |
| `{{$randomFileName}}` | Random filename with extension |
| `{{$randomFileType}}` | Random file type (mime) |
| `{{$randomFileExtension}}` | Random file extension |
| `{{$randomCommonFileName}}` | Common filename |
| `{{$randomCommonFileType}}` | Common file type |
| `{{$randomCommonFileExtension}}` | Common file extension |
| `{{$randomMimeType}}` | Random MIME type |
| `{{$randomDirectoryPath}}` | Random directory path |
| `{{$randomFilePath}}` | Random full file path |

#### Lorem / Content
| Variable | Description |
|---|---|
| `{{$randomLoremWord}}` | Single lorem ipsum word |
| `{{$randomLoremWords}}` | A few lorem ipsum words |
| `{{$randomLoremSentence}}` | A lorem ipsum sentence |
| `{{$randomLoremSentences}}` | 2–6 lorem ipsum sentences |
| `{{$randomLoremParagraph}}` | A lorem ipsum paragraph |
| `{{$randomLoremParagraphs}}` | 3 lorem ipsum paragraphs |
| `{{$randomLoremText}}` | Random lorem text |
| `{{$randomLoremSlug}}` | Random lorem slug |
| `{{$randomLoremLines}}` | 1–5 lorem ipsum lines |

> IMPLEMENTATION NOTE: Postman implements dynamic variables using the Faker.js library under the
> hood. APIPilot Python backend should use the `Faker` Python library (pip: `faker`) to generate
> the same categories. Not every Faker.js provider has an exact Python Faker equivalent — use the
> closest match and document any deviations. Priority order for implementation: guid/timestamp
> first, then name/email/int, then finance/address, then lorem/image last.

---

## pm.* Scripting API (Postman reference)

### Global Variables
```javascript
pm.globals.get("variableName")           // read
pm.globals.set("variableName", value)    // write (updates current value)
pm.globals.unset("variableName")         // delete
pm.globals.clear()                       // delete all globals
pm.globals.has("variableName")           // boolean check
pm.globals.toObject()                    // all globals as plain object
```

### Collection Variables
```javascript
pm.collectionVariables.get("variableName")
pm.collectionVariables.set("variableName", value)
pm.collectionVariables.unset("variableName")
pm.collectionVariables.clear()
pm.collectionVariables.has("variableName")
pm.collectionVariables.toObject()
```

### Environment Variables
```javascript
pm.environment.get("variableName")
pm.environment.set("variableName", value)
pm.environment.unset("variableName")
pm.environment.clear()
pm.environment.has("variableName")
pm.environment.name                      // active environment name
pm.environment.toObject()
```

### Scope-chain Read (resolves via precedence)
```javascript
pm.variables.get("variableName")         // reads from highest-priority scope that has key
pm.variables.set("variableName", value)  // sets in LOCAL scope only
pm.variables.has("variableName")
pm.variables.toObject()                  // merged view of all scopes
pm.variables.replaceIn("{{var}} text")   // resolves {{}} in a string
```

### Data / Iteration Variables
```javascript
pm.iterationData.get("variableName")     // read data file row value
pm.iterationData.has("variableName")
pm.iterationData.toObject()              // current iteration's full row
```

> APIPilot scripting impact: APIPilot currently supports pre-request scripts that modify
> the request context. If/when scripting is added (separate feature), these pm.* namespaces
> need to be emulated in the sandbox. The scope-chain write semantics matter: pm.variables.set
> writes to LOCAL scope; pm.environment.set writes to ENV scope (and persists for the session).

---

## Variable Referencing Syntax

### Standard syntax
```
{{variableName}}
```
Used in:
- URL: `https://{{baseUrl}}/api/{{version}}/users`
- Path segments: `/users/{{userId}}`
- Query params (value field): `?limit={{pageSize}}`
- Headers (both key and value): `Authorization: Bearer {{authToken}}`
- Request body (any content type): `{"name": "{{$randomFirstName}}"}`
- Pre-request scripts and test scripts (via pm.variables.replaceIn)

### Dynamic variable syntax
```
{{$dynamicVariableName}}
```
`$` prefix inside double-braces. Evaluated at send time, not stored.

### Nested variable syntax (NOT supported natively)
```
{{base_{{env}}}}   ← DOES NOT WORK in Postman
```
Postman does not resolve nested `{{}}` references. The outer `{{` and inner `{{` create ambiguity.
Workaround: use pre-request script to build the key dynamically:
```javascript
const env = pm.globals.get("env");
const baseUrl = pm.globals.get("base_" + env);
pm.variables.set("resolvedBase", baseUrl);
```
Then use `{{resolvedBase}}` in the URL.

APIPilot resolver must match this behavior — nested `{{}}` should be left unresolved or flagged.

---

## Variable Highlighting in Postman UI

Postman editor shows color-coded highlighting for `{{variableName}}` tokens:

| Color | Meaning |
|---|---|
| Orange (amber) | Variable found in the active scope chain |
| Red | Variable not found in any scope (unresolved) |
| Purple/grey | Dynamic variable (`{{$...}}`) — always valid |

Behavior:
- Highlights appear in URL bar, header value fields, query param value fields, and body editor.
- Hover over a highlighted variable → tooltip showing resolved value + which scope it came from.
- If variable is secret (`is_secret`), tooltip shows `***` for the value.
- Color updates live as the user types or switches environments.
- In body JSON editor, `{{var}}` inside a string is highlighted within the string context.

---

## Postman UI Components (reference for APIPilot FE spec)

### 1. Environment Quick Look (eye icon)
- Top-right corner of Postman, always visible.
- Click → dropdown showing active environment name + all variables with current values.
- Allows inline editing of current value without opening the full environment editor.
- Secret variables show `***` in the dropdown; clicking the eye icon next to a secret var reveals it locally.
- "Edit" button opens the full environment editor.

### 2. Environment Editor (full panel)
- Two-column table: Variable / Initial Value / Current Value / Type.
- Toggle column visibility.
- "Add" button appends a new row.
- Checkbox to select rows for bulk delete.
- "Persist All" button: copies all Current Values → Initial Values (syncs to server).
- "Reset All" button: copies all Initial Values → Current Values (discards local changes).
- Type column: `default` or `secret` (toggles masking).
- Secret type: Current Value field shows `***` with reveal button.

### 3. Collection Variables Tab
- Accessible via collection editor → Variables tab.
- Same two-column layout as Environment Editor (Initial / Current).
- Variables scope is the entire collection.
- No environment switcher — always collection-level.

### 4. Variable Scope Panel (Postman's "Variables" sidebar)
[POST-AUG-2025-UNCERTAIN: Postman may have reorganized the variable sidebar UI]
- Postman doesn't have a distinct "Variable Scope Panel" as a named component.
- Variable visibility is handled through the eye icon (env quick look) + collection/env editors.
- A merged "all variables" view may be accessible via the Postman console or variable debugging.

### 5. Inline Variable Preview (hover tooltip)
- Hovering over an orange `{{varName}}` in the URL bar or body shows a tooltip.
- Tooltip contains: resolved value + scope badge (Global / Collection / Environment / Local).
- For secrets: value is masked as `***`; tooltip shows scope badge only.

### 6. Autocomplete in `{{}}` context
- Typing `{{` in any field triggers an autocomplete dropdown.
- Dropdown lists all variables in scope (merged view, highest priority first).
- Dynamic variables (`$guid`, `$randomEmail`, etc.) appear in a separate "Dynamic Variables" section.
- Selecting from autocomplete inserts `{{variableName}}` or `{{$dynamicVar}}`.
- Variables not found in scope are grayed out with a "not found" indicator.

### 7. Variable Conflict Indicator
- When the same key exists in multiple scopes, Postman shows the winning value in the tooltip.
- Lower-priority scopes' values are shown below the winning value (grayed out).
- This allows the user to see why a particular value is being used.

---

## Edge Cases and Gotchas

### 1. Empty string vs undefined
- `pm.environment.set("key", "")` sets the variable to empty string — this IS defined.
- A key that was never set is undefined.
- `{{varName}}` where `varName` is set to `""` → resolves to empty string (not literal `{{varName}}`).
- `{{varName}}` where `varName` is undefined → remains as literal `{{varName}}` (Postman behavior).
- APIPilot should match: undefined = leave literal; empty string = replace with empty string.

### 2. Variable in variable (nested) — not supported
See "Nested variable syntax" above. Resolver must not recurse on `{{}}` matches.

### 3. JSON body variable substitution
- In a JSON body like `{"count": {{itemCount}}}`, the `{{itemCount}}` is replaced as a string first.
- If `itemCount = 5`, result is `{"count": 5}` — the number is unquoted, valid JSON.
- If `itemCount = "hello"`, result is `{"count": hello}` — INVALID JSON unless the template was `{"count": "{{itemCount}}"}`.
- This means variable substitution happens on raw text before JSON parsing.
- APIPilot must do the same: resolve variables on the raw body string, not on parsed JSON.

### 4. `Content-Type: application/json` with dynamic variables
- `{{$randomInt}}` in a JSON body: resolved to a number string, e.g. `42`.
- If the template is `{"qty": {{$randomInt}}}` → `{"qty": 42}` — valid JSON.
- If the template is `{"name": "{{$randomFirstName}}"}` → `{"name": "Alice"}` — valid JSON.

### 5. Pre-request script execution order
In Postman, the execution order per request is:
1. Collection pre-request script
2. Folder pre-request script
3. Request pre-request script
4. Request send
5. Request test script
6. Folder test script
7. Collection test script

Variables set in step 1 are available in steps 2-7. Variables set in step 3 are available for
the request (step 4) and the test scripts (steps 5-7) but NOT for the collection/folder scripts.

### 6. Collection Runner — variable persistence across iterations
- Variables set via `pm.environment.set()` in iteration 1 persist to iteration 2 (same runner session).
- Variables set via `pm.variables.set()` (local scope) do NOT persist across iterations.
- Data scope variables change per iteration (new CSV row).
- This is important for "chained" collection runs where one request sets a token for the next.

### 7. Variable names with special characters
- Postman variable names should be alphanumeric + underscore + hyphen only.
- Spaces and special chars in variable names are technically stored but cause issues in `{{}}` resolution.
- APIPilot validation: enforce `[a-zA-Z0-9_-]+` pattern for variable key names.

### 8. Variable value types
- Postman stores all variable values as strings internally.
- Numbers, booleans, objects set via `pm.globals.set("key", 42)` are coerced to string.
- Exception: `pm.iterationData.get()` preserves the JSON type from the data file.
- APIPilot should store values as TEXT in DB; JSON body substitution happens on raw string.

### 9. Case sensitivity
- Variable names are case-sensitive: `{{baseUrl}}` ≠ `{{BaseUrl}}`.
- Dynamic variable names are case-sensitive: `{{$guid}}` ≠ `{{$GUID}}`.

### 10. Variable resolution in URL path vs query string
- Both URL path and query string values support `{{}}` substitution.
- Query string key names do NOT support `{{}}` (only values).
- Header keys do NOT support `{{}}` in Postman (only values).
- [POST-AUG-2025-UNCERTAIN: header key support may have been added]

---

## Gap Analysis (vs current APIPilot spec)

### Missing from spec.md
1. **Data scope** — 5th scope entirely absent; mark as deferred (needs Collection Runner)
2. **Initial vs Current value model** — spec has single `value` column; two-value model not designed
3. **Full dynamic variable catalog** — spec has 3 dynamic vars; Postman has 40+
4. **`{{$timestamp}}` and `{{$isoTimestamp}}`** — the canonical timestamp tokens; spec only has `${ts}` (legacy)
5. **`{{$randomBoolean}}`** — missing from spec
6. **`{{$randomFloat}}`, `{{$randomPrice}}`** — missing
7. **All name/address/finance/lorem dynamic vars** — entirely missing from spec
8. **Nested `{{}}` edge case** — not documented in spec (must leave unresolved, not recurse)
9. **Variable key validation rule** — `[a-zA-Z0-9_-]+` not specified
10. **Variable value type coercion** — all values are strings; not documented
11. **pm.* scripting API namespaces** — not in spec (relevant when scripting feature is built)
12. **Collection Runner variable persistence across iterations** — not documented
13. **Variable highlighting color semantics** — orange/red/purple not specified for FE

### Missing from spec.md FE section
14. **Environment Quick Look (eye icon) component** — not in FE components list
15. **"Persist All" / "Reset All" buttons** — not in UI spec
16. **Variable conflict indicator** (same key, multiple scopes) — not in FE spec
17. **Autocomplete dropdown** — only mentioned in passing; props/behavior not specced
18. **Scope badge in hover tooltip** — tooltip shows scope name, not documented
19. **Secret reveal button** in variable editor — not in FE spec
20. **Variable count badge** on environment/collection tab — not specced

### Missing from test_matrix.md
21. **Empty string vs undefined behavior** — not tested
22. **Nested `{{var}}` (must NOT resolve)** — not tested
23. **JSON body substitution order** (raw text, not parsed JSON) — not tested
24. **Case sensitivity** — not tested
25. **Key name validation** — not tested
26. **Variable highlighting** — orange/red for found/missing — not tested
27. **Autocomplete** — not tested
28. **Environment quick look** — not tested
29. **`{{$timestamp}}` and `{{$isoTimestamp}}`** — not tested
30. **`{{$randomBoolean}}`** — not tested
31. **Data scope (deferred)** — needs a placeholder test
32. **Variable conflict indicator** — not tested
33. **Cross-iteration persistence in Collection Runner** — not tested

Total gaps: **33**
