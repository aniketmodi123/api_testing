# Sprint 7 — Domain 1: auth + sso + oauth2 (REVIEWED)

Audited 2026-06-22. Target raised to 98/100 mid-session.

## Routes audited (11)
| Route | File | Pre | Post | Action |
|-------|------|-----|------|--------|
| POST /auth/oauth2/token | auth/oauth2.py | ~95 | ~95 | none (already strong) |
| GET /auth/oauth2/token/{auth_ref} | auth/oauth2.py | ~92 | ~92 | none (already strong) |
| POST /sign_in | sso/login.py | ~70 | ~98 | fixed |
| POST /sign_up | sso/create_user.py | ~78 | ~98 | fixed |
| DELETE /delete_user | sso/delete_user.py | ~68 | ~98 | fixed |
| PUT /update_user | sso/update_user.py | ~70 | ~98 | fixed |
| GET /me | sso/user_profile.py | ~80 | ~98 | fixed |
| DELETE /logout | sso/logout.py | ~82 | ~98 | fixed |
| POST /send-otp | sso/otp_generation.py | ~83 | ~98 | fixed |
| POST /change-password | sso/forget_password.py | ~65 | ~98 | fixed |
| POST /forgot-password | sso/forget_password.py | ~70 | ~98 | fixed |

## Auth model (verified, no change needed)
`AuthMiddleware` (security.py) validates JWT + decodes payload, asserts
`payload.username == username header`, checks blacklist in Cache table — runs on
every non-public route. So `username: str = Header(...)` in handlers is already an
authenticated identity. Public routes: /sign_up /sign_in /send-otp /forgot-password.
Access control is correct as-is.

## Bugs fixed (severity order)
1. **Silent-success on failure (high)** — `change_password` / `forgot_password`
   returned **206** (a 2xx) for "User not found" / "inactive account". Frontend
   (axios) does NOT throw on 2xx, so a failed password reset was treated as success.
   → 404 (not found) / 403 (inactive), now throws correctly client-side.
2. **login.py `finally: await db.commit()` (high)** — committed unconditionally,
   even after `db.rollback()` in the except block. Replaced with explicit commits on
   the failed-attempt path and the success path; exception path now rolls back only.
3. **delete_user success used `error_message=` (med)** — success returned the message
   under the `error_message` key. → `message=`.
4. **`ExceptionHandler(e)` not returned (med)** — every sso handler called it without
   `return`. ExceptionHandler *raises* for DB/value errors (so it mostly worked) but
   *returns* a JSONResponse for httpx errors, which was being dropped → null 200.
   Added `return` on all 8 handlers.
5. **Positional `data` misuse** — `create_response(206, "User not found")` passed the
   string as the `data` arg. Folded into the 404/403 fixes with `error_message=`.

## Contract / status-code corrections (backward-compat safe)
Frontend reads `err.response.data.error_message` and relies on axios throwing for
non-2xx; it never branches on a specific 4xx code (checked store/session.jsx,
apiSlice.js). So these are safe:
- dup email: 400 → **409** (sign_up, update_user)
- not found: 400 → **404** (delete_user, update_user, /me)
- update success: 201 → **200** (not a creation)

## Schemas added on success paths (response-contract accuracy)
- /me → `UserResponse` (verified vs User model: id int, username/email str non-null,
  god bool non-null, created_at TIMESTAMP→str via value_correction — exact match).
- sign_up / update_user / logout / send-otp / change-password / forgot-password →
  `MessageResponse` (all return `{"message": ...}`).
- sign_in → new inline `AccessTokenResponse` in login.py (no matching schema existed in
  schema.py and schema.py is outside this domain's FILES scope; followed oauth2.py's
  inline-schema precedent).

## Removed dead code
- update_user.py: dropped `response_model=UserResponse` decorator arg (handler returns a
  message dict, not a UserResponse — was misleading) + unused `HTTPException` import.
- logout.py: removed duplicate `from fastapi import APIRouter`.

## Verification
- `py_compile` all 9 files: OK.
- Imported all 9 modules with .env loaded: OK.
- Assembled full app (`import main`): all 10 auth routes mount.
- No live-DB request test (Sprint 8 test infra not built yet) — deferred to Sprint 8.

## Out of scope / flagged
- otp_generation.py has `email_sent = True` hardcoded (real email send commented out) —
  feature stub, untouched. Worth wiring before prod.
- update_user.py still imports unused `get_password_hash` (pre-existing) — left per
  "leave pre-existing unrelated errors untouched".
