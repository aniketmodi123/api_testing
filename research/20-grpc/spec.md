# Spec — gRPC

STATUS: not-started (gated on demand)
LAST_CHANGED: 2026-06-16

## Goal
gRPC unary calls via uploaded proto file. Gated on confirmed user demand.

## When Ready to Implement
1. Add `grpcio` + `grpcio-tools` to requirements.txt
2. Create `ProtoFile` model + migration
3. `POST /api/grpc-call` — load proto, create channel, call unary method
4. SSRF guard on host
5. FE gRPC panel

## Decision
gRPC ships only after SSE ships and real gRPC demand is confirmed (O5).
