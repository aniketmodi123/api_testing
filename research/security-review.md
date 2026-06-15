# Phase 8 — Security Review

LAST_UPDATED: 2026-06-15
SEVERITY: Critical · High · Medium · Low

> Findings against the *current* codebase + requirements for new features. Each finding:
> evidence, risk, remediation. Drives security gates in validation-framework.md.

---

## Findings (current code)

### Critical
| ID | Finding | Evidence | Risk | Remediation |
|---|---|---|---|---|
| S1 | Secrets stored plaintext | `Environment.variables` JSON, `GlobalVariable.value`; `is_secret` only masks display | DB dump / backup leaks all tokens | Encrypt secret values at rest (Fernet/KMS); decrypt only at resolve; never return raw to client |
| S2 | No migrations → unsafe schema change | `create_all` on startup | data loss on ALTER, no rollback | Adopt Alembic; expand→migrate→contract |

### High
| ID | Finding | Evidence | Risk | Remediation |
|---|---|---|---|---|
| S3 | TLS verification disabled outbound | `verify=False` in execute_direct/clients | MITM against real target APIs | Config flag; default verify=True; per-request opt-out only |
| S4 | CORS fully open | `allow_origins=["*"]` | CSRF-ish abuse from any origin | Restrict to known origins in prod |
| S5 | Secret values round-trip to client | masking server-side only; bearer token set in FE header state | XSS/exfil exposure | Keep secrets server-side; inject at send, return masked refs |
| S6 | Error/JWT details via `print` | `print(f"JWT decode error...")` | info leak to stdout, no audit trail | Structured logger, no sensitive payload |
| S7 | No action audit log | only `sso_verify_login` (login) | no forensic trail for mutations | `audit_logs` table + write on mutating endpoints |

### Medium
| ID | Finding | Evidence | Risk | Remediation |
|---|---|---|---|---|
| S8 | Identity trusts `username` header | middleware matches header to JWT claim but flow header-driven | spoof if claim check bypassed | Derive identity from JWT sub only; treat header as hint |
| S9 | No rate limiting (except OTP) | only `sso_otp_attempts` lockout | brute-force/login abuse, runner abuse | Add rate limiter (login, run, mock serve) |
| S10 | SSRF via runner/mock/proxy | execute_direct/ws_proxy/sse hit arbitrary URLs | internal network probing | Allow/deny-list, block private CIDRs, DNS pin |
| S11 | JWT no refresh/rotation documented | blacklist only on logout | long-lived token risk | Short TTL + refresh token flow |

### Low
| ID | Finding | Remediation |
|---|---|---|
| S12 | `god` superuser broad bypass | scope god powers, audit god actions |
| S13 | Invite token 7-day, single-use check | confirm single-use + revoke path |
| S14 | No CSP/security headers | add CSP, HSTS, X-Frame-Options at proxy |

---

## New-Feature Security Requirements
| Feature | Requirement |
|---|---|
| OAuth2 / API-key / AWS / JWT auth | secrets encrypted at rest; `oauth_tokens` ciphertext; never log tokens |
| Mock serve (public) | public_token unguessable (64 hex); rate-limit; no auth bypass leakage to private data |
| Public docs | published token scoped read-only; no secret values rendered |
| Flows | run context may hold secrets → mask in `flow_step_results`, audit run |
| Contract import | sanitize spec (no SSRF via `$ref` remote fetch) |
| Audit log | immutable/append-only; admin-read only; PII-min |
| gRPC/SOAP/SSE proxies | same SSRF guard as S10 |

---

## RBAC Review
| Aspect | State | Action |
|---|---|---|
| Workspace roles enforced | ✅ `can_access_workspace(min_role=)` in members | extend to ALL new endpoints (flows/mocks/specs/docs) |
| Node ownership | ✅ `verify_node_ownership` | reuse for collection vars/versions |
| Public routes | ✅ explicit set | add mock-serve + public-docs prefixes carefully |
| god bypass | present | audit + scope |

---

## Secrets & Encryption Plan
1. Introduce `SecretsProvider` interface (encrypt/decrypt).
2. MVP: Fernet key from env (`SECRET_ENC_KEY`); upgrade path → KMS/Vault.
3. Migration: add ciphertext, backfill encrypt, drop plaintext (expand→migrate→contract).
4. Resolution: decrypt only inside runner just before send; never serialize to client.

---

## Validation Checklist — Phase 8
- [x] Auth, authz, secrets, encryption, session, RBAC, audit reviewed
- [x] Every finding has severity + evidence + remediation
- [x] New-feature security requirements enumerated
- [x] SSRF risk flagged for all proxy/runner endpoints
- [x] Secrets/encryption migration plan defined
