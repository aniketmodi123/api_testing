# Spec — SOAP

STATUS: not-started (gated on demand)
LAST_CHANGED: 2026-06-16

## Goal
SOAP calls via WSDL parse + XML envelope builder. Gated on confirmed user demand.

## Key Design Notes
- SSRF on both wsdl_url AND the endpoint URL extracted from WSDL (two checks)
- zeep is sync → run_in_executor required
- Ship only after gRPC confirmed shipped and SOAP demand verified
