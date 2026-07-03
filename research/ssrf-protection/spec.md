# Spec — SSRF Protection

STATUS: done
LAST_CHANGED: 2026-06-16

## Rule
Every outbound network call (HTTP, WS, SSE, gRPC, SOAP, OAuth, $ref fetch) MUST call `assert_safe_url()` before connecting.

## assert_safe_url Contract
- Raises `ValueError` with reason when blocked
- Caller must catch + return 400 with safe message
- `SSRF_ALLOWLIST` env var (comma-separated IPs/CIDRs) overrides for trusted internal services (Docker networking)
