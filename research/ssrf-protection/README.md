# SSRF Protection

Status: Existing
Coverage: 95%

## Implemented
- `ssrf.py` — `assert_safe_url()`: blocks private CIDR, link-local, 169.254, metadata IPs; DNS resolution + pin; `SSRF_ALLOWLIST` env override
- Applied in: `execute_direct.py`, `ws_proxy.py`, `sse_proxy.py`, `routers/auth/oauth2.py`, `routers/spec/import_spec.py` ($ref URLs)

## Missing
- Nothing material

## Current Task
None

## Next Task
Ensure applied in all future proxy/outbound endpoints (grpc, soap when shipped)

## Dependencies
None (foundation)

## Priority
P0 (done)
