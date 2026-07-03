# Spec — API Request Builder

STATUS: updated (REDO complete)
LAST_CHANGED: 2026-06-17

---

## 1. Feature Overview

The API Request Builder is the primary interface for composing and sending HTTP requests. It maps 1:1 with Postman's HTTP request tab. Supports GET/POST/PUT/PATCH/DELETE and custom methods. Request persisted as `Api` model + `extra_meta` JSON blob. Response rendered in ResponseViewer (spec 03).

APIPilot current state: core builder works end-to-end. Gaps are FE enhancements and per-request settings.

---

## 2. DB Models

### Api (existing)
```
Api
  id              UUID PK
  node_id         FK → Node CASCADE DELETE
  method          varchar(10)    GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS + custom
  endpoint        varchar(500)   full URL or path, e.g. /api/users/{id}
  name            varchar(255)
  extra_meta      JSON           see schema below
```

### extra_meta JSON schema (full)
```json
{
  "headers": [{ "key": "str", "value": "str", "enabled": true, "description": "str" }],
  "params": [{ "key": "str", "value": "str", "enabled": true, "description": "str" }],
  "path_variables": [{ "key": "str", "value": "str", "description": "str" }],
  "body": {
    "mode": "none|raw|formdata|urlencoded|binary|graphql",
    "raw": "str",
    "raw_type": "Text|JSON|XML|HTML|JavaScript",
    "formdata": [{ "key": "str", "value": "str", "type": "text|file", "src": "str", "enabled": true }],
    "urlencoded": [{ "key": "str", "value": "str", "enabled": true }],
    "binary_file_name": "str",
    "graphql": { "query": "str", "variables": "str" }
  },
  "auth": {
    "type": "none|apikey|bearer|basic|oauth2|oauth1|digest|hawk|awsv4|ntlm|akamai",
    "config": {}
  },
  "pre_request_script": "str",
  "test_script": "str",
  "settings": {
    "timeout": 0,
    "follow_redirects": true,
    "ssl_verification": true,
    "encode_url": true,
    "disable_cookies": false
  }
}
```

---

## 3. Backend Endpoints

All existing unless noted.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/request` | user | Create request |
| GET | `/api/request/{id}` | user | Get request |
| PATCH | `/api/request/{id}` | user | Update request |
| DELETE | `/api/request/{id}` | user | Delete request |
| POST | `/curl/to-request` | user | Parse cURL string → Api object |
| POST | `/request/to-curl` | user | Serialize Api object → cURL string |
| POST | `/api/request/{id}/send` | user | Execute request (calls execute_direct) |
| POST | `/api/code-snippet` | user | **NEW** — generate code snippet |

### POST /api/code-snippet (NEW)
```
Request:
  request_id: str (or inline request object)
  language: str     e.g. "Python"
  variant: str      e.g. "Requests"

Response:
  snippet: str      generated code string
  language: str
  variant: str
```

Uses `postman-code-generators` npm package (node subprocess or pre-built service). See §6 Decision Table #4.

---

## 4. Frontend Components

### 4.1 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `RequestPanel` | `frontend/src/components/RequestPanel/RequestPanel.jsx` | Root container, tab router |
| `UrlBar` | inside RequestPanel | Method dropdown + URL input + Send button |
| `ParamsTab` | inside RequestPanel | Query params key-value table |
| `PathVariablesEditor` | inside RequestPanel | **NEW** — path variables extracted from URL |
| `HeadersTab` | inside RequestPanel | Request headers key-value table |
| `AuthTab` | inside RequestPanel | Auth type selector + config form |
| `BodyTab` | inside RequestPanel | Body mode selector + per-mode editors |
| `ScriptsTab` | inside RequestPanel | Pre-request + test script editors (CodeMirror) |
| `RequestSettingsTab` | inside RequestPanel | **NEW** — per-request settings panel |
| `CodeSnippetModal` | `frontend/src/components/CodeSnippetModal/` | **NEW** — language picker + snippet display |
| `BulkEditOverlay` | inside ParamsTab / HeadersTab | Toggle to raw text input for bulk editing |

### 4.2 Component Interfaces

```typescript
// UrlBar
interface UrlBarProps {
  method: HttpMethod;
  url: string;
  onMethodChange: (m: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
  isSending: boolean;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | string;

// ParamsTab / HeadersTab (shared key-value table pattern)
interface KeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

interface KeyValueTabProps {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  onBulkEdit: () => void;
}

// PathVariablesEditor (NEW)
interface PathVariable {
  key: string;   // extracted from URL e.g. "id" from /users/{id}
  value: string;
  description?: string;
}

interface PathVariablesEditorProps {
  url: string;                          // parent passes URL so editor auto-parses {tokens}
  variables: PathVariable[];
  onChange: (vars: PathVariable[]) => void;
}

// BodyTab
type BodyMode = "none" | "raw" | "formdata" | "urlencoded" | "binary" | "graphql";
type RawType  = "Text" | "JSON" | "XML" | "HTML" | "JavaScript";

interface BodyTabProps {
  mode: BodyMode;
  rawContent: string;
  rawType: RawType;
  formdata: FormDataRow[];
  urlencoded: KeyValueRow[];
  binaryFileName: string | null;
  graphqlQuery: string;
  graphqlVariables: string;
  onChange: (patch: Partial<BodyState>) => void;
}

interface FormDataRow extends KeyValueRow {
  type: "text" | "file";
  src?: string;  // file path / file object ref
}

// RequestSettingsTab (NEW)
interface RequestSettings {
  timeout: number;              // ms; 0 = infinite
  follow_redirects: boolean;
  ssl_verification: boolean;
  encode_url: boolean;
  disable_cookies: boolean;
}

interface RequestSettingsTabProps {
  settings: RequestSettings;
  onChange: (s: RequestSettings) => void;
}

// CodeSnippetModal (NEW)
interface CodeSnippetModalProps {
  requestId: string;
  open: boolean;
  onClose: () => void;
}
// internally calls POST /api/code-snippet with selected language+variant
```

### 4.3 Render Descriptions

**RequestPanel** — root tab bar: Params | Auth | Headers | Body | Scripts | Settings. Active tab persists in local state. URL bar always visible above tabs. Top-right toolbar: Save button, Code button (opens CodeSnippetModal), Import cURL button (opens text input modal → calls `/curl/to-request`).

**UrlBar** — method selector left (dropdown with color per method matching Postman convention), URL input fills remaining width (variable tokens `{{var}}` highlighted in orange), Send button right. Pressing Enter in URL input triggers send.

**ParamsTab** — key-value rows, each row: checkbox (enabled), key input, value input, description input, delete icon. "Bulk Edit" toggle switches to raw `key=value&...` textarea. URL query string and params table stay in sync bidirectionally.

**PathVariablesEditor** — shown as sub-section inside Params tab (below query params). Only renders when URL contains `{param}` or `:param` tokens. Auto-parses URL on change and adds/removes rows to match. Rows: key (read-only, extracted from URL), value input, description.

**HeadersTab** — same pattern as ParamsTab. Pre-populated with `Content-Type` based on body mode. Auto-managed headers shown greyed-out with "(auto)" label, not deletable.

**AuthTab** — dropdown to select auth type. Renders config form per type (see spec 06-authentication for full auth type specs).

**BodyTab** — mode radio: None / Form Data / URL-encoded / Raw / Binary / GraphQL. Raw shows language dropdown (Text/JSON/XML/HTML/JavaScript) + CodeMirror editor with matching syntax highlight. Form Data table with file picker for `file` type rows. Binary shows file picker + filename display. GraphQL shows query editor + variables editor (CodeMirror JSON mode).

**ScriptsTab** — two sub-tabs: Pre-request / Tests. Each is a CodeMirror JS editor. Pre-request runs before send; Tests run after response received. `pm.*` API autocomplete (separate concern, tracked in spec 08-testing).

**RequestSettingsTab** — simple form:
- Timeout (ms): number input, 0 = wait forever
- Follow redirects: toggle
- SSL certificate verification: toggle
- Encode URL automatically: toggle
- Disable cookies: toggle

**CodeSnippetModal** — left panel: language list (23 languages). Right of selected language: variant dropdown. Bottom: read-only code block with copy button. Language selection calls POST /api/code-snippet and renders response.

---

## 5. Supported Code Snippet Languages

Full language × variant matrix from `postman-code-generators`:

| Language | Variants |
|---|---|
| C | libcurl |
| C# | HttpClient, RestSharp |
| cURL | cURL |
| Dart | http |
| Go | Native |
| HTTP | HTTP |
| Java | OkHttp, Unirest |
| JavaScript | Fetch, jQuery, XHR |
| Kotlin | OkHttp |
| NodeJs | Axios, Native, Request, Unirest |
| Objective-C | NSURLSession |
| OCaml | Cohttp |
| PHP | cURL, Guzzle, pecl_http, HTTP_Request2 |
| PowerShell | RestMethod |
| Python | http.client, Requests |
| R | httr, RCurl |
| Ruby | Net:HTTP |
| Rust | Reqwest |
| Shell | Httpie, wget |
| Swift | URLSession |

---

## 6. Business Logic

### Path Variable Parsing
URL is parsed on every keystroke. Regex: `\{([^}]+)\}` (curly-brace style) and `:([a-zA-Z_][a-zA-Z0-9_]*)` (colon style). Extracted token names diff against existing `path_variables` array — add missing, remove stale, keep values of unchanged keys.

### Auto Content-Type Header
When body mode changes:
- `formdata` → set `Content-Type: multipart/form-data` (auto, with boundary)
- `urlencoded` → set `Content-Type: application/x-www-form-urlencoded`
- `raw` + type `JSON` → set `Content-Type: application/json`
- `raw` + type `XML` → set `Content-Type: application/xml`
- `raw` + type others → set `Content-Type: text/plain`
- `binary` → no auto header (user must set)
- `graphql` → set `Content-Type: application/json`
- `none` → remove content-type auto header

User-defined `Content-Type` always takes precedence — never overwrite.

### JSON Comment Stripping
When body `raw_type = JSON`, strip `//` and `/* */` comments before sending. Allows annotated JSON in editor without breaking server.

### Bulk Edit ↔ Table Sync
Bulk edit textarea parses `key: value\n` or `key=value\n` or `key\tvalue\n` per line. Parse on blur. Lines starting with `#` treated as disabled rows.

### cURL Import
UI provides "Import cURL" button that opens a textarea modal. On confirm, calls `POST /curl/to-request` with raw cURL string. Response merges into current request state (method, URL, headers, body). Existing unsaved changes are replaced after user confirmation.

### Request-to-cURL Export
"Code" button in URL bar toolbar opens CodeSnippetModal. Top item in language list is always "cURL" (calls `POST /request/to-curl`). Other languages call `POST /api/code-snippet`.

---

## 7. Validation Rules

| Field | Rule |
|---|---|
| `method` | Must be non-empty string. Custom methods uppercased. |
| `endpoint` | Non-empty. Must start with `http://`, `https://`, or `{{variable}}`. |
| `timeout` | Integer ≥ 0. Default 0. |
| `extra_meta.body.raw` | Max 10 MB. |
| `extra_meta.formdata` file | Max 100 MB per file (cloud run limit). |
| Path variable value | Required before send (warn if empty, don't block). |

---

## 8. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | URL has both `{id}` and `:id` style params | Parse both; deduplicate by token name |
| 2 | User renames URL token while path_variables has existing values | Match old name → drop old, add new with empty value |
| 3 | Auto Content-Type conflicts with user-set header | User header always wins — auto header shown greyed but not applied |
| 4 | Binary file path saved — file deleted before send | Validate file exists at send time; surface error in response panel |
| 5 | Form-data file + cloud run | Files must be uploaded to Postman team storage for cloud execution; APIPilot: block or warn on cloud run with local file |
| 6 | cURL import with `--data-binary @file` | Map to binary body mode with filename extracted from arg |
| 7 | JSON body with trailing comma | Strip comments, still valid JSON parser should handle; surface parse error if invalid |
| 8 | Variable `{{var}}` in URL not defined in active env | Highlight token in red in URL bar (same as variable highlighting spec) |
| 9 | Timeout = 0 with slow server in browser | Browser has its own timeout; warn user this only controls APIPilot's proxy timeout |
| 10 | `Content-Type` manually set in Headers tab + body mode changed | Do not overwrite user header — show "auto" label only in preview, not applied |

---

## 9. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Path variable syntax | Support both `{param}` and `:param` | Existing code uses `{param}`; `:param` common in Express-style APIs |
| 2 | Body raw editor | CodeMirror 6 | Already used for scripts; consistent, bundle-efficient |
| 3 | Bulk edit format | `key: value` line-based with `#` for disabled | Matches Postman's bulk edit textarea format |
| 4 | Code snippet backend | Node subprocess calling `postman-code-generators` npm package, exposed as Python FastAPI endpoint via `subprocess.run` | Avoids rewriting 33 generators; single source of truth |
| 5 | cURL parsing | Reuse existing `/curl/to-request` endpoint | Already built, no duplication |
| 6 | Auto Content-Type | Set as "managed" header, visually distinct from user headers | User headers always win; no silent overwrite bugs |
| 7 | Settings persistence | Stored in `extra_meta.settings` JSON blob | No new DB column; flexible for future settings additions |

---

## 10. Deferred Items

| Item | Reason |
|---|---|
| Certificate manager (per-request client cert) | Complex; tracked in spec 22-security |
| Proxy per-request override | Global proxy settings sufficient for v1 |
| File upload to APIPilot team storage (cloud run) | Cloud run infra not planned for v1 |
| Request history / versions | Tracked in spec 16-version-control |
| AI-powered request generation (Postman's Autocomplete in New Request) | AI features dropped |
| MCP request type | Separate protocol; tracked separately |
| MQTT request type | Separate protocol; tracked separately |
