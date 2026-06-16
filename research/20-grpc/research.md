# Research — gRPC

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_12_protocols/spec.md

## Design (when demand confirmed)
```
POST /api/grpc-call
  Body: { host, port, service, method, message: {}, proto_b64 }
  Auth: JWT
  SSRF: assert_safe_url on host:port
  Response: { result: {} }
  Dep: grpcio, grpcio-tools
```

## New Model Needed
```
ProtoFile
  id, workspace_id(FK), name, content_b64
```

## Pattern
Reuse `ws_proxy.py` pattern for proxy structure. Reuse `ssrf.py` for host check.

## Constraint
`grpcio` adds ~50MB to Docker image. Evaluate before adding dep.
