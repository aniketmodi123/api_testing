# Research — Platform Hardening

LAST_UPDATED: 2026-06-15

## Existing Code to Reuse
| File | Function/Component | How to use |
|---|---|---|
| backend/src/utils.py | `logs(msg, type, file_name)` + `setup_logger` | structured logging already exists — replace `print` with this; do NOT add new lib |
| backend/src/config.py | `create_async_engine`, `SessionLocal`, env reads (`PRODUCTION_POSTGRES_*`) | Alembic env.py reuses this engine/URL |
| backend/src/main.py | `Base.metadata.create_all` on startup | keep for dev; Alembic owns prod schema; baseline-stamp this |
| routers/runner/execute_direct.py | `httpx.AsyncClient(timeout=..., verify=False, follow_redirects=True)` | replace with shared pooled client + verify flag |
| routers/runner/ws_proxy.py | `websockets.connect(target_url)` | wrap target_url through SSRF guard |

## Patterns in this Codebase
```python
# Logging already structured (utils.py) — reuse, don't reinvent:
from utils import logs
logs(f"jwt decode failed", type='error')        # NOT print(...)

# Current outbound (execute_direct.py) — centralize this:
async with httpx.AsyncClient(timeout=5.0, verify=False) as client: ...
# → settings.OUTBOUND_VERIFY_TLS, shared client
```

## API Contracts (existing endpoints this touches)
| Endpoint | Input | Output | Notes |
|---|---|---|---|
| /api/execute-direct | file_id, options{timeout} | response snapshot | swap client + verify only; contract unchanged |
| /api/ws-proxy | target_url query | ws relay | add SSRF check before connect |

## Component Patterns
N/A (backend-only phase).

## Gotchas
| # | Thing | Why it trips you up | How to handle |
|---|---|---|---|
| 1 | `create_all` still runs at startup | Alembic + create_all both create | after baseline, gate create_all behind dev flag |
| 2 | Pydantic v1 settings | don't pull pydantic-settings v2 | read env in config.py like existing code |
| 3 | public_routes is exact-match set | prefix routes (mock serve) won't match | needs prefix logic later (phase_8), note here |
| 4 | verify=False appears in multiple clients | miss one = still MITM | grep all `httpx`/`AsyncClient`, route through singleton |
| 5 | scheduler is separate process | client/logger config must load there too | ensure shared utils imported in scheduler entry |
