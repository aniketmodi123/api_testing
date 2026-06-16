# Research — SSRF Protection

LAST_UPDATED: 2026-06-16

## Existing Code
See 22-security/research.md for full implementation details.

## Call Sites (where assert_safe_url is called)
| File | When called |
|---|---|
| `execute_direct.py` | Before every outbound HTTP send |
| `ws_proxy.py` | Before `websockets.connect()` |
| `sse_proxy.py` | Before `httpx.stream()` |
| `routers/auth/oauth2.py` | Before OAuth2 token_url fetch |
| `routers/spec/import_spec.py` | Before any external `$ref` URL resolution |

## Future Call Sites (must add when shipped)
| Feature | Where to add |
|---|---|
| gRPC (20-grpc) | Before channel creation |
| SOAP (21-soap) | Before wsdl_url fetch AND before endpoint URL from WSDL |
