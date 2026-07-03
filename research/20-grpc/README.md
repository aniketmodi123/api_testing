# 20 — gRPC

Status: Missing
Coverage: 0%

## Implemented
None

## Missing
- `POST /api/grpc-call` endpoint
- Proto file upload (`proto_files` table)
- gRPC unary call via uploaded proto
- SSRF guard on host
- FE gRPC panel

## Current Task
None — gated on demand (O5)

## Next Task
gRPC unary endpoint (when demand confirmed)

## Dependencies
- 22-security (SSRF guard)

## Priority
P3 — gated on demand

## Notes
Requires `grpcio` + `grpcio-tools` (~50MB image addition). Ship only when real demand confirmed.
