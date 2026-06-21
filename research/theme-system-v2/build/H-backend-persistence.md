# Phase H — Backend Persistence (real backend conventions)  ⬜ TODO

**Goal:** Persist custom themes server-side so they survive across devices. Add model + schemas +
CRUD/activate router, register it, and wire the frontend to load the active theme on mount and
save through the API (localStorage fallback when logged out).

**Prereqs:** E (custom editor saves to localStorage today). **Owns:**
`backend/src/models.py` (add class), `backend/src/schema.py` (add schemas),
`backend/src/routers/themes/*` (new folder), `backend/src/main.py` (register),
`frontend/src/components/ThemeContext.jsx` + `CustomThemeEditor.jsx` (wire).

> ⚠️ **The `sessions/session-7.md` backend code is WRONG for this repo.** It targets
> `mes_api_gateway` with `get_current_user` / `create_response(data, status, schema)` /
> `UUID` ids / `from ..common…`. The REAL backend is `api_testing/backend/src/` with different
> conventions. Use the conventions below, traced from `routers/workspace/create_workspace.py`,
> `models.py`, `config.py`, `utils.py`, `common_querys.py`.

---

## Real backend conventions (MUST match)

- **Router shape:** one file per action under a domain folder; module-level `router = APIRouter()`;
  route paths are relative (prefix added at registration).
- **Auth:** `username: str = Header(...)` then `user = await get_user_by_username(db, username)`
  (`from common_querys import get_user_by_username`). Returns `User | None`; 400 if None.
  **No `get_current_user` dependency exists.**
- **DB:** `db: AsyncSession = Depends(get_db)` (`from config import get_db`).
- **Response:** `create_response(status_code, data=None, schema=None, error_message=None, message=None)`
  — **status code is the FIRST positional arg.** e.g. `create_response(201, data, UserThemeResponse)`,
  `create_response(400, error_message="User not found")`.
- **Models:** `from config import Base`; ids are **`Integer`** (`users.id` is Integer — NOT UUID).
  Tables auto-create on startup via `Base.metadata.create_all` (main.py:84) — **no Alembic**, just
  add the class. Use `from sqlalchemy import JSON` for the token map (portable).
- **Schemas:** plain Pydantic in `backend/src/schema.py`.
- **Imports are flat:** `from config import …`, `from models import …`, `from schema import …`,
  `from utils import create_response`, `from common_querys import get_user_by_username`.

---

## Task 1 — Model (append to `backend/src/models.py`)

```python
class UserTheme(Base):
    __tablename__ = "user_themes"
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    token_map = Column(JSON, nullable=False)          # flat {"--bg":"#...", ...}
    is_active = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_themes_user_name"),
        Index("ix_user_themes_user_active", "user_id", "is_active"),
    )
```
Add any missing imports (`Boolean, Column, DateTime, ForeignKey, Index, Integer, String,
UniqueConstraint, JSON, func`) consistent with the file's existing import block.

## Task 2 — Schemas (append to `backend/src/schema.py`)

```python
class UserThemeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    token_map: dict[str, str]
    @field_validator("token_map")
    @classmethod
    def _keys(cls, v):
        for k in v:
            if not k.startswith("--"): raise ValueError(f"token_map key must start with '--': {k}")
        return v

class UserThemeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    token_map: dict[str, str] | None = None

class UserThemeResponse(BaseModel):
    id: int
    user_id: int
    name: str
    token_map: dict[str, str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class UserThemeListResponse(BaseModel):
    themes: list[UserThemeResponse]
    total: int
```

## Task 3 — Router folder `backend/src/routers/themes/`

One file per action; each `from fastapi import APIRouter, Depends, Header`, `router = APIRouter()`,
`from config import get_db`, `from common_querys import get_user_by_username`, `from models import
UserTheme`, `from schema import ...`, `from utils import create_response`. Resolve user first;
`if not user: return create_response(400, error_message="User not found")`.

- `list_themes.py` — `@router.get("")` → user's themes ordered by created_at; `create_response(200, {"themes":[UserThemeResponse.model_validate(t) for t in rows], "total": len(rows)}, UserThemeListResponse)`.
- `get_active.py` — `@router.get("/active")` → the `is_active` row or `create_response(200, {"theme": None})`.
- `create_theme.py` — `@router.post("")` → 409 if name exists for user; else insert, commit, refresh, `create_response(201, UserThemeResponse.model_validate(t), UserThemeResponse)`.
- `update_theme.py` — `@router.put("/{theme_id}")` → 404 if not owned; patch name/token_map; `create_response(200, ..., UserThemeResponse)`.
- `delete_theme.py` — `@router.delete("/{theme_id}")` → 404 if not owned; delete; `create_response(204)`.
- `activate_theme.py` — `@router.put("/{theme_id}/activate")` → `update(UserTheme).where(user_id==user.id).values(is_active=False)`, then set target `is_active=True` (rollback + 404 if not found), commit, `create_response(200, ..., UserThemeResponse)`.

Use `select`/`update` from `sqlalchemy`; short `async with`-scoped commits; rollback before
propagating errors. Guard ownership on every by-id route (`UserTheme.user_id == user.id`).

## Task 4 — Register in `backend/src/main.py`

```python
from routers.themes import list_themes, get_active, create_theme, update_theme, delete_theme, activate_theme
app.include_router(list_themes.router,    prefix="/themes", tags=["themes"])
app.include_router(get_active.router,      prefix="/themes", tags=["themes"])
app.include_router(create_theme.router,    prefix="/themes", tags=["themes"])
app.include_router(update_theme.router,    prefix="/themes", tags=["themes"])
app.include_router(delete_theme.router,    prefix="/themes", tags=["themes"])
app.include_router(activate_theme.router,  prefix="/themes", tags=["themes"])
```
Table auto-creates on next startup (`Base.metadata.create_all`).

## Task 5 — Frontend wiring

- `frontend/src/api.js` already exports an axios instance `api` that sends the `username` header.
  **Use it — do NOT hand-roll fetch + `auth-token`.**
- `ThemeContext.jsx`: on mount call `api.get('/themes/active')`; if `data.theme`, store it and
  re-apply its `token_map` on top of the preset via `applyPreset(preferences, theme.token_map)`.
  Keep localStorage custom-theme as the logged-out fallback.
- `CustomThemeEditor.jsx` / Theme Builder / Marketplace Save:
  `api.post('/themes', {name, token_map})` → on 409, `GET /themes`, find by name, `PUT /themes/{id}`
  then `PUT /themes/{id}/activate`; on success activate the new id. Any network error → fall back to
  `saveCustomThemes` (localStorage). Never let a 401/409 break the UI.

---

## Acceptance

- `POST /themes` → 201 row; duplicate name → 409; non-`--` key → 422.
- `PUT /themes/{id}/activate` then `GET /themes/active` returns it; `DELETE` → 204.
- Second browser (same user) restores the active theme on load; logged-out → localStorage fallback, no 401 break.
- `user_themes` table exists after startup. Frontend `npm run build` clean.
