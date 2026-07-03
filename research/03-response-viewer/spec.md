# Spec — Response Viewer

STATUS: updated (REDO complete)
LAST_CHANGED: 2026-06-17

---

## 1. Feature Overview

The Response Viewer renders the result of a sent request inline below (or beside) the Request Builder. It is purely a FE feature — no new backend work required beyond what execute_direct already returns. All data comes from the `ResponseSnapshot` returned by the execution engine (spec 02).

APIPilot current state: basic status/body/headers/time display exists. Gaps are FE completeness.

---

## 2. Backend

No new endpoints. Response data sourced from:
- `POST /api/request/{id}/send` → returns `ResponseSnapshot` JSON inline
- `GET /api/history/{id}` → load past response from `RequestHistory`

`ResponseSnapshot` schema (cross-ref spec 02 §2):
```json
{
  "status_code": 200,
  "status_text": "OK",
  "headers": [{ "key": "str", "value": "str" }],
  "body": "str",
  "body_size_bytes": 4096,
  "duration_ms": 145,
  "redirects": [{ "status_code": 301, "url": "str" }],
  "tls": { "protocol": "TLSv1.3", "cipher": "str", "cert_valid": true },
  "console_logs": ["str"],
  "body_truncated": false
}
```

---

## 3. Frontend Components

### 3.1 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `ResponsePanel` | `frontend/src/components/ResponsePanel/` | Root container; tab router + metadata bar |
| `ResponseMetaBar` | inside ResponsePanel | Status badge + time badge + size badge + network icon |
| `ResponseBodyTab` | inside ResponsePanel | Body view mode switcher + content display |
| `BodyPrettyView` | inside ResponseBodyTab | Formatted JSON/XML/HTML with syntax highlight |
| `BodyRawView` | inside ResponseBodyTab | Plain text, monospace |
| `BodyPreviewView` | inside ResponseBodyTab | iframe sandbox for HTML/image/video/audio |
| `BodyVisualizeView` | inside ResponseBodyTab | Renders HTML string from pm.visualizer.set() |
| `ResponseSearchBar` | inside ResponseBodyTab | Text search across body with match count + nav |
| `ResponseFilterBar` | inside ResponseBodyTab | JSONPath / XPath filter input; renders filtered result |
| `ResponseHeadersTab` | inside ResponsePanel | Key-value table of response headers with HTTP spec tooltips |
| `ResponseCookiesTab` | inside ResponsePanel | Cookie table per domain; links to cookie manager |
| `ResponseTestResultsTab` | inside ResponsePanel | Pass/fail list per pm.test(); summary count badge |
| `ResponseConsoleTab` | inside ResponsePanel | console.log output from scripts |
| `NetworkInfoPopover` | inside ResponseMetaBar | IP + TLS info on hover over network icon |
| `RedirectChainBadge` | inside ResponseMetaBar | Shows "N redirects" with expand to see chain |
| `SaveResponseButton` | inside ResponsePanel toolbar | Save response as Example or to file |
| `CopyResponseButton` | inside ResponsePanel toolbar | Copy body to clipboard |

### 3.2 TypeScript Interfaces

```typescript
interface ResponseSnapshot {
  status_code: number;
  status_text: string;
  headers: { key: string; value: string }[];
  body: string;
  body_size_bytes: number;
  duration_ms: number;
  redirects: { status_code: number; url: string }[];
  tls: { protocol: string; cipher: string; cert_valid: boolean } | null;
  console_logs: string[];
  body_truncated: boolean;
}

// ResponseMetaBar
interface ResponseMetaBarProps {
  statusCode: number;
  statusText: string;
  durationMs: number;
  bodySizeBytes: number;
  headerSizeBytes: number;
  redirectCount: number;
  tls: ResponseSnapshot["tls"];
  networkInfo: { localIp: string; remoteIp: string } | null;
}

// ResponseBodyTab
type BodyViewMode = "pretty" | "raw" | "preview" | "visualize";
type BodyFormatType = "JSON" | "XML" | "HTML" | "Text" | "Auto";

interface ResponseBodyTabProps {
  body: string;
  bodyTruncated: boolean;
  contentType: string;     // from response headers; used to auto-select format
  visualizerHtml: string | null;  // set by pm.visualizer.set() in test script
}

// ResponseTestResultsTab
interface TestResult {
  name: string;
  passed: boolean;
  error: string | null;
  duration_ms: number;
}

interface ResponseTestResultsTabProps {
  results: TestResult[];
}
```

### 3.3 Render Descriptions

**ResponsePanel** — renders only after a request has been sent (not on initial load). Tabs: Body | Headers | Cookies | Test Results | Console. Tab header shows test results count badge when tests present.

**ResponseMetaBar** — always visible above tabs. Left: status code badge (color-coded: 2xx green, 3xx blue, 4xx yellow, 5xx red). Middle: time (e.g. `145 ms`), size (e.g. `4.2 KB` — hover → "Body: 4.0 KB / Headers: 0.2 KB"). Right: network icon (hover → NetworkInfoPopover). Redirect chain badge if `redirects.length > 0`.

**NetworkInfoPopover** — on hover: local IP, remote IP, HTTP version, TLS protocol, cipher, cert valid/invalid indicator.

**ResponseBodyTab** — top row: view mode radio (Pretty / Raw / Preview / Visualize). Next to that: format dropdown (Auto / JSON / XML / HTML / Text). Then: search icon, filter icon.
- Pretty: syntax-highlighted read-only CodeMirror (JSON prettified, XML prettified). Has expand/collapse for JSON objects.
- Raw: monospace plain textarea, no formatting.
- Preview: iframe `srcdoc` with response body. Sandboxed (`sandbox="allow-scripts"`). Shown for HTML responses by default.
- Visualize: renders `pm.visualizer.set(template, data)` output as HTML in iframe. Only active when test script calls visualizer.

**ResponseSearchBar** — opens inline above body content. Ctrl+F shortcut. Highlights all matches, shows "1 of N". Arrow keys navigate between matches.

**ResponseFilterBar** — opens when filter icon clicked. Input for JSONPath expression (e.g. `$.users[*].name`) or XPath (e.g. `//user/name`). Renders filtered result in new read-only block below. Errors shown inline.

**ResponseHeadersTab** — table: Name | Value. Info icon next to header name → tooltip with HTTP spec description (use a static map of common headers). Right-click row → Copy header value.

**ResponseCookiesTab** — cookies set by this response. Table: Name | Value | Domain | Path | Expires | HttpOnly | Secure. "Open Cookie Manager" link → full cookie jar modal.

**ResponseTestResultsTab** — summary line: "X / Y tests passed". List of test results: green check / red X, test name, error message if failed. Expandable per test.

**ResponseConsoleTab** — list of `console_logs` from script execution. Each entry: log level icon (log/warn/error), message text, timestamp. Empty state: "No console output."

**SaveResponseButton** — dropdown: "Save as Example" (creates RequestExample, spec 22-test-cases) | "Save to File" (downloads raw body as file with correct extension).

---

## 4. Auto-Format Detection

Content-Type header → default format mode:

| Content-Type | Auto Format | Default View Mode |
|---|---|---|
| `application/json` | JSON | Pretty |
| `application/xml`, `text/xml` | XML | Pretty |
| `text/html` | HTML | Preview |
| `image/*` | — | Preview |
| `audio/*`, `video/*` | — | Preview |
| `text/plain` | Text | Raw |
| Other / missing | Text | Raw |

User selection overrides auto-detect and persists for current session.

---

## 5. Business Logic

### Status Code Color Rules
- 1xx: grey
- 2xx: green
- 3xx: blue
- 4xx: orange
- 5xx: red
- Network error / timeout: red with error icon

### Body Size Display
- < 1 KB: show bytes (e.g. `843 B`)
- 1 KB – 1 MB: `X.X KB`
- > 1 MB: `X.X MB`
- Hover breakdown: Body + Headers separate

### Body Truncation Warning
When `body_truncated: true`, show banner above body: "Response body truncated at 10 MB. Download full response to view."

### JSONPath / XPath Filter
- JSONPath: use `jsonpath-plus` library (already common, small bundle)
- XPath: use native browser `document.evaluate()` on a parsed XML document
- Filter result rendered as prettified JSON or XML
- Error state: red border + inline error message

---

## 6. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Response is empty body (204 No Content) | Show "No body returned" placeholder instead of empty editor |
| 2 | Response body is binary (PDF/image) | Offer download link; don't render garbage in pretty/raw |
| 3 | HTML response with cross-origin resources in preview | iframe is sandboxed; external resources blocked; note shown |
| 4 | pm.visualizer.set() not called — Visualize tab active | Show "No visualizer output" placeholder |
| 5 | Large JSON (> 500 KB) in pretty mode | Lazy render / virtual scroll; don't parse full JSON synchronously |
| 6 | JSONPath expression matches nothing | Show empty result with message "No matches found" |
| 7 | TLS cert invalid but ssl_verification=false | Show warning badge on network icon "Certificate not verified" |
| 8 | Redirect from HTTPS → HTTP | Show warning in redirect chain badge |
| 9 | Set-Cookie header present but cookie manager blocked | Show cookie in tab but note "Blocked by cookie settings" |
| 10 | Body contains `<script>` in preview iframe | Sandboxed iframe prevents execution; safe |

---

## 7. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Pretty mode editor | CodeMirror 6 read-only | Consistent with request body editor; already in bundle |
| 2 | JSONPath library | `jsonpath-plus` | Widely used, supports full JSONPath spec, small bundle |
| 3 | XPath | Native `document.evaluate()` | Zero bundle cost; browsers support it natively |
| 4 | HTML preview | sandboxed iframe `srcdoc` | Safe; no external network requests from preview frame |
| 5 | Binary response handling | Show download link, skip body render | Avoid decoding binary as UTF-8 string |
| 6 | Body truncation threshold | 10 MB (matches engine limit) | Consistent with ResponseSnapshot spec |
| 7 | Cookies persistence | Cookie jar in backend (spec 22-security) | Shared across requests in session |

---

## 8. Deferred Items

| Item | Reason |
|---|---|
| Postman Console (global, footer panel) | Separate from response console tab; tracks all requests — future feature |
| GraphQL response — field-level diffing | GraphQL-specific; tracked in spec 17-graphql |
| WebSocket message log viewer | Separate protocol; tracked in spec 18-websocket |
| Performance metrics overlay (p50/p95) | Collection runner / performance testing only |
| AI-powered visualizer suggestions (Postbot) | AI features dropped |
