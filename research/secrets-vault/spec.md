# Spec — Secrets Vault

STATUS: updated
LAST_CHANGED: 2026-06-16

---

## Overview

APIPilot has **Fernet encryption at rest** for variable values. This is good infrastructure but
covers only part of what Postman ships. Two distinct Postman features need to be matched:

| Feature | Postman | APIPilot | Gap |
|---|---|---|---|
| Encryption at rest for secret values | AES-256-GCM | ✅ Fernet (equivalent) | — |
| Secret variable type (masked display) | ✅ | ❌ No `is_secret` flag | P1 |
| Reveal/hide toggle (eye icon) | ✅ | ❌ | P1 |
| Secret scrub from run snapshots | ✅ | ❌ Deferred | P1 |
| Vault namespace (`vault.secretName` syntax) | ✅ Local-only vault | ❌ | P2 |
| Third-party vault integrations | ✅ Azure/HashiCorp/AWS (Enterprise) | ❌ KMS stub only | P3 |
| Secret scanner (detect leaked secrets) | ✅ (public API network) | ❌ | P3 |

APIPilot differentiator: secrets encrypted server-side, never plaintext to client. Postman's
secret variable type is masking-only (value travels to client in responses). APIPilot's approach
is stronger — lean into this in docs.

---

## Backend

### Missing: `is_secret` flag on variable entries

Currently `Environment.variables` is `JSONB` storing `{key: value}` flat dict. No per-entry
metadata. Per-entry `is_secret` flag was deferred in 04-variables spec pending shape change.

**Required shape change** (from 04-variables/spec.md):
```json
{
  "variables": [
    { "key": "API_KEY", "value": "enc:v1:...", "is_secret": true, "enabled": true },
    { "key": "BASE_URL", "value": "https://api.example.com", "is_secret": false, "enabled": true }
  ]
}
```

Same shape needed for `Collection.variables` and `GlobalVariable` model.

This is a **schema migration** — existing flat `{key: value}` dicts must be migrated to array
of entry objects. Migration path:
1. Add new `variables_v2` JSONB column (nullable)
2. Backfill: convert existing `{k: v}` → `[{key: k, value: v, is_secret: false, enabled: true}]`
3. Switch reads/writes to `variables_v2`
4. Drop old `variables` column in next release

### Missing: Secret scrub from run snapshots

`BulkTestResult.request` and `BulkTestResult.response` store raw JSONB snapshots. If a secret
variable was resolved into the request (e.g. Authorization header), it appears in the snapshot.

Required: scrub function run before storing result snapshot.

```python
# services/secret_scrub.py
def scrub_snapshot(snapshot: dict, secret_keys: set[str]) -> dict:
    """Replace resolved secret values in request/response snapshots with '***REDACTED***'."""
```

Called in `run_execution_task` before `db.add(BulkTestResult(...))`.

### Missing: `VaultSecret` model (for `vault.` namespace)

Postman Vault is local-only. APIPilot equivalent: workspace-scoped vault, server-stored encrypted,
never returned plaintext to client. Referenced as `{{vault.secretName}}` in requests.

```
id              UUID PK
workspace_id    INTEGER FK → Workspace.id
name            VARCHAR(255) NOT NULL        -- "secretName" part of vault.secretName
value_enc       TEXT NOT NULL               -- Fernet-encrypted value
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

Unique constraint: `(workspace_id, name)`

### New Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/vault` | viewer | List vault secrets (names only, never values) |
| POST | `/vault` | editor | Create vault secret (encrypt value server-side) |
| PUT | `/vault/{id}` | editor | Update vault secret value |
| DELETE | `/vault/{id}` | editor | Delete vault secret |
| POST | `/vault/{id}/reveal` | editor | Return decrypted value (audit-logged) |

**`GET /vault` response** — never returns plaintext values:
```json
{
  "secrets": [
    { "id": "uuid", "name": "STRIPE_KEY", "created_at": "...", "updated_at": "..." }
  ]
}
```

**`POST /vault/{id}/reveal`** — requires explicit action, audit-logged:
```json
{ "value": "sk_live_..." }
```

Audit log event: `vault.secret.revealed` → `user_id`, `vault_id`, `name`, `ip`.

### Variable Resolution — `vault.` prefix

In `resolve_api_variables.py`, extend resolution order to handle `vault.secretName` syntax:

Resolution order (existing + new):
1. Global variables
2. Environment variables
3. Collection variables
4. `vault.*` variables — resolved from `VaultSecret` table, decrypted at resolution time

`{{vault.STRIPE_KEY}}` in request body/headers/URL → look up `VaultSecret.name = "STRIPE_KEY"` for workspace → decrypt → substitute.

### Missing: `is_secret` reveal endpoint for env variables

```
POST /environments/{id}/variables/{key}/reveal
```

Returns decrypted value for a secret variable. Requires editor role. Audit-logged.

### Validation Rules

- Vault secret `name`: max 255 chars; alphanumeric + underscore + hyphen only; no spaces
- Vault secret `value`: max 64 KB before encryption
- `is_secret` flag: boolean only; defaults to `false` on create

### Security Rules

- Vault secret values **never** returned in list endpoints or GET single endpoints
- `vault.reveal` endpoint: always audit-logged regardless of success/failure
- Secret variable values: returned as `"***"` sentinel in all list/get responses; actual value only via `/reveal`
- Run snapshots: scrub all resolved secret values before DB write

### Modified Files

| File | Change |
|---|---|
| `models.py` | Add `VaultSecret` model; migrate `Environment.variables` shape |
| `routers/vault.py` | New file — vault CRUD + reveal |
| `routers/environment/` | Update variable shape for `is_secret`; add `/reveal` endpoint |
| `services/vault.py` | Already exists — extend with `decrypt_for_reveal()` + audit hook |
| `services/secret_scrub.py` | New — scrub function for run snapshots |
| `routers/runner/runner.py` | Call `scrub_snapshot()` before persisting `BulkTestResult` |
| `routers/environment/resolve_api_variables.py` | Handle `vault.*` prefix in resolution |
| `migrations/` | Add `vault_secrets` table; migrate `variables` column shape |

---

## Frontend

### Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `SecretValueInput` | `src/components/secrets/SecretValueInput.tsx` | Input that masks value; eye toggle to reveal; used wherever secret vars are edited |
| `VaultSecretsPage` | `src/pages/VaultSecretsPage.tsx` | Full vault management: list, add, delete, reveal |
| `VaultSecretRow` | `src/components/secrets/VaultSecretRow.tsx` | Single vault secret row: name, masked value, reveal button, delete |
| `AddVaultSecretModal` | `src/components/secrets/AddVaultSecretModal.tsx` | Create new vault secret: name + value input |
| `IsSecretToggle` | `src/components/secrets/IsSecretToggle.tsx` | Toggle in variable editor rows to mark as secret |
| `RevealSecretButton` | `src/components/secrets/RevealSecretButton.tsx` | Eye button — calls `/reveal`, shows value for 30s then re-masks |

### TypeScript Interfaces

```typescript
interface VaultSecret {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  // value never included in list/get response
}

interface VariableEntry {
  key: string;
  value: string;          // "***" when is_secret + not revealed
  is_secret: boolean;
  enabled: boolean;
  revealed?: boolean;     // client-only: true for 30s after reveal
  revealed_value?: string; // client-only: actual value shown temporarily
}

interface SecretValueInputProps {
  value: string;
  isSecret: boolean;
  onChange: (value: string) => void;
  onReveal?: () => Promise<string>;  // async fetch real value
  readOnly?: boolean;
}

interface RevealSecretButtonProps {
  onReveal: () => Promise<string>;
  autoHideMs?: number;    // default 30000
}
```

### Component Render Descriptions

**`SecretValueInput`**: Text input with type toggling. When `isSecret=true`: input shows `••••••••`, eye icon on right. Click eye → call `onReveal()` → show plaintext for 30s → re-mask. Shows "Secret" badge chip. When `isSecret=false`: normal text input.

**`VaultSecretsPage`**: Table of vault secrets. Columns: Name, Created, Last Updated, Actions. "Add Secret" button opens `AddVaultSecretModal`. Row actions: Reveal (eye, 30s timer) / Delete (confirm dialog). No "Edit name" — delete and recreate.

**`VaultSecretRow`**: Name chip + created/updated timestamps + `RevealSecretButton` + delete button. Revealed state shows value in monospace for 30s with countdown. Copying revealed value shows "Copied" toast.

**`IsSecretToggle`**: Small lock icon toggle in variable editor rows. On = secret (masked), Off = default (visible). Tooltip: "Mark as secret — value masked for all workspace members."

**`RevealSecretButton`**: Eye icon button. Click → calls reveal endpoint → stores value in local state → starts 30s countdown → re-masks. Countdown shown as "Hiding in 28s" badge.

### API Calls

| Action | Method | URL | When |
|---|---|---|---|
| List vault secrets | GET | `/vault` | Vault page load |
| Create vault secret | POST | `/vault` | Add Secret form submit |
| Delete vault secret | DELETE | `/vault/{id}` | Delete button confirm |
| Reveal vault secret | POST | `/vault/{id}/reveal` | Eye button clicked |
| Reveal env var | POST | `/environments/{id}/variables/{key}/reveal` | Eye on env var row |
| Save variable with is_secret | PATCH | `/environments/{id}` | Toggle changed + auto-save |

---

## Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Cipher | Fernet (existing) | AEAD, key-rotatable, already shipped |
| 2 | Vault scope | Workspace-level | Matches Postman's per-workspace vault; user-level is too narrow for teams |
| 3 | Vault list endpoint | Never return values | Even encrypted values shouldn't travel to client in list; reveal is explicit |
| 4 | Reveal timeout | 30s client-side | Balance usability vs accidental exposure; Postman uses similar pattern |
| 5 | `vault.` prefix syntax | `{{vault.NAME}}` | Clear namespace separation from env vars; won't collide with `{{NAME}}` |
| 6 | Third-party vaults | Stub + defer | KMS interface exists; Azure/HashiCorp/AWS = Enterprise feature, P3 |
| 7 | Secret scrub in snapshots | Scrub before insert | Run history readable without leaking resolved secret values |

---

## Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | `vault.NAME` resolves to missing secret | Return 400 at execution time: "Vault secret 'NAME' not found" — don't silently send unresolved `{{vault.NAME}}` |
| 2 | Secret value revealed then user screenshots | 30s timer only reduces window; cannot prevent; document limitation |
| 3 | Variable shape migration breaks existing reads | Run migration in transaction; rollback if backfill fails; keep old column until verified |
| 4 | Secret scrub misses nested header values | Scrub must walk full request object recursively, not just top-level keys |
| 5 | Editor reveals secret, viewer sees it | Reveal endpoint requires editor role — viewer cannot trigger |
| 6 | `is_secret` toggled off by mistake | Warn: "This will unmask the value for all workspace members" confirm dialog |
| 7 | Vault secret name collision | Unique constraint on `(workspace_id, name)`; return 409 with clear message |

---

## Deferred

| Item | Reason |
|---|---|
| Third-party vault integrations (Azure/HashiCorp/AWS) | Enterprise tier; KMS interface stub exists |
| Secret scanner (scan request history for leaked values) | Complex; P3 |
| Key rotation job | Fernet key rotation requires re-encrypt-all job; implement when first key rotation needed |
| Per-collection vault scope | Workspace scope sufficient for V1 |
