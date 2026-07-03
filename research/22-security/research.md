# Research — Security

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_0_platform_hardening/research.md + phases/phase_1_secrets_vault/research.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/ssrf.py` | `assert_safe_url(url)` — resolve host, reject private/link-local/metadata |
| `backend/src/http_client.py` | `get_http_client()` singleton AsyncClient; pooled, TLS flag |
| `backend/src/vault.py` | `encrypt(v)`, `decrypt(v)`, `is_ciphertext()` Fernet impl; `v1:` prefix |
| `backend/src/security.py` | JWT auth middleware; structured logging (no PII) |
| `backend/src/config.py` | `OUTBOUND_VERIFY_TLS`, `CORS_ORIGINS`, `SECRET_ENC_KEY` env vars |
| `backend/src/main.py` | CORS config; startup fail-fast for `SECRET_ENC_KEY` |
| `backend/.env.example` | All required env vars documented |

## SSRF Guard Logic
```python
# ssrf.py — assert_safe_url(url):
# 1. Parse URL → extract hostname
# 2. Resolve hostname to IP (dns.resolver or socket.getaddrinfo)
# 3. Check if IP is private (10.x, 172.16-31.x, 192.168.x), link-local (169.254.x), loopback, metadata (169.254.169.254)
# 4. Check SSRF_ALLOWLIST env (comma-separated IPs/CIDRs)
# 5. Raise ValueError if blocked → caller returns 400
```

## Vault Logic
```python
# vault.py:
# - Fernet symmetric encryption (AEAD)
# - Version prefix "v1:" on ciphertext
# - is_ciphertext(v): checks for "v1:" prefix
# - Legacy plaintext passthrough: decrypt passes through if not ciphertext
# - Key from SECRET_ENC_KEY env (base64 Fernet key)
```

## Gotchas
| # | Thing | Fix |
|---|---|---|
| 1 | DNS rebinding bypasses CIDR check | Resolve + pin IP, re-check after resolve |
| 2 | verify=False appeared in execute_direct | Fixed — now uses http_client singleton with OUTBOUND_VERIFY_TLS |
| 3 | public_routes is exact-match set | `/m/` and `/docs/` exemptions use prefix check |
