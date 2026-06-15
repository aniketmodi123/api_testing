# Phase 0 — Project Overview (Current State Report)

LAST_UPDATED: 2026-06-15
SOURCE: live codebase (`backend/src`, `frontend/src`), `research/project/architecture/*`, `models.py`, `main.py`

> Product internal name: **Polaris API Testing Platform**. This document is the authoritative
> snapshot of *what exists today*. Every gap-analysis and roadmap claim must trace back here.

---

## 1. Current Architecture (high level)

```
┌────────────────────────────────────────────────────────────────┐
│ Browser SPA (React 19 + Vite)                                  │
│  RTK Query (server cache) + Zustand (UI state) + Redux (auth)  │
└───────────────┬────────────────────────────────────────────────┘
                │ HTTPS  (Authorization: Bearer <JWT> + username header)
┌───────────────▼────────────────────────────────────────────────┐
│ FastAPI app (ASGI)                                              │
│  AuthMiddleware (JWT verify + blacklist) → routers (thin)       │
│  Business logic lives INSIDE route handlers (no service layer)  │
│  Outbound test calls via httpx (verify=False, follow_redirects) │
└───────┬───────────────────────────────────┬────────────────────┘
        │ async SQLAlchemy                   │ separate process (supervisord)
┌───────▼────────────┐            ┌──────────▼───────────────────┐
│ PostgreSQL (asyncpg)│            │ Scheduler worker             │
│ tables auto-created │            │ polls bulk_test_schedules    │
│ on startup          │            │ by next_run, runs bulk tests │
└────────────────────┘            └──────────────────────────────┘
```

- **Two processes** managed by `supervisord`: (1) FastAPI API server, (2) standalone scheduler loop. Keeps long cron polling off the request event loop.
- **Tables auto-created** on startup via `Base.metadata.create_all` — **no Alembic migrations** today.

---

## 2. Tech Stack

### Backend
| Concern | Choice | Notes |
|---|---|---|
| Framework | FastAPI (async) | `app = FastAPI(docs_url="/swagger")` |
| ORM | SQLAlchemy 2.x async (`Mapped`/`mapped_column`) | `create_async_engine` |
| DB driver | asyncpg (PostgreSQL) | prod creds from `PRODUCTION_POSTGRES_*` env |
| Validation | **Pydantic v1 style** (`@validator`, `root_validator`) | do NOT use v2 `@field_validator` |
| HTTP client | httpx | `verify=False`, `follow_redirects=True`, timeouts 5–30s |
| Auth | JWT (`python-jose`) + bcrypt | custom `AuthMiddleware` |
| Process mgr | supervisord | API + scheduler |
| Scheduler | custom loop over `next_run` index | not Celery/APScheduler |

### Frontend
| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 | |
| Build | Vite 7 | |
| Server state | RTK Query (`store/apiSlice.js`) | auto-generated hooks, tag invalidation |
| UI state | Zustand (`store/*.jsx`) | workspace, node, environment, session |
| Auth state | Redux slice (`authSlice.js`) | JWT + user, localStorage sync |
| Code editor | CodeMirror (`@uiw/react-codemirror`, json lang) | request/response body editing |
| Component lib | **none** (hand-rolled CSS modules) | 30 component folders |

### Deployment
| Item | State |
|---|---|
| Containerization | Docker + supervisor (recent commit adds scheduler service) |
| Migrations | **None** — `create_all` on boot (additive-only safe, destructive-unsafe) |
| CORS | wide open (`allow_origins=["*"]`) |
| TLS to targets | disabled (`verify=False`) everywhere |

---

## 3. Authentication & Authorization (as built)

| Layer | Mechanism |
|---|---|
| Login | `POST /sign_in` → JWT access token (jose, `JWT_SECRET_KEY`) |
| Every request | `Authorization: Bearer <jwt>` **and** `username: <email>` headers |
| Middleware | `AuthMiddleware` verifies JWT, matches `username` claim to header, checks `sso_cache.black_list` |
| Public routes | set in `security.py` (sign-in, otp, forget-password, etc.) |
| Logout | sets `black_list=True` in `sso_cache` |
| User lookup | `get_user_by_username(db, username)` (email column = username) |
| Node ownership | `verify_node_ownership(db, node_id, user.id)` |
| Workspace RBAC | `can_access_workspace(db, ws_id, user.id, min_role=...)` — roles `viewer < editor < admin` (+ owner) |
| OTP | `sso_otp_attempts` with lockout (`failed_attempts`, `locked_until`) |
| Login audit | `sso_verify_login` (success/fail rows only) |

---

## 4. Existing Modules (backend routers)

| Module | Endpoints (files) | Purpose |
|---|---|---|
| `sso` | create_user, login, logout, update_user, delete_user, user_profile, forget_password, otp_generation | auth + account |
| `workspace` | create/update/list/delete, list_workspace_tree, members | workspace + collaboration (invite/join/role) |
| `node` | create/update/list/delete/move/copy, bulk_import | folder/file tree (= collections) |
| `headers` | set/update/list/delete/complete | folder-inherited headers |
| `api` | list_apis, save_api | one API def per file node |
| `api_cases` | save/get/list_search/delete/create_dup | test cases per API |
| `environment` | create/list, save/list/delete variables, resolve, resolve_api | environment variables + {{VAR}} resolution |
| `variables` | global_variables | per-user cross-workspace vars (is_secret masking) |
| `runner` | run_case, bulk_run_cases, execute_direct, validator, graphql_introspect, ws_proxy | execution engine |
| `shedulers` | shedule_test, alerts | cron schedules + email/webhook alerts |
| `script` | test_scheduler | scheduler worker entry |
| `history` | request_history | request/response history playback |

---

## 5. Existing User Roles

| Role | Scope | Capability |
|---|---|---|
| `god` (superuser) | global (`users.god`) | bypass / admin |
| workspace **owner** | workspace (via `Workspace.user_id`) | full control + delete workspace |
| `admin` | workspace member | editor + invite/remove members, change roles |
| `editor` | workspace member | CRUD on nodes/apis/cases |
| `viewer` | workspace member | read-only |

---

## 6. Data Model Inventory (tables that exist today)

users · sso_verify_login · sso_cache · sso_otp_attempts · workspaces · environments · nodes · headers · apis · api_cases · global_variables · request_history · bulk_test_schedules · bulk_test_executions · bulk_test_results · schedule_alerts · workspace_members · workspace_invites

(Full field-level detail → `database-design.md`.)

---

## 7. Key Design Quirks (must respect in all new work)

| # | Quirk | Implication |
|---|---|---|
| 1 | `username` header, not JWT sub, is source of identity | every new endpoint reads `username` header |
| 2 | `206` used for "not found / partial" (non-standard) | RTK Query treats 206 as success → check `error_message` |
| 3 | Response always wrapped `{response_code, data, message, error_message}` | never return raw dict |
| 4 | Pydantic **v1** | use v1 validators only |
| 5 | `verify=False` on all outbound httpx | prod TLS risk (see security-review) |
| 6 | No migrations — `create_all` only | schema changes are additive-safe, destructive-unsafe |
| 7 | Business logic in route handlers (no service/repo layer) | match this; do NOT introduce layering unasked |
| 8 | Global/env vars stored as JSON, secrets only *masked* not encrypted | secret-at-rest gap |

---

## 8. Validation Checklist — Phase 0
- [x] Architecture diagram captured
- [x] Backend + frontend stack enumerated with versions
- [x] Auth + RBAC mechanism documented
- [x] All routers/modules listed
- [x] All tables listed
- [x] User roles enumerated
- [x] Design quirks captured (drive every later phase)
