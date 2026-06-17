# Spec — SOAP

STATUS: updated (REDO complete)
LAST_CHANGED: 2026-06-17

---

## 1. Feature Overview

SOAP support allows sending SOAP 1.1 and 1.2 requests to web services. Postman's approach: SOAP is implemented as an HTTP POST with XML body — there is no dedicated SOAP protocol layer. APIPilot matches this approach.

**Two levels of SOAP support:**

**Level 1 — HTTP + raw XML body** (minimal, reuses existing HTTP stack):
User manually writes SOAP envelope. APIPilot just needs to send `POST` with `Content-Type: text/xml` and correct headers. This ALREADY WORKS via the existing HTTP request builder with raw XML body.

**Level 2 — WSDL import + operation picker** (full parity):
Parse WSDL → list operations → auto-generate envelope template per operation → pre-fill request. This requires WSDL parsing with `zeep`. Gated on demand.

**Status:** Level 1 works today. Level 2 not started — gated on confirmed user demand.

---

## 2. SOAP 1.1 vs 1.2 Differences

| Property | SOAP 1.1 | SOAP 1.2 |
|---|---|---|
| Content-Type | `text/xml; charset=utf-8` | `application/soap+xml; charset=utf-8` |
| Envelope namespace | `http://schemas.xmlsoap.org/soap/envelope/` | `http://www.w3.org/2003/05/soap-envelope` |
| SOAPAction header | Required (can be empty string `""`) | Embedded in Content-Type as `action=` param |
| Fault element | `<soap:Fault>` with `<faultcode>/<faultstring>` | `<soap12:Fault>` with `<soap12:Code>/<soap12:Reason>` |
| Binding | `soap:binding` | `soap12:binding` |

---

## 3. DB Models

### WsdlFile (NEW — Level 2 only)
```
WsdlFile
  id              UUID PK
  workspace_id    FK → Workspace (or file_id FK → File)
  name            varchar(255)    e.g. "HelloWorldService.wsdl"
  content         text            raw WSDL XML content
  source_url      varchar(500) nullable   original URL if fetched remotely
  services        JSON            parsed service+operation list (cache)
  created_at      datetime
```

### SoapRequest (NEW — Level 2; Level 1 reuses existing Api model)
For Level 2, extend `Api.extra_meta` JSON with SOAP-specific fields:
```json
{
  "soap_mode": true,
  "wsdl_file_id": "uuid",
  "service": "HelloService",
  "port": "HelloServiceSoap",
  "operation": "SayHello",
  "soap_version": "1.1",
  "ws_security": {
    "enabled": false,
    "username": "str",
    "password": "str",
    "password_type": "PasswordText|PasswordDigest",
    "nonce": true,
    "timestamp": true
  }
}
```

No new DB model needed for requests — extend `Api.extra_meta`.

---

## 4. Backend Endpoints

### Level 1 — No new endpoints
SOAP 1.1/1.2 works via existing `POST /api/request/{id}/send` — send POST with XML body.

### Level 2 — WSDL endpoints (new)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/soap/wsdl` | user | Upload or fetch WSDL (by URL or file content) |
| GET | `/soap/wsdl` | user | List WSDL files in workspace |
| GET | `/soap/wsdl/{id}/operations` | user | Return parsed service/port/operation list |
| POST | `/soap/wsdl/{id}/envelope` | user | Generate envelope template for given operation |
| DELETE | `/soap/wsdl/{id}` | user | Delete WSDL file |

### POST /soap/wsdl — Request Schema
```json
{
  "name": "MyService.wsdl",
  "source": "url|content",
  "wsdl_url": "http://example.com/service?wsdl",
  "content": "<?xml version=..."
}
```

### GET /soap/wsdl/{id}/operations — Response Schema
```json
{
  "services": [
    {
      "name": "HelloService",
      "ports": [
        {
          "name": "HelloServiceSoap",
          "binding_style": "document|rpc",
          "soap_version": "1.1|1.2",
          "endpoint_url": "http://example.com/HelloService",
          "operations": [
            {
              "name": "SayHello",
              "soap_action": "http://example.com/SayHello",
              "input_parts": [{ "name": "str", "type": "str" }],
              "output_parts": [{ "name": "str", "type": "str" }]
            }
          ]
        }
      ]
    }
  ]
}
```

### POST /soap/wsdl/{id}/envelope — Request / Response
```
Request:
  service: str
  port: str
  operation: str

Response:
  envelope: str    pre-filled XML envelope template (placeholder values for required fields)
  soap_action: str
  endpoint_url: str
  soap_version: "1.1" | "1.2"
  content_type: str
```

---

## 5. Backend Implementation (Level 2)

### Python Library: `zeep`
```
zeep        WSDL parser + envelope generator (sync library)
lxml        XML processing (zeep dependency)
```

`zeep` is synchronous → must use `asyncio.get_event_loop().run_in_executor(None, fn)` for all zeep calls.

### WSDL Parse Flow
```python
# backend/src/routers/soap/wsdl_parser.py

def parse_wsdl(content: str) -> WsdlServiceList:
    client = zeep.Client(wsdl="data:text/xml;base64," + b64encode(content.encode()).decode())
    # extract services, ports, operations, types
    return WsdlServiceList(...)

async def parse_wsdl_async(content: str) -> WsdlServiceList:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, parse_wsdl, content)
```

### Envelope Generation
```python
def generate_envelope(wsdl_content: str, service: str, port: str, operation: str) -> str:
    client = zeep.Client(wsdl=...)
    # use zeep's serializer to generate template with placeholder values
    # replace actual values with "?" or type-annotated placeholders
    return xml_template_string
```

### SSRF Guards (BOTH required)
1. If `wsdl_url` provided → `assert_safe_url(wsdl_url)` before fetching WSDL
2. `endpoint_url` extracted from WSDL → `assert_safe_url(endpoint_url)` before sending request

This is the WSDL redirect attack vector: attacker provides WSDL pointing to internal service endpoint.

### Files
```
backend/src/routers/soap/
  wsdl_parser.py   zeep-based WSDL parsing (sync, run_in_executor)
  envelope.py      envelope template generation
  router.py        FastAPI router
```

---

## 6. Frontend Components (Level 2)

### 6.1 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `SoapRequestPanel` | inside existing RequestPanel (mode switch) | SOAP-specific UI overlaid on HTTP builder |
| `WsdlImportModal` | `frontend/src/components/WsdlImportModal/` | Upload WSDL file or enter WSDL URL |
| `WsdlOperationSelector` | inside SoapRequestPanel | Service → Port → Operation chained dropdowns |
| `SoapEnvelopeEditor` | inside SoapRequestPanel | Raw XML CodeMirror editor; pre-filled from envelope template |
| `WsSecurityPanel` | inside SoapRequestPanel | WS-Security UsernameToken config (if needed) |

### 6.2 TypeScript Interfaces

```typescript
interface WsdlOperation {
  service: string;
  port: string;
  operation: string;
  soap_action: string;
  endpoint_url: string;
  soap_version: "1.1" | "1.2";
}

interface SoapRequestConfig {
  wsdl_file_id: string | null;
  selected_operation: WsdlOperation | null;
  envelope: string;        // raw XML body
  ws_security: WsSecurityConfig | null;
}

interface WsSecurityConfig {
  enabled: boolean;
  username: string;
  password: string;
  password_type: "PasswordText" | "PasswordDigest";
  include_nonce: boolean;
  include_timestamp: boolean;
}
```

### 6.3 Render Descriptions

**SoapRequestPanel** — mode switch in URL bar: when SOAP mode active, hides HTTP method (always POST) and shows "WSDL" button. Below URL: service/port/operation dropdowns (if WSDL loaded). Generates envelope → pre-fills Body tab raw XML editor on operation select.

**WsdlImportModal** — toggle: "Enter URL" | "Upload File". URL input with "Fetch" button calls SSRF-guarded server endpoint. File input for local `.wsdl` upload. On success → stored as WsdlFile; operations populated in selector.

**SoapEnvelopeEditor** — CodeMirror XML mode. Pre-filled by operation selection. User edits placeholder values. Variables `{{var}}` highlighted. SOAPAction header auto-set as managed header (not editable inline).

**WsSecurityPanel** — collapsed by default. Toggle "Add WS-Security". Fields: Username, Password, Password Type (PasswordText/PasswordDigest), Include Nonce toggle, Include Timestamp toggle. On change → regenerates `<wsse:Security>` header block and injects into envelope `<soap:Header>`.

---

## 7. SOAPAction Header Handling

- SOAP 1.1: `SOAPAction: "http://..."` header — auto-set from WSDL operation, shown as managed header
- SOAP 1.2: SOAPAction embedded in Content-Type: `application/soap+xml; charset=utf-8; action="http://..."`
- Both auto-managed when WSDL-driven; user can override for manual mode

---

## 8. WS-Security Username Token

Generated XML block injected into `<soap:Header>`:
```xml
<wsse:Security xmlns:wsse="..." xmlns:wsu="...">
  <wsse:UsernameToken>
    <wsse:Username>user</wsse:Username>
    <wsse:Password Type="...#PasswordText">password</wsse:Password>
    <wsse:Nonce>base64nonce</wsse:Nonce>
    <wsu:Created>2026-06-17T00:00:00Z</wsu:Created>
  </wsse:UsernameToken>
</wsse:Security>
```
PasswordDigest = Base64(SHA1(Nonce + Created + Password)).
Nonce + Created generated fresh per request.

---

## 9. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | WSDL URL points to internal service (SSRF) | SSRF guard on wsdl_url before fetch |
| 2 | WSDL endpoint URL is internal IP | SSRF guard on extracted endpoint_url too |
| 3 | WSDL has imports/includes referencing other files | zeep fetches dependencies; each must pass SSRF guard |
| 4 | WSDL 1.1 vs 2.0 differences | zeep handles both; soap_version stored per-port |
| 5 | Zeep blocks event loop | All zeep calls in run_in_executor — never call sync zeep in async handler |
| 6 | XML envelope has variables `{{var}}` | Resolve variables before sending (execute_direct already does this) |
| 7 | SOAP Fault in response | Parse fault and surface in response viewer as structured error |
| 8 | SOAP 1.2 Content-Type with action param | Auto-set full content-type string including action= |
| 9 | WS-Security Nonce replay | Nonce generated fresh per request — server-side replay protection is server's concern |
| 10 | Large WSDL (complex enterprise services, 100+ operations) | Parse + cache operations JSON in WsdlFile.services; don't re-parse on every request |

---

## 10. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Level 1 SOAP | Works already — no new code | HTTP POST + raw XML body = standard SOAP |
| 2 | WSDL parser | `zeep` | Only mature Python WSDL parser; handles WSDL 1.1 + 2.0 |
| 3 | zeep async | `run_in_executor` | zeep is sync-only; mandatory to avoid blocking FastAPI |
| 4 | SOAP request model | Extend `Api.extra_meta` | Avoids new table; SOAP request IS just an HTTP POST |
| 5 | SSRF double-check | Guard WSDL URL + extracted endpoint URL | WSDL redirect attack is real; both must be checked |
| 6 | WS-Security | Manual header injection (not zeep auth) | More control; zeep's auth plugin adds complexity |
| 7 | Demand gate | Implement Level 2 only after confirmed demand | Same as gRPC gate — SOAP is niche; don't build speculatively |

---

## 11. Deferred Items

| Item | Reason |
|---|---|
| Level 2 WSDL import | Gated on confirmed user demand (same as gRPC) |
| WS-Security with X.509 certificates | Complex; cert-based SOAP auth is rare; defer |
| SOAP response XML tree viewer | Nice-to-have; raw XML already readable in response viewer |
| Import from SoapUI projects | Postman supports it; useful but low priority |
| Collection generation from WSDL | Level 2+ feature; post-demand confirmation |
| MTOM (binary SOAP attachments) | Very rare; not in scope |
