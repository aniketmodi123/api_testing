# Coding Style Guide — Match the House Style

LAST_UPDATED: 2026-06-15
PURPOSE: every line written must read as the user's own work, consistent with existing code.
SOURCE OF TRUTH: existing files (esp. `routers/variables/global_variables.py`), global CLAUDE.md docstring rules.

> Per user: "you will write the code but it still have my coding touch so no one can say all
> are done by AI." This guide = the concrete checklist to honor that.

---

## Backend Router — Canonical Skeleton (copy this shape)
```python
"""
What this file does: <one sentence — public purpose; env behaviour if any>.
"""
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List

from config import get_db
from common_querys import get_user_by_username
from models import <Model>
from utils import ExceptionHandler, create_response

router = APIRouter()


class <Name>Body(BaseModel):
    """<Imperative summary, no trailing period>
    Attributes:
        field: <what it is; None behaviour>
    """
    field: str


@router.post("/<path>")
async def <handler>(
    payload: <Name>Body,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """POST /<path> — <one sentence what it does for the caller>."""
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")
        # ... logic
        await db.commit()
        return create_response(200, data=result)
    except Exception as e:
        await db.rollback()
        return ExceptionHandler(e)
```

---

## Hard House Rules (matched to existing code)
| # | Rule | Evidence |
|---|---|---|
| 1 | `username: str = Header(...)` for identity, then `get_user_by_username` | global_variables.py |
| 2 | Always `create_response(code, data=/message=/error_message=)`, never raw dict | utils.py |
| 3 | `try/except Exception as e: await db.rollback(); return ExceptionHandler(e)` on writes | global_variables.py |
| 4 | Pydantic **v1** models with `Attributes:` docstring | global_variables.py |
| 5 | Reuse `logs()` / `setup_logger()` from utils.py — do NOT add a new logging lib | utils.py (already structured) |
| 6 | RBAC via `can_access_workspace(db, ws_id, user.id, min_role=...)` | members.py |
| 7 | `verify_node_ownership` before node ops | common_querys.py |
| 8 | Status: 200 ok · 400 user-not-found/bad · 404 missing · 401 auth · 403 forbidden | existing |
| 9 | New model → add import in `main.py` (triggers create_all) until Alembic lands | architecture research |
| 10 | Frontend: add endpoint to `store/apiSlice.js`, export generated hook; UI state in Zustand | architecture research |

---

## Authenticity Checklist (no AI tells)
- [ ] Module docstring uses exact `"""What this file does: ..."""` form
- [ ] Inline comments only where existing code comments (sparse, casual, plain English) — no comment restating obvious code
- [ ] No emoji in code beyond what the file already uses (existing code uses a few ✅ — keep, don't escalate)
- [ ] Variable/function naming matches existing casing + verbs (snake_case, `get_/list_/create_/save_/delete_`)
- [ ] No over-engineered abstractions; logic stays in the route handler like the rest of the repo
- [ ] Keep the `206`-as-not-found quirk where the rest of the code uses it (don't "fix" silently)
- [ ] Commits small, in user's voice (see commit history tone), Co-Authored-By line only if user wants it
- [ ] Match existing indentation/spacing quirks (some files have minor extra spaces — don't reformat unrelated lines)

---

## Don't (would expose AI authorship / break consistency)
- ❌ Introduce a service/repository layer unasked
- ❌ Swap Pydantic v1 → v2 syntax
- ❌ Add type hints to params that existing siblings leave untyped
- ❌ Reformat / re-lint whole files when editing one function
- ❌ Add verbose block comments or "Note:" essays the rest of the repo lacks
- ❌ Rename existing shared helpers

---

## Validation Checklist — Style Guide
- [x] Canonical router skeleton captured from real file
- [x] Hard house rules with file evidence
- [x] Authenticity checklist (no AI tells)
- [x] Explicit don'ts
- [x] Bound to memory [[feedback-coding-touch]]
