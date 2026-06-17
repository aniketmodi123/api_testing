# Spec — Assertions

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

APIPilot uses a **declarative JSON assertion engine** — not Postman's JS/Chai `pm.test`/`pm.expect`.
This is an intentional design choice. The engine (`validator.py`) is complete and production-ready.

**Sole gap: no FE AssertionBuilder UI.** Users must hand-write assertion JSON, which is a significant
usability problem. This spec covers the full AssertionBuilder component set needed.

---

## Backend — Engine Reference (already shipped, no changes needed)

### Full Assertion Schema

```json
{
  "status": 200,
  "status_in": [200, 201],
  "text_contains": "success",
  "text_contains_any": ["ok", "success"],
  "text_regex": "^\\{",
  "headers": { "content-type": "application/json" },
  "headers_regex": { "content-type": "application/.*json" },
  "json": {
    "checks": [
      { "path": "data.id",     "present": true },
      { "path": "data.name",   "equals": "Alice" },
      { "path": "data.age",    "gt": 0, "lte": 150 },
      { "path": "data.tags",   "type": "array", "length": 3 },
      { "path": "data.email",  "regex": "^[^@]+@[^@]+$" },
      { "path": "data.bio",    "contains": "engineer" },
      { "path": "data.secret", "absent": true },
      { "path": "data.score",  "schema": { "type": "number", "minimum": 0 } }
    ],
    "either": [
      { "checks": [{ "path": "status", "equals": "ok" }] },
      { "checks": [{ "path": "result", "equals": "success" }] }
    ]
  },
  "_mirror_http_status": true,
  "_require_content_for_error": true
}
```

### Predicate Reference

| Predicate | Type | What it checks |
|---|---|---|
| `present` | bool | Key exists at path |
| `absent` | bool | Key does NOT exist at path |
| `equals` | any | Strict equality |
| `contains` | any | String substring OR dict/list subset |
| `regex` | string | `re.search()` match on string value |
| `type` | string\|array | JSON type: `string`, `number`, `boolean`, `object`, `array`, `null` |
| `length` | int | Exact `len()` of string/array/object |
| `gt` / `gte` / `lt` / `lte` | number | Numeric comparison |
| `schema` | object | Full JSON Schema validation via `jsonschema` |

### Top-level Fields

| Field | Purpose |
|---|---|
| `status` | Exact HTTP status code |
| `status_in` | Accept any of listed codes |
| `text_contains` | All strings must appear in raw body |
| `text_contains_any` | At least one string must appear |
| `text_regex` | Regex must match raw body |
| `headers` | Exact header values (case-insensitive key) |
| `headers_regex` | Regex match per header value |
| `json.checks` | ALL checks must pass |
| `json.either` | At least ONE branch must pass |
| `_mirror_http_status` | Auto-fail if `response_code` in JSON ≠ HTTP status (default true) |
| `_require_content_for_error` | 4xx/5xx must have text or json assertion (default true) |

### Path Syntax

Dot-separated: `data.user.name`
Array index: `data.items[0].id`
Root `$` prefix optional: `$.data.name` == `data.name`

---

## Frontend

### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `AssertionBuilderPanel` | `src/components/assertions/AssertionBuilderPanel.tsx` | Container; owns full assertion object; renders all sub-sections |
| `StatusAssertionRow` | `src/components/assertions/StatusAssertionRow.tsx` | Status / status_in input |
| `TextAssertionSection` | `src/components/assertions/TextAssertionSection.tsx` | text_contains / text_contains_any / text_regex rows |
| `HeaderAssertionSection` | `src/components/assertions/HeaderAssertionSection.tsx` | headers + headers_regex key/value rows |
| `JsonChecksSection` | `src/components/assertions/JsonChecksSection.tsx` | json.checks list; add/remove check rows |
| `JsonCheckRow` | `src/components/assertions/JsonCheckRow.tsx` | Single check: path + predicate selector + value input |
| `EitherBranchSection` | `src/components/assertions/EitherBranchSection.tsx` | json.either branches; each branch is a sub-list of JsonCheckRows |
| `AssertionPresetMenu` | `src/components/assertions/AssertionPresetMenu.tsx` | Dropdown of common presets (adds rows to panel) |
| `AssertionJsonPreview` | `src/components/assertions/AssertionJsonPreview.tsx` | Read-only CodeMirror JSON preview of generated assertion object |

### TypeScript Interfaces

```typescript
interface AssertionSpec {
  status?: number;
  status_in?: number[];
  text_contains?: string | string[];
  text_contains_any?: string | string[];
  text_regex?: string;
  headers?: Record<string, string>;
  headers_regex?: Record<string, string>;
  json?: {
    checks?: JsonCheck[];
    either?: EitherBranch[];
  };
  _mirror_http_status?: boolean;
  _require_content_for_error?: boolean;
}

interface JsonCheck {
  path: string;
  present?: boolean;
  absent?: boolean;
  equals?: unknown;
  contains?: unknown;
  regex?: string;
  type?: JsonTypeName | JsonTypeName[];
  length?: number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  schema?: Record<string, unknown>;
}

type JsonTypeName = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

interface EitherBranch {
  checks: JsonCheck[];
}

interface AssertionBuilderPanelProps {
  value: AssertionSpec;
  onChange: (spec: AssertionSpec) => void;
  readOnly?: boolean;
}

interface JsonCheckRowProps {
  check: JsonCheck;
  onChange: (check: JsonCheck) => void;
  onDelete: () => void;
}
```

### Component Render Descriptions

**`AssertionBuilderPanel`**: Vertical stack of sections. Top: `StatusAssertionRow`. Then `TextAssertionSection`, `HeaderAssertionSection`, `JsonChecksSection`, `EitherBranchSection` — each collapsible with a chevron. Bottom: `AssertionPresetMenu` button + `AssertionJsonPreview` toggle. All changes bubble up via `onChange(spec)`.

**`StatusAssertionRow`**: Radio: "Exact status" (number input, 100–599) vs "Any of" (multi-value tag input). Mutually exclusive — selecting one clears the other. Matches `status` vs `status_in` exclusivity rule in engine.

**`TextAssertionSection`**: Three subsections:
- `text_contains`: tag input (each tag = one required string)
- `text_contains_any`: tag input (at least one must match)
- `text_regex`: single text input with regex syntax validation (highlight invalid regex inline)

**`HeaderAssertionSection`**: Two tables side by side: "Exact" and "Regex". Each row: header name input + value/pattern input + delete button. "Add row" button at bottom of each table.

**`JsonChecksSection`**: List of `JsonCheckRow` components. "Add check" button. Drag-to-reorder (react-beautiful-dnd). All checks ANDed.

**`JsonCheckRow`**: Three controls in a row:
1. Path input (text field; placeholder `data.user.id`)
2. Predicate dropdown: `present | absent | equals | contains | regex | type | length | gt | gte | lt | lte | schema`
3. Value input — changes shape based on predicate:
   - `present` / `absent`: no value input (checkbox/toggle only)
   - `type`: dropdown of type names (multi-select allowed)
   - `schema`: CodeMirror JSON editor (collapsed by default, expand button)
   - `gt/gte/lt/lte`: number input
   - `regex`: text input + inline regex validation
   - `equals/contains`: auto-detect JSON vs string; show JSON editor if value is object/array

**`EitherBranchSection`**: "OR logic" header with tooltip explaining semantics. Collapsible list of branches. Each branch is a card containing its own `JsonChecksSection`. "Add branch" button. At least 2 branches enforced when section is open.

**`AssertionPresetMenu`**: Button opens dropdown with common presets:
- "Status 200" → sets `status: 200`
- "Status 201 Created" → sets `status: 201`
- "JSON response" → adds `headers: {"content-type": "application/json"}`
- "Response time < 500ms" → note: not in engine (display-only warning that engine doesn't support response time; links to #08-testing)
- "Field present" → adds blank JsonCheck with `present: true`
- "Field equals value" → adds blank JsonCheck with `equals: ""`
- "JSON schema valid" → adds blank JsonCheck with `schema: {}`

**`AssertionJsonPreview`**: Toggle button "View JSON". When open: CodeMirror 6 read-only JSON mode showing the current `AssertionSpec` object as pretty-printed JSON. Copy button. Useful for power users who want to copy the raw JSON.

### API Calls

No new API calls. `AssertionBuilderPanel` is a pure local-state component. The parent (test case editor) sends the final `AssertionSpec` to:

| Action | Method | URL | When |
|---|---|---|---|
| Save assertion spec | PATCH | `/test-cases/{id}` | Parent saves test case |
| Validate spec (pre-save) | POST | `/test-cases/validate-assertion` | Triggered on blur / before save |

#### POST `/test-cases/validate-assertion` (new endpoint)

Exposes `validate_expected_spec()` from `validator.py` over HTTP so FE can show validation errors inline before saving.

Request:
```json
{ "expected": { ... } }
```

Response:
```json
{ "valid": true, "errors": [] }
```

Min role: viewer. No DB write.

### Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Drag to reorder checks | `react-beautiful-dnd` | Already used elsewhere in project for collection ordering |
| Schema value editor | CodeMirror 6 JSON mode | Consistent with rest of app; JSON Schema objects need syntax highlight |
| Regex validation (client) | Native `new RegExp()` try/catch | No extra lib; same logic as BE `re.compile()` |
| Preset menu | Custom dropdown | Simple enough; no library needed |

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Declarative JSON vs JS scripting | Keep declarative | APIPilot core design; no sandbox security risk; testable without execution |
| 2 | `either` UX | Branch cards with sub-check lists | OR-logic is non-obvious; visual card grouping makes it clear |
| 3 | `schema` value input | Inline CodeMirror (collapsed) | JSON Schema can be large; don't force it inline; expand on demand |
| 4 | Validate-on-blur vs save-only | Validate on blur via POST | Catches errors before save; uses exact same engine as execution |
| 5 | Response time assertion | Not supported, show warning | Engine doesn't track response time in assertion context; separate concern |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | User sets both `status` and `status_in` | Block in `StatusAssertionRow` — radio is mutually exclusive; only one active at a time |
| 2 | `either` section has only 1 branch | Warn inline: "OR logic requires at least 2 branches"; disable save |
| 3 | `regex` value is invalid | Highlight row red; show error inline; block save if invalid regex present |
| 4 | `schema` value is invalid JSON | CodeMirror shows parse error; block save |
| 5 | `type` with value `["string", "null"]` | Multi-select dropdown supports it; renders as tag list |
| 6 | `equals` value is `null` | Render as special "null" chip in value input; don't treat as empty |
| 7 | Path uses `[0]` index syntax | Show path hint: both `items[0].id` and `items.#0.id` work; normalize in preview |
| 8 | `present` + other predicates combined | Engine supports it but `present: true` alone returns early; warn user if combining |

---

## Deferred

| Item | Reason |
|---|---|
| Response time assertion | Engine doesn't expose timing; separate monitoring concern |
| Cookie assertions | `pm.cookies` equivalent; low demand; add on request |
| XML body assertions | `text_regex` covers basic XML; full XPath deferred |
| JS/Chai scripting mode | Not APIPilot's model; explicitly out of scope |
