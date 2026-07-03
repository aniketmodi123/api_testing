# Spec — Test Cases & Examples

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

APIPilot has two distinct concepts that map to Postman features:

| APIPilot concept | Postman equivalent | Status |
|---|---|---|
| `ApiCase` — test case with assertions | Postman test scripts (`pm.test`) | ✅ Backend complete |
| "Examples" — request+response snapshot | Postman Examples | ❌ Missing entirely |

The `ApiCase` model and all CRUD/run endpoints are shipped. Gaps are:
1. FE: no `TestCasePanel` / editor UI (users interact via raw JSON)
2. FE: no run-result display panel on per-case basis
3. Feature entirely missing: **Request Examples** (saved request+response snapshots)

---

## Part A — Test Cases (ApiCase)

### Backend — Current State (shipped)

#### `ApiCase` Model

```
id          INTEGER PK
api_id      INTEGER FK → Api.id CASCADE DELETE
name        VARCHAR(255)
headers     JSONB nullable    -- request headers to override
params      JSONB nullable    -- query/path params to override
body        JSONB NOT NULL    -- request body
expected    JSONB NOT NULL    -- AssertionSpec (see assertions/spec.md)
created_at  TIMESTAMP
```

#### Existing Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/file/{file_id}/api/cases` | List all cases for a file; `?search=` filter |
| GET | `/case/{case_id}` | Single case with parent API + file context |
| POST | `/case/{case_id}/duplicate` | Clone case with "(Copy)" suffix |
| DELETE | `/case/{case_id}` | Delete case |
| POST | `/test-cases/validate-assertion` | Validate `expected` spec without saving (**new — see assertions/spec.md**) |

#### Missing Backend Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/file/{file_id}/api/cases` | editor | Create new test case |
| PATCH | `/case/{case_id}` | editor | Update name / headers / params / body / expected |
| POST | `/case/{case_id}/run` | viewer | Run single case, return pass/fail + failures list |

`POST /case/{case_id}/run` exists via `run_case.py` — verify it returns per-case result shape:
```json
{
  "case_id": 1,
  "passed": true,
  "failures": [],
  "response_status": 200,
  "response_time_ms": 134,
  "response_body": {}
}
```

### Frontend — Test Case UI (missing)

#### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `TestCaseListPanel` | `src/components/test-cases/TestCaseListPanel.tsx` | Sidebar list of cases for current API; search input; add/duplicate/delete |
| `TestCaseEditor` | `src/components/test-cases/TestCaseEditor.tsx` | Tab container: Body / Headers / Params / Assertions / Result |
| `TestCaseBodyTab` | `src/components/test-cases/TestCaseBodyTab.tsx` | JSON body editor (CodeMirror 6); inherits from API body, overrides per case |
| `TestCaseHeadersTab` | `src/components/test-cases/TestCaseHeadersTab.tsx` | Key-value override rows for headers |
| `TestCaseParamsTab` | `src/components/test-cases/TestCaseParamsTab.tsx` | Key-value override rows for query/path params |
| `TestCaseAssertionsTab` | `src/components/test-cases/TestCaseAssertionsTab.tsx` | Embeds `AssertionBuilderPanel` (see assertions/spec.md) |
| `TestCaseRunResult` | `src/components/test-cases/TestCaseRunResult.tsx` | Shows pass/fail badge, failure messages list, response status + time |
| `RunCaseButton` | `src/components/test-cases/RunCaseButton.tsx` | Trigger single-case run; shows spinner; updates `TestCaseRunResult` |

#### TypeScript Interfaces

```typescript
interface TestCase {
  id: number;
  api_id: number;
  name: string;
  headers: Record<string, string> | null;
  params: Record<string, string> | null;
  body: Record<string, unknown>;
  expected: AssertionSpec;        // from assertions/spec.md
  created_at: string;
}

interface TestCaseRunResult {
  case_id: number;
  passed: boolean;
  failures: string[];
  response_status: number;
  response_time_ms: number;
  response_body: unknown;
}

interface TestCaseListPanelProps {
  fileId: number;
  selectedCaseId: number | null;
  onSelect: (caseId: number) => void;
}

interface TestCaseEditorProps {
  caseId: number;
  onSave: (updated: TestCase) => void;
}
```

#### Component Render Descriptions

**`TestCaseListPanel`**: Vertical list of case name chips. Search input at top. "+" button adds blank case. Each chip has hover menu: Duplicate / Delete. Selected chip highlighted. Total count badge.

**`TestCaseEditor`**: Five tabs: Body | Headers | Params | Assertions | Result. "Run" button (via `RunCaseButton`) pinned top-right always visible. Auto-saves on 2s debounce. Dirty indicator (dot on tab) when unsaved.

**`TestCaseBodyTab`**: CodeMirror 6 JSON editor. Shows base API body as greyed-out background (inherited), with override values highlighted. Toggle: "Override" vs "Inherit from API".

**`TestCaseHeadersTab`** / **`TestCaseParamsTab`**: Key-value table. Same component pattern as request builder's headers/params tabs. Empty rows allowed (ignored on run).

**`TestCaseAssertionsTab`**: Full `AssertionBuilderPanel` embed. JSON preview toggle at bottom.

**`TestCaseRunResult`**: Shows after run completes. Pass: green badge "PASSED" + response status chip + time chip. Fail: red badge "FAILED" + numbered list of failure strings. Expand chevron on each failure for context. Raw response body expandable JSON viewer at bottom.

#### API Calls

| Action | Method | URL | When |
|---|---|---|---|
| List cases | GET | `/file/{file_id}/api/cases?search=` | Panel opens / search typed |
| Load case | GET | `/case/{case_id}` | Case selected in list |
| Create case | POST | `/file/{file_id}/api/cases` | "+" button |
| Save case | PATCH | `/case/{case_id}` | Auto-save debounce / manual save |
| Duplicate | POST | `/case/{case_id}/duplicate` | Hover menu → Duplicate |
| Delete | DELETE | `/case/{case_id}` | Hover menu → Delete |
| Run case | POST | `/case/{case_id}/run` | Run button |
| Validate assertion | POST | `/test-cases/validate-assertion` | Assertion tab blur |

---

## Part B — Request Examples (missing feature)

Postman "Examples" are **request+response snapshot pairs** saved against a request. Distinct from
test cases: no assertions, no running. Used for mock server matching and API documentation.

APIPilot has no equivalent. This is a P2 gap — needed before mock server is fully useful.

### New DB Model: `RequestExample`

```
id              UUID PK
api_id          INTEGER FK → Api.id CASCADE DELETE
name            VARCHAR(255) NOT NULL       -- e.g. "200 Success", "404 Not Found"
request_method  VARCHAR(10)                 -- can differ from parent API method
request_url     VARCHAR(2048)
request_headers JSONB nullable
request_params  JSONB nullable
request_body    JSONB nullable
response_status INTEGER NOT NULL
response_headers JSONB nullable
response_body   TEXT                        -- raw text; may be JSON string
created_at      TIMESTAMPTZ DEFAULT now()
sort_order      INTEGER DEFAULT 0
```

One `Api` can have many `RequestExample` rows. No unique constraint on name (allow "Error" ×2).

### New Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/api/{api_id}/examples` | viewer | List all examples for an API |
| POST | `/api/{api_id}/examples` | editor | Create example (manual or from live response) |
| GET | `/api/{api_id}/examples/{example_id}` | viewer | Single example |
| PATCH | `/api/{api_id}/examples/{example_id}` | editor | Update example |
| DELETE | `/api/{api_id}/examples/{example_id}` | editor | Delete example |
| POST | `/api/{api_id}/examples/from-response` | editor | Save last live response as new example |

#### POST `/api/{api_id}/examples/from-response`

Request:
```json
{
  "name": "200 Success",
  "response_status": 200,
  "response_headers": { "content-type": "application/json" },
  "response_body": "{\"id\": 1, \"name\": \"Alice\"}",
  "request_headers": {},
  "request_params": {},
  "request_body": { "name": "Alice" }
}
```

FE sends last-received response payload from request builder when user clicks "Save as Example".

### Frontend — Examples UI

| Component | Location | Purpose |
|---|---|---|
| `ExamplesPanel` | `src/components/examples/ExamplesPanel.tsx` | List of examples for current API; add/delete |
| `ExampleEditor` | `src/components/examples/ExampleEditor.tsx` | Edit request+response snapshot; two-pane layout |
| `SaveAsExampleButton` | `src/components/request-builder/SaveAsExampleButton.tsx` | Button in response panel: "Save as Example" |

**`ExamplesPanel`**: Tab in request builder sidebar alongside Test Cases. List of example name chips. "+" (blank) and "Save from response" buttons. Each chip deletable.

**`ExampleEditor`**: Left pane: request fields (method, URL, headers, params, body — all editable). Right pane: response fields (status code picker, headers table, body editor). Name field at top.

**`SaveAsExampleButton`**: Appears in response viewer after a successful request run. Clicking opens `ExampleEditor` pre-filled with current response data + request state.

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Test cases vs Examples as separate models | Separate | Different purposes: cases assert, examples snapshot; sharing model adds complexity |
| 2 | `response_body` type in `RequestExample` | TEXT not JSONB | Response may be non-JSON (HTML, XML, plain text); store raw, parse on display |
| 3 | Auto-save in TestCaseEditor | 2s debounce | Same pattern as request builder; prevents data loss without blocking typing |
| 4 | "Inherit from API" body toggle | Show base as greyed-out | Makes override vs inherit state visually obvious |
| 5 | Example creation from live response | `POST /from-response` endpoint | FE sends full response payload; avoids re-fetching |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Test case body overrides API body partially | Merge strategy: case body is full override, not merge; document this clearly in UI |
| 2 | Delete last test case for an API | Allow; API can have zero cases |
| 3 | Run case while API endpoint is offline | Return 502 with connection error message; still show as "FAILED" |
| 4 | Example `response_body` is invalid JSON displayed in editor | Detect JSON parse error; show raw text mode instead of JSON viewer |
| 5 | `from-response` called with no prior run | Block button until response received in current session |
| 6 | Multiple examples with same name | Allow; differentiate by `id` not name; no unique constraint |

---

## Deferred

| Item | Reason |
|---|---|
| Example import from OpenAPI spec `examples` field | Complex mapping; deferred to openapi-specs feature |
| Bulk run all examples as smoke tests | P3; no assertion engine on examples |
| Example versioning / history | P3 |
| Test case ordering (manual sort) | No `sort_order` on `ApiCase`; deferred |
