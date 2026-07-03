# Session 7 — Backend Persistence for Custom Themes

**Goal:** Move custom theme storage from localStorage to the backend. User's custom themes survive across browsers/devices. Add import from JSON. Wire ThemeContext to fetch active theme on login.

**Prerequisites:** Session 6 complete (custom theme editor works in localStorage).  
**Backend stack:** FastAPI + SQLAlchemy + PostgreSQL (same as rest of mes_api_gateway).

---

## Context: existing backend patterns

The backend lives at `/Users/aniketmodi/Desktop/mes/mes_api_gateway/src/`.  
Before coding, read:
- An existing router file (e.g. `routers/auth.py` or `routers/collections.py`) to understand the response wrapper pattern
- An existing model file to understand SQLAlchemy ORM conventions
- `common/auth.py` or equivalent to understand how `current_user` is injected

Use the same `create_response()` pattern. Use the same `Depends(get_current_user)` for auth.

---

## Task 1: DB model

Create `backend/src/models/user_theme.py`:

```python
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
import uuid

from .base import Base  # adjust import to match project's Base location


class UserTheme(Base):
    __tablename__ = "user_themes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(80), nullable=False)
    token_map = Column(JSONB, nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_user_themes_user_active", "user_id", "is_active"),
        # unique name per user
        Index("uq_user_themes_user_name", "user_id", "name", unique=True),
    )
```

Run migration after creating this model (using Alembic or however the project does schema changes).

---

## Task 2: Pydantic schemas

Create `backend/src/schemas/user_theme.py`:

```python
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ThemeTokenMap(BaseModel):
    """Flat map of CSS var name → value. e.g. {"--bg": "#16181d", "--accent": "#748ffc"}"""
    model_config = {"extra": "allow"}  # allows any --css-var key


class UserThemeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    token_map: dict[str, str]

    @field_validator("token_map")
    @classmethod
    def validate_keys(cls, v: dict) -> dict:
        for key in v:
            if not key.startswith("--"):
                raise ValueError(f"token_map key must start with '--': {key}")
        return v


class UserThemeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    token_map: dict[str, str] | None = None


class UserThemeResponse(BaseModel):
    id: UUID
    user_id: UUID
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

---

## Task 3: Router

Create `backend/src/routers/themes.py`:

```python
"""
User custom theme storage. Allows saving, updating, activating, and exporting named theme token maps.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.auth import get_current_user
from ..common.db import get_db
from ..common.response import create_response
from ..models.user import User
from ..models.user_theme import UserTheme
from ..schemas.user_theme import (
    UserThemeCreate, UserThemeListResponse, UserThemeResponse, UserThemeUpdate,
)

router = APIRouter(prefix="/themes", tags=["themes"])


@router.get("", status_code=status.HTTP_200_OK)
async def list_themes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all saved custom themes for the authenticated user.
    """
    result = await db.execute(
        select(UserTheme)
        .where(UserTheme.user_id == current_user.id)
        .order_by(UserTheme.created_at.asc())
    )
    themes = result.scalars().all()
    return create_response(
        {"themes": [UserThemeResponse.model_validate(t) for t in themes], "total": len(themes)},
        status.HTTP_200_OK,
        UserThemeListResponse,
    )


@router.get("/active", status_code=status.HTTP_200_OK)
async def get_active_theme(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the currently active custom theme, or null if none is active.
    Called by ThemeContext on login/mount to restore cross-device theme.
    """
    result = await db.execute(
        select(UserTheme).where(
            UserTheme.user_id == current_user.id,
            UserTheme.is_active == True,
        )
    )
    theme = result.scalar_one_or_none()
    if theme is None:
        return create_response({"theme": None}, status.HTTP_200_OK)
    return create_response(
        {"theme": UserThemeResponse.model_validate(theme)},
        status.HTTP_200_OK,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_theme(
    body: UserThemeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new custom theme. Returns the created theme.
    Steps:
        - Step 1: Check name uniqueness for this user.
        - Step 2: Insert the new theme row.
    """
    existing = await db.execute(
        select(UserTheme).where(
            UserTheme.user_id == current_user.id,
            UserTheme.name == body.name,
        )
    )
    if existing.scalar_one_or_none():
        return create_response(
            {"error": f"Theme named '{body.name}' already exists"},
            status.HTTP_409_CONFLICT,
        )

    theme = UserTheme(
        user_id=current_user.id,
        name=body.name,
        token_map=body.token_map,
    )
    db.add(theme)
    await db.commit()
    await db.refresh(theme)
    return create_response(UserThemeResponse.model_validate(theme), status.HTTP_201_CREATED, UserThemeResponse)


@router.put("/{theme_id}", status_code=status.HTTP_200_OK)
async def update_theme(
    theme_id: UUID,
    body: UserThemeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update name or token_map of an existing custom theme.
    """
    result = await db.execute(
        select(UserTheme).where(
            UserTheme.id == theme_id,
            UserTheme.user_id == current_user.id,
        )
    )
    theme = result.scalar_one_or_none()
    if not theme:
        return create_response({"error": "Theme not found"}, status.HTTP_404_NOT_FOUND)

    if body.name is not None:
        theme.name = body.name
    if body.token_map is not None:
        theme.token_map = body.token_map

    await db.commit()
    await db.refresh(theme)
    return create_response(UserThemeResponse.model_validate(theme), status.HTTP_200_OK, UserThemeResponse)


@router.delete("/{theme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_theme(
    theme_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a custom theme by ID.
    """
    result = await db.execute(
        select(UserTheme).where(
            UserTheme.id == theme_id,
            UserTheme.user_id == current_user.id,
        )
    )
    theme = result.scalar_one_or_none()
    if not theme:
        return create_response({"error": "Theme not found"}, status.HTTP_404_NOT_FOUND)

    await db.delete(theme)
    await db.commit()
    return None


@router.put("/{theme_id}/activate", status_code=status.HTTP_200_OK)
async def activate_theme(
    theme_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Set this theme as active, deactivate all others for this user.
    Steps:
        - Step 1: Deactivate all current active themes.
        - Step 2: Activate the target theme.
    """
    # Step 1: deactivate all
    await db.execute(
        update(UserTheme)
        .where(UserTheme.user_id == current_user.id)
        .values(is_active=False)
    )

    # Step 2: activate target
    result = await db.execute(
        select(UserTheme).where(
            UserTheme.id == theme_id,
            UserTheme.user_id == current_user.id,
        )
    )
    theme = result.scalar_one_or_none()
    if not theme:
        await db.rollback()
        return create_response({"error": "Theme not found"}, status.HTTP_404_NOT_FOUND)

    theme.is_active = True
    await db.commit()
    await db.refresh(theme)
    return create_response(UserThemeResponse.model_validate(theme), status.HTTP_200_OK, UserThemeResponse)
```

Register in the main app router:
```python
from .routers.themes import router as themes_router
app.include_router(themes_router)
```

---

## Task 4: Update ThemeContext to fetch from backend

In `frontend/src/components/ThemeContext.jsx`:

```jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { applyPreset, DEFAULT_PREFERENCES, loadPreferences } from '../themes/index.js';

// Call GET /themes/active — returns { theme: {...} } or { theme: null }
async function fetchActiveTheme(apiBase) {
  try {
    const token = localStorage.getItem('auth-token'); // adjust to your auth token key
    if (!token) return null;
    const res = await fetch(`${apiBase}/themes/active`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.theme ?? null;
  } catch {
    return null;
  }
}

function applyCustomTokenMap(tokenMap) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokenMap)) {
    root.style.setProperty(key, value);
  }
}

export function ThemeProvider({ children, apiBase = '/api' }) {
  const [preferences, setPreferences] = useState(() => loadPreferences());
  const [customTheme, setCustomTheme] = useState(null);
  const hasFetched = useRef(false);

  // Apply base preset on preference change
  useEffect(() => {
    applyPreset(preferences);
    // Re-apply custom theme on top (it overrides preset)
    if (customTheme) {
      applyCustomTokenMap(customTheme.token_map);
    }
  }, [preferences, customTheme]);

  // Fetch active custom theme from backend on mount (once, after auth)
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchActiveTheme(apiBase).then(theme => {
      if (theme) {
        setCustomTheme(theme);
      }
    });
  }, [apiBase]);

  const setPreference = useCallback((key, value) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, []);

  const setTheme = useCallback((theme) => setPreference('theme', theme), [setPreference]);

  return (
    <ThemeCtx.Provider value={{
      preferences, setPreference,
      theme: preferences.theme, setTheme,
      isDarkMode: preferences.theme !== 'light',
      customTheme, setCustomTheme,
    }}>
      {children}
    </ThemeCtx.Provider>
  );
}
```

---

## Task 5: Update CustomThemeEditor to save to backend

In `CustomThemeEditor.jsx`, replace `handleSave` with:

```js
const handleSave = useCallback(async () => {
  const token = localStorage.getItem('auth-token');
  if (!token) {
    // fallback to localStorage if not logged in
    const themes = loadCustomThemes();
    // ... existing localStorage save logic
    return;
  }

  try {
    const res = await fetch('/api/themes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: themeName, token_map: overrides }),
    });

    if (res.status === 409) {
      // Name exists — update instead
      const listRes = await fetch('/api/themes', { headers: { Authorization: `Bearer ${token}` } });
      const list = await listRes.json();
      const existing = list.data?.themes?.find(t => t.name === themeName);
      if (existing) {
        await fetch(`/api/themes/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ token_map: overrides }),
        });
        // Activate
        await fetch(`/api/themes/${existing.id}/activate`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } else if (res.ok) {
      const data = await res.json();
      const themeId = data.data?.id;
      if (themeId) {
        await fetch(`/api/themes/${themeId}/activate`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

    onActivate(themeName, overrides);
  } catch (err) {
    console.error('Failed to save theme to backend:', err);
    // Fallback to localStorage
    onActivate(themeName, overrides);
  }
}, [themeName, overrides, onActivate]);
```

---

## Acceptance Criteria

- [ ] `POST /themes` creates a theme row in DB, returns 201
- [ ] `GET /themes/active` returns the active theme after `PUT /themes/{id}/activate`
- [ ] `DELETE /themes/{id}` removes the row, returns 204
- [ ] Logging in on a different browser → active custom theme is restored from backend
- [ ] Unauthenticated users → custom theme falls back to localStorage (no 401 breaking the UI)
- [ ] `token_map` keys that don't start with `--` are rejected with 422
- [ ] Migration applied and `user_themes` table exists in DB
- [ ] Build passes clean (frontend + backend)
