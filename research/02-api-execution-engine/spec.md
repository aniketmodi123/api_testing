# Spec — API Execution Engine

STATUS: updated (REDO complete)
LAST_CHANGED: 2026-06-17

---

## 1. Feature Overview

The execution engine is the backend subsystem that takes a fully-assembled request (method, URL, headers, body, auth, settings) and sends it to the target server. It is not a user-facing feature — it is the shared core called by:
- Direct send (single request from builder)
- Collection runner (batch execution)
- Flows engine (workflow step)
- Monitors (scheduled runs)
- `pm.sendRequest()` / `pm.execution.runRequest()` from scripts

Postman executes scripts in a sandbox (Node.js-based). APIPilot runs scripts via a sandboxed JS runtime. The execution engine owns: variable resolution, auth injection, SSRF guard, outbound HTTP, response snapshot capture, console log capture, and history persistence.

---

## 2. DB Models

### RequestHistory (existing — verify fields)
```
RequestHistory
  id              UUID PK
  api_id          FK → Api
  file_id         FK → File (workspace context)
  user_id         FK → User
  request_snapshot   JSON    full resolved request (method, url, headers, body)
  response_snapshot  JSON    see schema below
  executed_at     datetime
  duration_ms     int
  status_code     int
  error           str nullable   if request failed entirely (timeout, DNS, SSRF block)
```

### ResponseSnapshot JSON schema
```json
{
  "status_code": 200,
  "status_text": "OK",
  "headers": [{ "key": "Content-Type", "value": "application/json" }],
  "body": "str",
  "body_size_bytes": 1234,
  "duration_ms": 123,
  "redirects": [
    { "status_code": 301, "url": "https://..." }
  ],
  "tls": {
    "protocol": "TLSv1.3",
    "cipher": "str",
    "cert_valid": true
  },
  "console_logs": ["str"]
}
```

---

## 3. Backend Files (existing)

| File | Purpose |
|---|---|
| `backend/src/routers/runner/execute_direct.py` | HTTP handler — assembles, calls engine, persists history |
| `backend/src/http_client.py` | `get_http_client()` — pooled AsyncClient, TLS flag, timeout |
| `backend/src/ssrf.py` | SSRF guard — called before every outbound request |
| `backend/src/auth_strategies.py` | Auth injection per auth type |
| `backend/src/utils.py` | `resolve_variables()` — variable substitution |

---

## 4. Execution Lifecycle (full order)

```
For a single request send:

1.  RESOLVE VARIABLES
    resolve_variables(url, headers, body, path_vars, env, collection_vars, global_vars)
    Resolution precedence (highest → lowest):
      local > data > environment > collection > global
    {{vault:secret-name}} resolved separately via vault lookup

2.  RUN PRE-REQUEST SCRIPT (if present)
    Sandboxed JS execution — can mutate: pm.variables, pm.environment, pm.collectionVariables
    Can call: pm.sendRequest() — async sub-request inside script
    Can import: npm/JSR packages via pm.require("npm:package@version")
    Can call: pm.execution.skipRequest() — abort this request entirely
    After script: re-resolve variables (script may have set new values)

3.  INJECT AUTH
    apply_auth(request, auth_config) → mutates headers / query params per auth type

4.  SSRF GUARD
    assert_safe_url(final_url) → raises if private IP / metadata endpoint

5.  APPLY REQUEST SETTINGS
    timeout_ms: from extra_meta.settings.timeout (0 = no timeout)
    follow_redirects: bool
    ssl_verification: bool
    encode_url: bool (URL-encode path/query before send)

6.  SEND
    client = get_http_client()
    response = await client.request(method, url, headers, body, follow_redirects, timeout, verify)
    Track redirects chain for response snapshot

7.  CAPTURE RESPONSE SNAPSHOT
    Build ResponseSnapshot — status, headers, body (max 10 MB), duration_ms, redirects, TLS info

8.  RUN TEST SCRIPT (if present)
    Sandboxed JS — receives pm.response, pm.request
    pm.test() calls → TestResult[]
    pm.environment.set() / pm.variables.set() side effects applied

9.  PERSIST HISTORY
    Write RequestHistory row (request_snapshot + response_snapshot + test_results)

10. RETURN
    ResponseSnapshot + TestResult[] to caller (builder, runner, flow engine)
```

### Collection / Folder execution order (collection runner only)
```
Collection pre-request script
  → Folder pre-request script
    → Request pre-request script
      → [steps 3–7 above]
    → Request test script
  → Folder test script
→ Collection test script
```

---

## 5. Variable Resolution Detail

Resolution order (narrowest wins):

| Scope | Set by | Example |
|---|---|---|
| local | `pm.variables.set()` in script | temporary, request-scoped only |
| data | data file row (collection runner) | CSV/JSON iteration value |
| environment | active environment | `{{base_url}}` |
| collection | collection variables panel | shared collection-level default |
| global | global variables | cross-workspace fallback |

`{{vault:secret-name}}` — special prefix; resolved via VaultSecret lookup, never echoed in logs.

Unresolved `{{var}}` tokens: sent literally to server. UI highlights in red (spec 04-variables).

---

## 6. Script Sandbox (APIPilot)

Postman uses the `postman-sandbox` npm package. APIPilot should do the same — embed `postman-sandbox` in a Node.js subprocess that the Python backend spawns per request.

### pm.* APIs to support (minimum viable)

| API | Purpose |
|---|---|
| `pm.variables.get(key)` | Get variable by key (respects scope precedence) |
| `pm.variables.set(key, val)` | Set local-scope variable |
| `pm.environment.get/set/unset` | Read/write active environment |
| `pm.collectionVariables.get/set/unset` | Read/write collection vars |
| `pm.globals.get/set/unset` | Read/write global vars |
| `pm.request` | Read-only request object (pre-request can modify via pm.request.headers etc.) |
| `pm.response` | Read-only response object (test script only) |
| `pm.test(name, fn)` | Register test assertion |
| `pm.expect` | Chai-based assertion |
| `pm.sendRequest(url, callback)` | Async sub-request from script |
| `pm.execution.setNextRequest(name)` | Collection runner: set next request |
| `pm.execution.skipRequest()` | Pre-request: abort this request |
| `pm.execution.runRequest(id, opts?)` | Run a saved request by ID (max 10/script) |
| `pm.require("npm:pkg@ver")` | Import external npm/JSR package |
| `console.log/warn/error` | Captured to response console_logs |

### pm.require implementation
Packages fetched from npm registry at first use, cached in local store. APIPilot: cache in `~/.apipilot/packages/` or temp dir. Sandbox mode: `npm:` and `jsr:` prefixes supported.

---

## 7. Redirect Handling

| Setting | Behavior |
|---|---|
| `follow_redirects: true` (default) | Follow all 3xx automatically |
| `follow_redirects: false` | Return 3xx response directly, no follow |
| Default method on redirect | GET (standard browser behavior for 301/302) |
| Method preservation on 307/308 | Preserve original method — httpx handles this correctly |
| "Follow original HTTP method" | Per-request setting override: preserve method on 301/302 too |

httpx default: follows redirects but changes POST→GET on 301/302. Set `follow_redirects=True` and httpx handles 307/308 method preservation automatically.

---

## 8. SSRF Guard (existing — document fully)

Block outbound requests to:
- Private IP ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `::1`
- Cloud metadata endpoints: `169.254.169.254`, `fd00:ec2::254`
- `0.0.0.0`, `localhost`

Resolution: resolve hostname to IP before guard check (DNS rebinding protection). Error response: 400 with `"URL not allowed"` — no internal detail.

---

## 9. New Backend Work Required

### A. Extract `send_request()` (CRITICAL — blocks Flows)

Refactor `execute_direct.py` to extract a pure async function:

```python
# backend/src/engine/send_request.py  (new file)

async def send_request(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None,
    content_type: str | None,
    settings: RequestSettings,
) -> ResponseSnapshot:
    assert_safe_url(url)
    client = get_http_client()
    resp = await client.request(
        method=method,
        url=url,
        headers=headers,
        content=body,
        follow_redirects=settings.follow_redirects,
        timeout=settings.timeout or None,
        verify=settings.ssl_verification,
    )
    return ResponseSnapshot(
        status_code=resp.status_code,
        status_text=resp.reason_phrase,
        headers=[{"key": k, "value": v} for k, v in resp.headers.items()],
        body=resp.text,
        body_size_bytes=len(resp.content),
        duration_ms=...,  # measure via time.perf_counter
        redirects=[{"status_code": r.status_code, "url": str(r.url)} for r in resp.history],
    )
```

`execute_direct.py` handler calls `send_request()` then persists history.
Flow engine calls `send_request()` directly.

### B. Script Sandbox Integration

Spawn Node.js subprocess running `postman-sandbox`. Pass request context as JSON stdin. Receive mutated variables + test results + console logs as JSON stdout. Timeout: 30 s max per script.

File: `backend/src/engine/script_runner.py`

```python
async def run_script(
    script: str,
    pm_context: PmContext,
    timeout_s: int = 30,
) -> ScriptResult:
    ...
```

### C. Console Log Capture

Scripts call `console.log()` inside sandbox. Sandbox emits logs to stdout as structured JSON. `script_runner.py` captures and appends to `ResponseSnapshot.console_logs`.

---

## 10. Modified Files

| File | Change |
|---|---|
| `backend/src/routers/runner/execute_direct.py` | Extract send_request(); call script_runner for pre/test scripts |
| `backend/src/engine/send_request.py` | **NEW** — pure send function |
| `backend/src/engine/script_runner.py` | **NEW** — sandboxed JS execution via postman-sandbox |
| `backend/src/models.py` | Verify RequestHistory has all fields; add console_logs to response_snapshot |

---

## 11. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Pre-request script sets var, but resolve_variables already ran | Re-resolve after pre-request script completes |
| 2 | pm.sendRequest() inside pre-request is async | Must await completion before proceeding to step 3 |
| 3 | pm.execution.skipRequest() called | Abort immediately, write history with status = "skipped", return empty response |
| 4 | Script exceeds 30s | Kill subprocess, return error in console_logs, proceed without script result |
| 5 | Response body > 10 MB | Truncate body in snapshot; set `body_truncated: true` flag |
| 6 | Redirect loop | httpx raises `TooManyRedirects` after 20 hops; catch, surface as error |
| 7 | SSRF DNS rebinding | Resolve hostname → IP check BEFORE request send, not at URL parse time |
| 8 | SSL verify=false with self-signed cert | Allowed per-request; log warning in console_logs |
| 9 | pm.require() package unavailable / private | Fail script with clear error: "package not found in npm/JSR" |
| 10 | Variable contains `{{nested {{var}}}}` | Resolve only outermost; nested `{{}}` not supported — document this |
| 11 | Auth token expired — 401 response | No auto-retry on 401 in direct send; collection runner may re-auth (future) |
| 12 | encode_url=false + special chars in URL | Send raw URL to httpx; server receives unencoded chars |

---

## 12. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Script sandbox | `postman-sandbox` npm via Node.js subprocess | DRY — same sandbox as Postman; no reimplementing pm.* |
| 2 | Sandbox communication | JSON over stdin/stdout | Simple, no IPC overhead for one-shot scripts |
| 3 | Script timeout | 30 s hard kill via subprocess timeout | Prevents runaway scripts from blocking request |
| 4 | send_request() extraction | New file `engine/send_request.py` | Flows engine imports directly; no HTTP handler dependency |
| 5 | Variable re-resolve after pre-request | Yes, always | Script may set vars that affect URL/headers/body |
| 6 | History persistence scope | Only in execute_direct handler, not in send_request() | send_request() is pure transport; callers decide whether to persist |
| 7 | Redirect method on 301/302 | Default: GET (httpx default) | Browser-compatible; "Follow original method" setting overrides |
| 8 | pm.require() package cache | Local disk cache per package@version | Avoid re-fetching on every request; npm package content is immutable |

---

## 13. Deferred Items

| Item | Reason |
|---|---|
| Auto-retry on 401 with token refresh | v1 scope; complex auth flow management |
| Multi-region execution routing | Monitor feature handles this separately |
| Request certificate (client cert per-request) | Tracked in spec 22-security |
| Postman CLI compatibility | APIPilot is not Postman CLI; Newman compat not required |
| pm.execution.runRequest() full support | Complex; depends on collection lookup; defer post-v1 |
