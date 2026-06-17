# Spec — Security

STATUS: updated (REDO complete)
LAST_CHANGED: 2026-06-17

---

## 1. Feature Overview

Security covers two distinct concerns:

**A. APIPilot backend hardening** — already largely shipped (SSRF guard, TLS verification, Fernet encryption, structured logging, CORS).

**B. User-facing security features** — certificate management (CA certs + client certs), cookie jar, proxy settings, secret masking. These are Postman parity features that APIPilot's spec previously did not cover. This REDO documents both.

---

## 2. DB Models

### ClientCertificate (NEW)
```
ClientCertificate
  id              UUID PK
  user_id         FK → User CASCADE DELETE
  host_pattern    varchar(255)   e.g. "*.example.com" or "api.internal.com"
  port            int nullable   default 443
  crt_data        text nullable  PEM-encoded certificate (encrypted at rest)
  key_data        text nullable  PEM-encoded private key (encrypted at rest)
  pfx_data        bytes nullable alternate to crt+key; PKCS12 format (encrypted)
  passphrase      varchar(500) nullable  encrypted; used for pfx or key
  created_at      datetime
```

### CACertificate (NEW)
```
CACertificate
  id              UUID PK
  user_id         FK → User CASCADE DELETE
  label           varchar(255)
  pem_data        text           PEM file content (may contain multiple certs); encrypted at rest
  enabled         bool default true
  created_at      datetime
```

### CookieJar (NEW — or integrate into existing session)
```
Cookie
  id              UUID PK
  user_id         FK → User
  domain          varchar(255)
  name            varchar(255)
  value           text
  path            varchar(255)   default "/"
  expires         datetime nullable
  http_only       bool
  secure          bool
  created_at      datetime
  updated_at      datetime
  UNIQUE(user_id, domain, name, path)
```

---

## 3. Backend Endpoints

### Existing (no change)

| Method | Path | Purpose |
|---|---|---|
| — | `ssrf.py` | `assert_safe_url()` called in execute_direct, ws_proxy, sse_proxy, OAuth2, spec import |
| — | `http_client.py` | Pooled AsyncClient; `OUTBOUND_VERIFY_TLS` flag |
| — | `vault.py` | Fernet encrypt/decrypt for secrets |
| — | `security.py` | JWT middleware; structured logging (no PII) |

### New — Certificate Management

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/certificates/client` | user | List user's client certificates |
| POST | `/certificates/client` | user | Add client certificate |
| DELETE | `/certificates/client/{id}` | user | Delete client certificate |
| GET | `/certificates/ca` | user | List CA certificates |
| POST | `/certificates/ca` | user | Add CA certificate |
| PATCH | `/certificates/ca/{id}` | user | Enable/disable CA cert |
| DELETE | `/certificates/ca/{id}` | user | Delete CA certificate |

### New — Cookie Management

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/cookies` | user | List all cookies (grouped by domain) |
| POST | `/cookies` | user | Add manual cookie |
| PATCH | `/cookies/{id}` | user | Edit cookie |
| DELETE | `/cookies/{id}` | user | Delete cookie |
| DELETE | `/cookies/domain/{domain}` | user | Clear all cookies for domain |
| DELETE | `/cookies` | user | Clear all cookies |

### POST /certificates/client — Request Schema
```json
{
  "host_pattern": "*.example.com",
  "port": 443,
  "crt_file": "<base64>",
  "key_file": "<base64>",
  "pfx_file": "<base64 | null>",
  "passphrase": "str | null"
}
```
Note: crt_data, key_data, pfx_data encrypted with Fernet before DB write.

### POST /certificates/ca — Request Schema
```json
{
  "label": "My Corp CA",
  "pem_data": "-----BEGIN CERTIFICATE-----\n..."
}
```

---

## 4. Frontend Components

### 4.1 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `CertificateSettingsPage` | `frontend/src/pages/Settings/CertificateSettings/` | Root page; CA certs + client certs sections |
| `CACertList` | inside CertificateSettingsPage | List of CA certs with enable/disable toggle + delete |
| `AddCACertModal` | inside CertificateSettingsPage | Upload PEM file + label input |
| `ClientCertList` | inside CertificateSettingsPage | List of client certs with host pattern + delete |
| `AddClientCertModal` | inside CertificateSettingsPage | Host, port, file uploads (CRT+KEY or PFX), passphrase |
| `CookieManagerModal` | `frontend/src/components/CookieManager/` | Full cookie jar — domain list + cookie table |
| `CookieDomainGroup` | inside CookieManagerModal | Expandable domain row with cookie list |
| `AddCookieForm` | inside CookieManagerModal | Add manual cookie form |
| `ProxySettingsPage` | `frontend/src/pages/Settings/ProxySettings/` | Global proxy config (deferred — see §8) |

### 4.2 TypeScript Interfaces

```typescript
interface ClientCertificate {
  id: string;
  host_pattern: string;
  port: number;
  has_crt: boolean;   // show file presence without exposing data
  has_key: boolean;
  has_pfx: boolean;
  created_at: string;
}

interface CACertificate {
  id: string;
  label: string;
  enabled: boolean;
  created_at: string;
}

interface Cookie {
  id: string;
  domain: string;
  name: string;
  value: string;
  path: string;
  expires: string | null;
  http_only: boolean;
  secure: boolean;
}
```

### 4.3 Render Descriptions

**CertificateSettingsPage** — two sections: "CA Certificates" (toggle + PEM file upload) and "Client Certificates" (per-domain certs). Each section has an "Add" button and a list.

**AddClientCertModal** — fields: Host (text input with hint "*.example.com"), Port (number, default 443), CRT File picker, KEY File picker (or) PFX File picker toggle, Passphrase (password input). Validate: at minimum host + either (CRT+KEY) or PFX. Submit → POST /certificates/client.

**CookieManagerModal** — accessible from response cookies tab "Open Cookie Manager" link, or from global settings. Left panel: domain list. Right panel: cookie table for selected domain (Name, Value, Path, Expires, HttpOnly, Secure, Actions). Add button → inline form. Clear domain button → DELETE /cookies/domain/{domain}.

---

## 5. Business Logic

### Certificate Matching (client certs)
When a request is about to be sent to an HTTPS URL:
1. Extract hostname from URL.
2. Query `ClientCertificate` where `host_pattern` matches hostname (glob match: `fnmatch` or similar).
3. If multiple match, use most specific (longest non-wildcard prefix).
4. Decrypt `crt_data` + `key_data` (or `pfx_data`) → pass to httpx as `cert=` parameter.
5. If no match, send without client cert.

### CA Certificate Injection
On each outbound request:
1. Load all enabled `CACertificate` records for user.
2. Combine PEM data into a single temp file.
3. Pass to httpx as `verify=<path>` (overrides global `OUTBOUND_VERIFY_TLS`).
4. If `ssl_verification=false` on the request → `verify=False` always wins.

### Cookie Jar
- Cookies sent automatically for matching domain if `disable_cookies=false` on request.
- `Set-Cookie` response headers → parsed, stored/updated in `Cookie` table.
- `Secure` cookies only sent on HTTPS requests.
- `expires < now` → skip cookie, mark for cleanup.
- `HttpOnly` has no effect on APIPilot behavior (browser-only concept).

### Secret Masking in Logs
- Any `extra_meta` field where key matches known secret patterns (Authorization, x-api-key, token, secret, password, key) → value replaced with `***` in logs.
- Fernet-encrypted values (`v1:...`) never logged raw — log `<encrypted>`.
- `console_logs` from scripts: scan for values matching known vault secrets → replace with `<masked>`.

### SSRF Guard (existing — fully documented)
```
Blocked:
  10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16  (private)
  127.0.0.0/8, ::1                             (loopback)
  169.254.0.0/16                               (link-local)
  169.254.169.254, fd00:ec2::254               (cloud metadata)
  0.0.0.0

DNS rebinding protection:
  Resolve hostname → IP BEFORE URL is passed to httpx
  Re-check IP after resolution (not just at parse time)

Allowlist:
  SSRF_ALLOWLIST env var: comma-separated IPs/CIDRs
```

Error response: HTTP 400, body `{"detail": "URL not allowed"}`. No internal reason exposed.

---

## 6. Validation Rules

| Field | Rule |
|---|---|
| `host_pattern` | Non-empty; valid hostname or glob (no protocol, no path) |
| `port` | 1–65535; default 443 |
| CRT+KEY files | Both required if PFX not provided; PEM format validated |
| PFX file | PKCS12 format; passphrase required if encrypted |
| CA PEM file | Valid PEM; may contain multiple certs |
| Cookie `domain` | Non-empty; no protocol prefix |
| Cookie `expires` | ISO 8601 datetime or null |

---

## 7. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Client cert private key exposed in API response | Never return crt_data/key_data/pfx_data — only `has_crt: bool` flags |
| 2 | Multiple client certs match same host | Most-specific match wins (longest non-wildcard prefix) |
| 3 | CA cert file has expired cert inside it | httpx may still accept; warn but don't block upload |
| 4 | ssl_verification=false + CA cert configured | ssl_verification=false always wins — skip CA cert injection |
| 5 | Fernet key rotated — old certs unreadable | Document rotation procedure; migration script re-encrypts |
| 6 | Cookie with past expiry sent | Check expires before sending; skip expired cookies |
| 7 | Set-Cookie in redirect response | Parse and store cookies from ALL redirect hops, not just final response |
| 8 | Secret in request body logged | Body is stored in request_snapshot but values matching secret patterns masked |
| 9 | Passphrase for PFX wrong | httpx raises ssl.SSLError; surface as "Certificate passphrase incorrect" |
| 10 | Host pattern `*` (wildcard all) | Reject — too broad; require at least one domain component |

---

## 8. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Migration tool | Alembic (still deferred) | Requires DB access + ops coordination |
| 2 | Cert data encryption | Fernet (same as vault) | Reuse existing `vault.py` encrypt/decrypt |
| 3 | CA cert injection | Temp file per request | httpx `verify=` accepts path; multiple certs combined into one PEM |
| 4 | Client cert matching | `fnmatch` glob | Simple, handles `*.example.com`; no regex complexity |
| 5 | Cookie persistence | DB table (`Cookie`) | Shared across requests; user can manage; survives sessions |
| 6 | Secret log masking | Regex on key names | Covers 95% of cases without parsing value format |
| 7 | Proxy settings | Global only (deferred per-request) | Global covers almost all use cases; per-request adds complexity for v1 |

---

## 9. Deferred Items

| Item | Reason |
|---|---|
| Alembic migration baseline | Requires DB access + ops coordination |
| Proxy settings UI (global + per-request) | Global proxy config UI deferred; env-var level for now |
| Third-party vault integrations (1Password, AWS, Azure, HashiCorp) | Tracked in spec 24-secrets-vault |
| Secret scanning (scan repo/collection for leaked keys) | Postman feature; out of scope for v1 APIPilot |
| SameSite cookie attribute | Postman doesn't support it; APIPilot matches |
| `__Secure-` / `__Host-` cookie prefixes | Same — out of scope |
| 2FA for APIPilot accounts | Auth hardening; tracked in spec 25-administration |
| CORS configuration for published APIs | Server responsibility; APIPilot is client-side tool |
| Scheduler `SELECT FOR UPDATE SKIP LOCKED` | Separate process; coordinate with scheduler work |
