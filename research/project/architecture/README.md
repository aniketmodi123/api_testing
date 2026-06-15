# Architecture — Polaris API Testing Project

**Status:** stable
**Type:** Existing codebase knowledge base

---

## What it is
Full-stack Postman-alternative. React frontend + FastAPI backend + PostgreSQL.
Self-hosted, Docker-deployed, with a separate scheduler process.

## Stack
| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v6, Redux Toolkit (RTK Query), Zustand, CSS Modules |
| Backend | FastAPI (async), SQLAlchemy 2.x async ORM, Pydantic v1, httpx, JWT (jose), bcrypt |
| Database | PostgreSQL (Aiven cloud), asyncpg driver |
| Auth | JWT Bearer token + `username` header on every request |
| Infra | Docker + supervisord (main app + scheduler as separate processes) |
| Deploy | Backend → Render, Frontend → Netlify (via `_redirects`) |

## AI agent files
| File | Purpose |
|---|---|
| spec.md | DB models, API contracts, response format, auth pattern |
| research.md | Code patterns to reuse in new features |
