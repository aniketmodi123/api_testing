# Research — SOAP

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_12_protocols/spec.md

## Design (when demand confirmed)
```
POST /api/soap-call
  Body: { wsdl_url, operation, params: {} }
  Auth: JWT
  SSRF: assert_safe_url on wsdl_url AND on endpoint URL extracted from WSDL
  Response: { result: {} }
  Dep: zeep (sync — must run in run_in_executor)
```

## Constraint
`zeep` is synchronous. Must wrap in `asyncio.get_event_loop().run_in_executor(None, fn)` to avoid blocking FastAPI event loop.
