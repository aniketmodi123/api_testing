# 21 — SOAP

Status: Missing
Coverage: 0%

## Implemented
None

## Missing
- `POST /api/soap-call` endpoint
- WSDL parse
- XML envelope builder
- FE SOAP body mode

## Current Task
None — gated on demand (O5)

## Next Task
SOAP endpoint (when demand confirmed)

## Dependencies
- 22-security (SSRF guard on wsdl_url + endpoint URL)

## Priority
P3 — gated on demand

## Notes
Requires `zeep` library (sync). Must run in `run_in_executor` to avoid blocking event loop.
