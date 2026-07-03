# Spec — Variables

STATUS: in-progress
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_4_variable_scopes/spec.md + phases/phase_1_secrets_vault/spec.md + deep research 2026-06-16

## Goal
Complete the full 4-scope variable chain (global→collection→environment→local), add dynamic tokens, a live resolution preview, and full FE variable UX. Data scope (5th, CSV/JSON) is deferred to 09-collection-runner.

---

## Backend Changes

### New Models

| Model | Fields | Notes |
|---|---|---|
| CollectionVariable | id, node_id(FK→nodes CASCADE), key, value(enc if secret), is_secret, created_at | unique(node_id,key) |

> **Schema note — Initial vs Current value**: Postman stores two value slots per variable
> (Initial = synced, Current = local). APIPilot currently stores one value (treated as Initial).
> Full two-value model is deferred. When implemented, options are: (a) add `current_value` column
> to each variable table, or (b) a separate `user_variable_overrides(variable_id, username, value)`
> table. Decision deferred; document the limitation in the UI until then.

### New Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/node/{node_id}/variables` | viewer | List collection vars (secrets masked `***`) |
| PUT | `/node/{node_id}/variables` | editor | Bulk upsert (encrypt secrets via vault.py) |
| DELETE | `/node/{node_id}/variables/{key}` | editor | Delete one var |
| GET | `/resolve/preview` | viewer | Resolve text + winning scope per var; mask secrets |

### Modified Logic

| File | Change |
|---|---|
| `utils.py` `resolve_variables` | Accept merged 4-scope map; add all `{{$...}}` dynamic token expansion (see Dynamic Token table below) |
| `common_querys.py` | `get_collection_variables(file_id)` walk node→root; `build_scope_chain()` |
| `routers/runner/*` | Pass local(run) context + collection vars into resolve |
| `main.py` | Register collection vars router; import CollectionVariable |
| `routers/environment/resolve_preview.py` | New — `/resolve/preview` endpoint |

---

## Scope Precedence

```
local (run context) > environment (active) > collection (node subtree) > global (user)
```

Data scope (CSV/JSON runner file) sits above local — deferred to 09-collection-runner.

APIPilot deviation from Postman: Collection scope is per-node (folder subtree walk), not
per-collection. This is a deliberate differentiator — document clearly in UI tooltip.

---

## Secret Encryption (already done for global vars)

- `vault.py` — Fernet encrypt/decrypt; `v1:` version prefix; legacy plaintext passthrough.
- `SECRET_ENC_KEY` env var required; fail-fast at startup if unset.
- Collection vars follow same pattern: encrypt on write when `is_secret`; decrypt at resolve only; list returns `***`.
- Secret reveal in UI: requires a dedicated `/node/{node_id}/variables/{key}/reveal` endpoint (viewer role, returns decrypted value for the calling user only). **Do not** return secrets in the list or preview endpoints.

---

## Dynamic Tokens

### Currently supported (keep, extend)

| Token | Output | Notes |
|---|---|---|
| `${ts}` | Unix timestamp (existing, legacy syntax) | Keep for backward compat |
| `{{$timestamp}}` | Unix timestamp seconds | Canonical Postman form — add |
| `{{$isoTimestamp}}` | ISO 8601 UTC string e.g. `"2024-06-13T12:00:00.000Z"` | Add |
| `{{$guid}}` | UUID v4 string | Add (alias: `{{$randomUUID}}`) |
| `{{$randomInt}}` | Random integer 0–1000 | Already in spec |
| `{{$randomEmail}}` | Random email address | Already in spec |

### Priority 2 — add in same sprint

| Token | Output |
|---|---|
| `{{$randomBoolean}}` | `true` or `false` |
| `{{$randomFirstName}}` | Random first name |
| `{{$randomLastName}}` | Random last name |
| `{{$randomFullName}}` | Random full name |
| `{{$randomUserName}}` | Random username |
| `{{$randomPhoneNumber}}` | Random phone number |
| `{{$randomUrl}}` | Random URL |
| `{{$randomIP}}` | Random IPv4 |
| `{{$randomIPV6}}` | Random IPv6 |
| `{{$randomFloat}}` | Random float 0.0–1.0 |
| `{{$randomAlphaNumeric}}` | Single alphanumeric char |
| `{{$randomWord}}` | Random English word |
| `{{$randomWords}}` | 1–5 random words |
| `{{$randomLoremSentence}}` | Random lorem ipsum sentence |

### Priority 3 — later iteration (full Postman parity)

| Token | Output |
|---|---|
| `{{$randomCity}}` | Random city name |
| `{{$randomCountry}}` | Random country name |
| `{{$randomCountryCode}}` | 2-letter ISO country code |
| `{{$randomZipCode}}` | Random zip code |
| `{{$randomStreetAddress}}` | Full street address |
| `{{$randomLatitude}}` | Random latitude |
| `{{$randomLongitude}}` | Random longitude |
| `{{$randomTimeZone}}` | Random timezone string |
| `{{$randomBankAccount}}` | 8-digit bank account number |
| `{{$randomBankAccountName}}` | Bank account type name |
| `{{$randomCreditCardMask}}` | Masked CC number |
| `{{$randomCurrencyCode}}` | 3-letter currency code |
| `{{$randomCurrencyName}}` | Currency name |
| `{{$randomCurrencySymbol}}` | Currency symbol |
| `{{$randomCompanyName}}` | Random company name |
| `{{$randomJobTitle}}` | Random job title |
| `{{$randomHexColor}}` | Random hex color |
| `{{$randomMimeType}}` | Random MIME type |
| `{{$randomFileName}}` | Random filename |
| `{{$randomFilePath}}` | Random file path |
| `{{$randomLoremParagraph}}` | Random lorem paragraph |
| `{{$randomSemver}}` | Random semantic version |
| `{{$randomPassword}}` | Random password string |
| `{{$randomUserAgent}}` | Random browser UA string |

> Implementation: use Python `faker` library. Map each `{{$...}}` token to the corresponding
> Faker provider method. Evaluate at resolve time (not stored). Each dynamic token call
> generates a new value per evaluation — to get the same value in multiple places in one request,
> the caller must resolve once and store in local scope.

---

## Variable Key Validation

- Keys must match: `^[a-zA-Z0-9_-]+$`
- Max length: 255 characters.
- Key names are case-sensitive: `baseUrl` ≠ `BaseUrl`.
- Reject keys with spaces or special chars at the API boundary (422 response).

---

## Variable Value Type

- All values stored as TEXT in the database.
- Numeric/boolean variables are stored as their string representation.
- Variable substitution operates on raw text (body, URL, headers) before any JSON parsing.
- This means `{"count": {{num}}}` where `num = "5"` produces `{"count": 5}` — valid JSON.
- And `{"name": "{{val}}"}` where `val = "Alice"` produces `{"name": "Alice"}` — valid JSON.
- Template authors are responsible for correct quoting.

---

## Resolver Behavior (edge cases)

| Case | Behavior |
|---|---|
| `{{undefinedVar}}` | Leave literal `{{undefinedVar}}` in output; flag as "unresolved" in preview |
| `{{definedVar}}` where value = `""` | Replace with empty string (NOT left as literal) |
| Nested `{{base_{{env}}}}` | NOT resolved; outer `{{` is treated as start of token, inner `{{` breaks parsing — leave as-is |
| `{{$randomInt}}` used twice in one body | Generates two DIFFERENT random values (evaluated per occurrence) |
| Dynamic token in pre-request + in body | Store result in local var via script to reuse same value |
| Variable name case | `{{baseUrl}}` and `{{BaseUrl}}` are different keys |
| Header key | Do NOT substitute `{{}}` in header key names — values only |
| Query param key | Do NOT substitute `{{}}` in query param key names — values only |
| URL path segment | DO substitute `{{}}` in path segments |

---

## Frontend Changes

### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `VariableScopePanel` | Sidebar or modal | Shows all scopes merged; editor for global/collection/env vars |
| `CollectionVarEditor` | Collection editor → Variables tab | Two-column table: Key / Value / Secret toggle |
| `EnvironmentVarEditor` | Environment editor → Variables tab | Key / Initial Value / Current Value / Secret |
| `EnvironmentQuickLook` | Persistent top-bar widget | Eye icon dropdown showing active env vars |
| `InlineVarHighlight` | Request URL, header values, body editor (CodeMirror) | Color-coded `{{var}}` tokens |
| `VarHoverTooltip` | Attached to InlineVarHighlight | Resolved value + scope badge on hover |
| `DynamicVarAutocomplete` | `{{` context in any text field | Dropdown of all vars + dynamic var list |
| `VarConflictBadge` | Inside VarHoverTooltip | Shows lower-priority scope values when key exists in multiple scopes |
| `SecretRevealButton` | Variable editor rows, VarHoverTooltip | Eye toggle to reveal/mask secret current value |

---

### Component Props

#### `CollectionVarEditor`

```typescript
interface CollectionVarEditorProps {
  nodeId: string;                          // node_id for collection vars scope
  vars: CollectionVariable[];              // initial list from API
  onSave: (vars: CollectionVariable[]) => Promise<void>;  // calls PUT /node/{id}/variables
  onDelete: (key: string) => Promise<void>; // calls DELETE /node/{id}/variables/{key}
  readonly?: boolean;                      // viewer role — no edit controls
}

interface CollectionVariable {
  key: string;
  value: string;                           // "" for secrets (masked)
  is_secret: boolean;
  revealed?: boolean;                      // local UI state for secret reveal toggle
}
```

#### `EnvironmentVarEditor`

```typescript
interface EnvironmentVarEditorProps {
  envId: string;
  vars: EnvVariable[];
  onSave: (vars: EnvVariable[]) => Promise<void>;
  onPersistAll: () => Promise<void>;       // copies currentValue → initialValue for all rows
  onResetAll: () => Promise<void>;         // copies initialValue → currentValue for all rows
  readonly?: boolean;
}

interface EnvVariable {
  key: string;
  initial_value: string;                   // shared / synced
  current_value: string;                   // local only (deferred: store in localStorage until DB schema updated)
  is_secret: boolean;
  revealed?: boolean;
}
```

> **Deferred schema note**: Until two-value model is in the DB, store `current_value` in
> `localStorage` keyed as `env:{envId}:var:{key}:current`. This means current values are
> browser-local only. Add a banner in the editor: "Current values are stored locally in this
> browser. They are never synced."

#### `EnvironmentQuickLook`

```typescript
interface EnvironmentQuickLookProps {
  activeEnvId: string | null;
  activeEnvName: string | null;
  vars: EnvVariable[];                     // from active environment
  onEditClick: () => void;                 // opens full EnvironmentVarEditor
  onVarChange: (key: string, currentValue: string) => void;  // inline edit
}
```

Renders as: `[eye icon] {envName} ▾` in the top bar.
Click → dropdown panel showing all vars.
Each row: key | current value (masked if secret) | reveal button.
"Edit" link opens full editor.
"No Environment" state if no active env.

#### `InlineVarHighlight` (CodeMirror decoration)

```typescript
interface VarHighlightConfig {
  resolvedVars: Record<string, { value: string; scope: VarScope; is_secret: boolean }>;
  // Keys present in resolvedVars → orange highlight
  // Keys absent → red highlight
  // Keys starting with $ → purple/grey (dynamic, always valid)
}

type VarScope = "global" | "collection" | "environment" | "local";
```

Implementation: CodeMirror `Decoration.mark()` on each `{{...}}` match.
- Found var: class `var-highlight-found` → orange border/background
- Missing var: class `var-highlight-missing` → red border/background
- Dynamic var: class `var-highlight-dynamic` → purple/grey border/background
- Attach `VarHoverTooltip` as a CodeMirror tooltip widget on each decoration.

#### `VarHoverTooltip`

```typescript
interface VarHoverTooltipProps {
  varName: string;
  resolvedValue: string | null;           // null if unresolved or secret
  scope: VarScope | null;                 // null if unresolved
  is_secret: boolean;
  conflictingScopes?: Array<{             // lower-priority scopes that also have this key
    scope: VarScope;
    value: string;
    is_secret: boolean;
  }>;
}
```

Renders: scope badge (e.g. `[ENV]`) + value (or `***` for secrets) + conflict list below.
Conflict list: grayed-out rows showing other scopes' values (masked if secret).

#### `DynamicVarAutocomplete`

```typescript
interface DynamicVarAutocompleteProps {
  trigger: string;                         // current partial text after "{{" e.g. "$rand"
  scopeVars: string[];                     // all keys from merged scope chain
  dynamicVars: string[];                   // full list of {{$...}} tokens
  onSelect: (varName: string) => void;     // inserts {{varName}} or {{$varName}}
}
```

Two sections in dropdown:
1. "Variables" — scope vars filtered by `trigger`
2. "Dynamic Variables" — dynamic vars filtered by `trigger` (shown if trigger starts with `$`)

Keyboard: arrow keys to navigate, Enter to select, Escape to dismiss.
Trigger: any input field on `{{` keypress.

---

### API Calls (FE → BE)

| Action | Method | URL | Notes |
|---|---|---|---|
| Load collection vars | GET | `/node/{nodeId}/variables` | On collection editor open |
| Save collection vars | PUT | `/node/{nodeId}/variables` | Debounced on blur/save |
| Delete collection var | DELETE | `/node/{nodeId}/variables/{key}` | On delete row |
| Load env vars | GET | `/environment/{envId}` | Existing |
| Save env vars | PUT | `/environment/{envId}` | Existing |
| Resolve preview | GET | `/resolve/preview?text=...&node_id=...` | On hover or explicit preview |
| Reveal secret | GET | `/node/{nodeId}/variables/{key}/reveal` | On eye button click |
| Reveal global secret | GET | `/variables/global/{key}/reveal` | On eye button click |

> Reveal endpoints are NEW — not in current spec. They return the decrypted value for the
> authenticated user only. Log every reveal event (who, which key, when) for audit purposes.

---

### State Shape (FE store / context)

```typescript
interface VariableState {
  globals: CollectionVariable[];           // from GET /variables/global
  collectionVars: Record<string, CollectionVariable[]>;  // keyed by nodeId
  activeEnvId: string | null;
  activeEnvVars: EnvVariable[];            // from active env
  resolvedPreview: Record<string, ResolvedVar>;  // cache of preview results

  // Derived (computed from scope chain)
  mergedScope: Record<string, { value: string; scope: VarScope; is_secret: boolean }>;
}

interface ResolvedVar {
  value: string;                           // resolved value (masked if secret)
  scope: VarScope;
  is_secret: boolean;
  conflicts: Array<{ scope: VarScope; value: string; is_secret: boolean }>;
  unresolved: boolean;                     // true if var was not found in any scope
}
```

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Collection var scope | Node subtree (walk to root) | Mirrors header inheritance |
| 2 | Precedence | local>env>collection>global | Matches Postman 4-scope semantics |
| 3 | Dynamic tokens | Extend `resolve_variables` (one place) | Single resolver, reuse everywhere |
| 4 | Preview | Server endpoint (auth + secret-aware) | Masks secrets, shows winning scope |
| 5 | Secret collection vars | Encrypt via vault.py | Consistency with global vars |
| 6 | Token `${ts}` | Keep existing; add `{{$timestamp}}` + `{{$isoTimestamp}}` alongside | Backward compatibility |
| 7 | Data scope (5th) | Deferred to 09-collection-runner | Requires CSV/JSON upload flow |
| 8 | Two-value model (initial/current) | Deferred; current_value in localStorage | DB schema change is significant; show banner |
| 9 | Dynamic token generation | Python `faker` library | ~40 tokens; Faker covers all categories |
| 10 | Nested `{{}}` | Leave unresolved, flag in preview | Matches Postman behavior; no recursion |
| 11 | Header/param key substitution | Values only, not key names | Matches Postman behavior |
| 12 | Secret reveal | Dedicated `/reveal` endpoint + audit log | Security: never return secrets in list/preview |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Same key in 2 scopes | Precedence order — surface in preview via VarConflictBadge |
| 2 | Nested folders both define key | Deepest collection wins (walk leaf→root, first-set wins) |
| 3 | Dynamic token in expected/assertion | Evaluate once per run, reuse value |
| 4 | Secret var in preview response | Mask; never return decrypted |
| 5 | Unknown `{{var}}` | Leave literal + flag "unresolved" in preview |
| 6 | Empty string value | Replace with empty string (not left as `{{var}}`) |
| 7 | Nested `{{base_{{env}}}}` | Leave as-is; do NOT recurse; flag as unparseable in preview |
| 8 | `{{$randomInt}}` used twice in body | Two different values generated (per-occurrence) |
| 9 | Variable key with spaces/special chars | Reject at API boundary (422); validate on FE before submit |
| 10 | Secret in Initial Value | Warn in UI: "Initial values are shared with teammates; use Current Value for secrets" |
| 11 | JSON body substitution order | Resolve on raw text before JSON parse; template author owns quoting |
| 12 | Case sensitivity | `{{baseUrl}}` ≠ `{{BaseUrl}}` — resolver is case-sensitive |
