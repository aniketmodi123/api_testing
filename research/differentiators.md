# Differentiators — Beat Postman, Not Just Match It

LAST_UPDATED: 2026-06-15
GOAL: project must look + work **better** than Postman. Parity = table stakes; these are the edges.

> Each differentiator exploits something this codebase already has, or a structural advantage
> (self-hosted, own DB, own scheduler). Mapped to the phase that delivers it.

---

## The Edge Set

| # | Differentiator | Why Postman is weak here | Our advantage | Phase |
|---|---|---|---|---|
| X1 | **AI test-case + assertion generation** | Postman AI (Postbot) is paid + cloud-only | Repo already has JSON test-case generation guidelines (git history) + `ApiCase.expected` schema; generate cases+assertions from an endpoint/OpenAPI locally | phase_14 |
| X2 | **Scheduler-native monitors** | Postman monitors are a separate paid add-on, run-limited | Already have `bulk_test_schedules` + `schedule_alerts` + executions; surface as first-class Monitors with uptime/p95 free + unlimited | phase_10 |
| X3 | **Live {{var}} resolution preview + inline highlight** | Postman shows resolved value only on hover, no full-chain preview | Render resolved value across full scope chain (global→collection→env→local) inline as you type | phase_4 |
| X4 | **Regression diff vs last run** | Postman shows pass/fail, weak run-to-run diff | Have `bulk_test_results` snapshots (request/response/failures) → diff this run vs previous, highlight what changed | phase_7 |
| X5 | **Self-hosted secret vault** | Postman vault is cloud; enterprises distrust secrets in SaaS | Secrets encrypted at rest in *your* DB, never leave your infra; optional Vault/KMS backend | phase_1 |
| X6 | **Bidirectional cURL ⇄ OpenAPI ⇄ Collection** | Postman import is one-way-ish, lossy | Round-trip: paste cURL→request, request→cURL, OpenAPI→collection, collection→OpenAPI | phase_6 |
| X7 | **First-class Flow branching + chaining (free)** | Postman Flows is limited on free tier, separate surface | Native flow engine with conditional branch, jsonpath extract, run context — unlimited, integrated | phase_5 |
| X8 | **Folder-inherited headers/auth/vars** | Postman inheritance is shallow | Already have folder header inheritance (`get_headers` root→leaf merge); extend to auth + collection vars | phase_3/4 |
| X9 | **One-DB collaboration (no seat tax)** | Postman charges per editor seat | Self-hosted workspace members/roles already exist; unlimited collaborators | existing+phase_11 |
| X10 | **Built-in mock from real captured responses** | Postman mocks need manual example setup | Promote `request_history`/`bulk_test_results` snapshots directly into mock routes | phase_8 |

---

## Positioning Statement
> "Everything Postman does — request building, collections, variables, runner, monitors, mocks,
> flows, docs — **self-hosted, unlimited, with AI test generation and full-chain variable
> preview built in, and your secrets never leaving your infrastructure.**"

---

## Rule for Every Parity Feature
When building a parity feature, ship its differentiator edge in the same phase — never a bare clone.
The phase `spec.md` Decision Table must record which edge (X#) it carries.

---

## Validation Checklist — Differentiators
- [x] Each edge maps to an existing asset or structural advantage
- [x] Each edge assigned to a delivering phase
- [x] Positioning statement defined
- [x] Rule binding parity features to their edge
