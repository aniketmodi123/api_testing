# Phase 12 — Advanced Protocols — SSE, gRPC, SOAP

**Status:** not-started (stub)
**Phase:** 12
**Depends on:** Phase 0 (SSRF guard, shared client)
**Estimated scope:** full-stack · L

## What the user sees
Beyond existing GraphQL + WebSocket: Server-Sent Events streaming, gRPC unary calls (proto
upload), and SOAP (XML envelope + WSDL). Rounds out protocol parity with Postman.

## Deliverables (sub-ordered SSE → gRPC → SOAP)
- [ ] SSE proxy `/api/sse-proxy?target_url=` (reuse ws_proxy pattern) + FE SSEPanel
- [ ] gRPC unary `/api/grpc-call` + proto upload (`proto_files`) + FE panel
- [ ] SOAP `/api/soap-call` + WSDL parse + FE SOAP body mode
- [ ] Tests + SSRF guard on every proxy

## Tasks → Subtasks (this is a STUB — do T0 first; ship SSE first, gRPC/SOAP gated on demand O5)
- [ ] T0 Scaffold spec.md + research.md + test_matrix.md from this README + root docs
- [ ] T1 SSE proxy `/api/sse-proxy?target_url=` (reuse ws_proxy) + SSRF guard + FE SSEPanel
- [ ] T2 gRPC unary `/api/grpc-call` + proto upload (`proto_files`) + FE panel
- [ ] T3 SOAP `/api/soap-call` + WSDL parse + FE SOAP body mode
- [ ] T4 Tests + SSRF guard each proxy

## Reuse
`routers/runner/ws_proxy.py` (proxy pattern), `graphql_introspect.py` (introspection pattern), phase_0 SSRF guard.

## Definition of Done
Each protocol sends + renders a live response; all proxies SSRF-guarded. Ship SSE first (highest demand); gRPC/SOAP gated on real need (O5).
