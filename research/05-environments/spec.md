# Spec — Environments

STATUS: Research complete
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_0_platform_hardening/spec.md + live research 2026-06-16

---

## 1. Goal

Provide a mechanism to manage sets of named variables that can be swapped to configure requests for different deployment stages (development, staging, production). Environments are the primary variable scope used during request execution.

---

## 2. Postman Feature Parity

| Postman Feature | APIPilot Scope |
|---|---|
| CRUD environments | Yes — done |
| Named variables with enabled/disabled toggle | Yes |
| Secret/sensitive variable type (masked in UI) | Yes |
| Single value model (Sept 2025 redesign: no initial/current split) | Yes — one value per variable |
| Local vs shared value distinction | Simplified: one `value` field; `is_shared` flag controls sync |
| Active environment selector (top bar) | Yes |
| Environment editor (variable table with key/value/secret/enabled) | Yes — partially built |
| Duplicate environment | Yes |
| Export environment as JSON | Yes |
| Import environment from JSON | Yes |
| Fork environment | Yes — via 16-version-control fork system |
| Pull changes on forked environment | Yes — via fork/PR system |
| Merge changes back to parent | Yes — via fork/PR system |
| Pin environment to collection | Yes |
| Team sharing (move to workspace) | Yes — workspace-scoped already |
| Variable count limit | 100 per environment (enforced) |
| Environment description field | Yes |

---

## 3. Data Models

### 3.1 Environment (existing — verify columns)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| description | TEXT | nullable | |
| created_by | UUID | FK → User | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

### 3.2 EnvironmentVariable (existing — verify + extend)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| environment_id | UUID | FK → Environment, NOT NULL | |
| key | VARCHAR(255) | NOT NULL | Variable name |
| value | TEXT | nullable | Single value (no initial/current split) |
| is_secret | BOOLEAN | NOT NULL, DEFAULT false | Masks value in API responses and UI |
| is_enabled | BOOLEAN | NOT NULL, DEFAULT true | Disabled vars excluded from resolution |
| description | TEXT | nullable | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | For stable display order |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

Unique: `(environment_id, key)`.
Index: `(environment_id, is_enabled)` — fast resolution query.

### 3.3 CollectionPinnedEnvironment

Pins environments to collections so the collection runner knows which environments to offer first.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| collection_id | UUID | FK → Collection, NOT NULL | |
| environment_id | UUID | FK → Environment, NOT NULL | |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | One default pin per collection |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Display order in pin list |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Unique: `(collection_id, environment_id)`.
Only one `is_default = true` per collection — enforced in service layer.

---

## 4. Backend Specification

### 4.1 Endpoints

#### Existing (verify implemented)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/environments` | editor | Create environment |
| GET | `/environments` | viewer | List environments for workspace |
| GET | `/environments/{id}` | viewer | Get environment + variables |
| PUT | `/environments/{id}` | editor | Full replace: name + variables array |
| DELETE | `/environments/{id}` | editor | Delete environment |

#### New / Missing

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/environments/{id}/duplicate` | editor | Duplicate environment (new name + copy all vars) |
| GET | `/environments/{id}/export` | viewer | Export as Postman-compatible JSON |
| POST | `/environments/import` | editor | Import environment from JSON file |
| GET | `/environments/{id}/pins` | viewer | List collections this environment is pinned to |
| POST | `/collections/{id}/pins` | editor | Pin environment to collection |
| DELETE | `/collections/{id}/pins/{env_id}` | editor | Unpin environment from collection |
| GET | `/collections/{id}/pins` | viewer | List pinned environments for collection |
| PATCH | `/collections/{id}/pins/{env_id}` | editor | Set/unset as default pinned env |

### 4.2 Secret Variable Masking

**Rule:** `is_secret = true` variables → `value` field replaced with `null` in all API responses.  
Exception: `GET /environments/{id}/export` — secrets included as empty string `""` in export (never expose value).

Masking applies to:
- `GET /environments` (list — variables not returned in list, only metadata)
- `GET /environments/{id}` — variable array: secret vars have `value: null`
- `PUT /environments/{id}` response

**Setting a secret variable:**  
If client sends `value` for a secret variable, store it. If client sends `null` for a secret variable already set, treat as "no change" (preserve existing value). Use sentinel `"__CLEAR__"` if client explicitly wants to clear a secret value.

### 4.3 Variable Validation

| Rule | Detail |
|---|---|
| Max 100 variables per environment | 400 if exceeded |
| Key must be non-empty | 400 |
| Key max length 255 chars | 400 |
| Keys must be unique per environment | 400 with duplicate key listed |
| Duplicate env name in workspace | Allowed (no uniqueness constraint) |

### 4.4 Export Format

Postman-compatible JSON format:

```json
{
  "id": "uuid",
  "name": "Production",
  "values": [
    {
      "key": "base_url",
      "value": "https://api.example.com",
      "enabled": true,
      "type": "default"
    },
    {
      "key": "api_key",
      "value": "",
      "enabled": true,
      "type": "secret"
    }
  ],
  "_postman_variable_scope": "environment",
  "exportedAt": "2026-06-16T10:00:00Z"
}
```

`type`: `"default"` for normal vars, `"secret"` for `is_secret = true`.

### 4.5 Import Format

Accept same JSON format as export. On import:
- Generate new UUID for environment.
- Map `type: "secret"` → `is_secret = true`.
- Map `enabled` → `is_enabled`.
- If `value` is empty string for secret → store as empty string (not null).

### 4.6 Duplicate Logic

`POST /environments/{id}/duplicate`:
- Copy `name` as `"{name} (Copy)"`.
- Copy all variables including `is_secret`, `is_enabled`, `description`, `sort_order`.
- New environment gets new UUID + `created_by = current_user`.

### 4.7 Pinned Environment Constraints

- Max 10 pinned environments per collection.
- Exactly 0 or 1 default per collection.
- If pinned environment is deleted → pin row also deleted (CASCADE).
- If collection runner is invoked without explicit env selection → use default pinned env (if set).

### 4.8 Modified Files

| File | Change |
|---|---|
| `models/environment.py` | Add `description`, `sort_order` to EnvironmentVariable; add CollectionPinnedEnvironment model |
| `routers/environments.py` | Add duplicate, export, import endpoints |
| `routers/collections.py` | Add pin CRUD endpoints |
| `services/environment_service.py` | Secret masking, validation, duplicate logic, import/export |
| `alembic/versions/xxx_env_pinned.py` | Migration: add CollectionPinnedEnvironment table + missing columns |

---

## 5. Frontend Specification

### 5.1 Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Variable table | Custom table component (not a library) | Simple enough; needs inline edit + secret toggle per row |
| Secret value display | Masked with `••••••••`; eye icon to reveal (local only, no API call) | Standard UX; value already in component state |
| Import file parsing | Browser `FileReader` + `JSON.parse` | No library needed |

### 5.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `EnvironmentListPanel` | `components/environments/` | Sidebar list: env name, active indicator, add button |
| `EnvironmentEditor` | `components/environments/` | Full editor: name field + EnvironmentVariableTable + action buttons |
| `EnvironmentVariableTable` | `components/environments/` | Table of variables: key, value, secret toggle, enabled toggle, delete row |
| `EnvironmentVariableRow` | `components/environments/` | Single row with inline editing |
| `SecretValueInput` | `components/environments/` | Password-style input with eye-toggle; never syncs reveal state to server |
| `EnvironmentSelector` | `components/common/` | Top bar dropdown: active environment picker; "No Environment" option |
| `EnvironmentActionsMenu` | `components/environments/` | Context menu: Duplicate, Export, Delete, Fork (links to version control) |
| `ImportEnvironmentModal` | `components/environments/` | File upload → JSON parse → preview → confirm import |
| `PinnedEnvironmentManager` | `components/collections/` | In collection settings: list pinned envs, add/remove, set default |

### 5.3 Per-Component TypeScript Interfaces

```typescript
interface Environment {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  variable_count: number;
  created_at: string;
  updated_at: string;
}

interface EnvironmentVariable {
  id: string;
  key: string;
  value: string | null;  // null when is_secret = true (server masked)
  is_secret: boolean;
  is_enabled: boolean;
  description: string | null;
  sort_order: number;
  // client-only, not persisted:
  _localRevealedValue?: string;  // holds revealed value in memory only
  _isDirty?: boolean;
}

interface EnvironmentDetail extends Environment {
  variables: EnvironmentVariable[];
}

interface EnvironmentEditorProps {
  environmentId: string | null;  // null = create mode
  onSave: (env: EnvironmentDetail) => void;
  onDelete: (envId: string) => void;
}

interface EnvironmentVariableTableProps {
  variables: EnvironmentVariable[];
  onChange: (variables: EnvironmentVariable[]) => void;
  readOnly?: boolean;
}

interface EnvironmentSelectorProps {
  activeEnvironmentId: string | null;
  environments: Environment[];
  onSelect: (envId: string | null) => void;
}

interface PinnedEnvironment {
  environment_id: string;
  environment_name: string;
  is_default: boolean;
  sort_order: number;
}

interface PinnedEnvironmentManagerProps {
  collectionId: string;
  pinnedEnvironments: PinnedEnvironment[];
  allEnvironments: Environment[];
  onPin: (envId: string) => void;
  onUnpin: (envId: string) => void;
  onSetDefault: (envId: string) => void;
}
```

### 5.4 API Calls Table

| Action | Method | URL | When Triggered |
|---|---|---|---|
| List environments | GET | `/environments` | EnvironmentListPanel mount |
| Load environment | GET | `/environments/{id}` | EnvironmentEditor open |
| Create environment | POST | `/environments` | EnvironmentEditor save (create mode) |
| Update environment | PUT | `/environments/{id}` | EnvironmentEditor save (edit mode) |
| Delete environment | DELETE | `/environments/{id}` | EnvironmentActionsMenu → Delete confirm |
| Duplicate environment | POST | `/environments/{id}/duplicate` | EnvironmentActionsMenu → Duplicate |
| Export environment | GET | `/environments/{id}/export` | EnvironmentActionsMenu → Export |
| Import environment | POST | `/environments/import` | ImportEnvironmentModal confirm |
| List collection pins | GET | `/collections/{id}/pins` | PinnedEnvironmentManager mount |
| Pin environment | POST | `/collections/{id}/pins` | PinnedEnvironmentManager → add |
| Unpin environment | DELETE | `/collections/{id}/pins/{env_id}` | PinnedEnvironmentManager → remove |
| Set default pin | PATCH | `/collections/{id}/pins/{env_id}` | PinnedEnvironmentManager → set default |

### 5.5 State Shape (Zustand)

```typescript
interface EnvironmentStore {
  environments: Environment[];
  environmentsLoading: boolean;
  activeEnvironmentId: string | null;

  // Resolved variables for active environment (used by request builder)
  activeEnvVariables: Record<string, string>;  // key → value (secrets excluded)

  // Editor state
  editingEnvironment: EnvironmentDetail | null;
  editorDirty: boolean;

  // Actions
  fetchEnvironments: () => Promise<void>;
  setActiveEnvironment: (envId: string | null) => void;
  loadEnvironment: (envId: string) => Promise<void>;
  saveEnvironment: (env: EnvironmentDetail) => Promise<void>;
  deleteEnvironment: (envId: string) => Promise<void>;
  duplicateEnvironment: (envId: string) => Promise<void>;
  exportEnvironment: (envId: string) => Promise<void>;
  importEnvironment: (file: File) => Promise<void>;
}
```

### 5.6 UX Behavior

- **Active environment** persists in `localStorage` per workspace. Restored on page reload.
- **Secret variables**: displayed as `••••••••` in table. Eye icon reveals value in-memory only (no extra API call — value is in component state if user just typed it; if loaded from server it's `null` → reveal shows "Value hidden by server").
- **Dirty state**: `PUT /environments/{id}` called only on explicit "Save" click, not on every keystroke. Unsaved changes show a dot indicator in sidebar.
- **New variable row**: clicking "+" appends empty row with focus on key field.
- **Tab order**: key → value → secret toggle → enabled toggle → next row.
- **Import preview**: before confirming import, show a table of variables to be created. If environment already exists with same name, offer "Import as new" vs "Replace variables" options.
- **EnvironmentSelector**: shows "No Environment" as first option. Active env name shown in header bar. Clicking opens dropdown sorted by most recently used.

---

## 6. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Initial vs current value model | Single `value` field | Matches Sept 2025 Postman redesign; eliminates confusion |
| 2 | Secret value masking | Server returns `null`; FE shows `••••••••` | Value never transmitted unless user explicitly exports |
| 3 | Secret clear sentinel | `"__CLEAR__"` string | Distinguishes "no change" (`null`) from "clear value" |
| 4 | Max variables per env | 100 | Prevents abuse; matches practical usage ceiling |
| 5 | Export format | Postman-compatible JSON | Enables round-trip import/export with real Postman |
| 6 | Active env persistence | `localStorage` per workspace | Survives page reload without a server round-trip |
| 7 | Pinned env max | 10 per collection | Prevents clutter; covers all realistic deployment stages |
| 8 | Duplicate name allowed | Yes | Useful for "copy + modify" workflow |
| 9 | Fork/PR for environments | Delegated to 16-version-control | Same engine as collection forks; no separate impl needed |

---

## 7. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | PUT with no variables array (client omits field) | Treat as "no change to variables"; only update name/description |
| 2 | PUT with empty variables array | Deletes all variables — document explicitly; warn in UI if deleting all |
| 3 | Import JSON with duplicate keys | Keep last occurrence; warn in preview |
| 4 | Import non-Postman JSON format | Parse error → 400 with "Expected Postman environment JSON" message |
| 5 | Active environment deleted | Clear `activeEnvironmentId` in store; show "No Environment" in selector |
| 6 | Pinned environment deleted | CASCADE removes pin; collection runner falls back to no env |
| 7 | Secret value sent as `null` on PUT | Preserve existing stored value (no-change semantics) |
| 8 | Secret value sent as `"__CLEAR__"` | Store as empty string `""` |
| 9 | Variable key changed while duplicate exists | 409 with `{duplicate_key}` in error body |
| 10 | Export with >100 variables (legacy data) | No cap on export; 100-limit only on create/update |
| 11 | Environment in multiple pinned collections | Fine; pin is per collection, not per environment |

---

## 8. Deferred Items

| Item | Reason |
|---|---|
| Postman Vault integration (secrets manager) | Separate feature; vault is a different secret store |
| Per-variable RBAC (some vars hidden from viewers) | Over-engineering; env-level RBAC sufficient |
| Environment versioning / history | Handled by fork/PR system in 16-version-control |
| Real-time collaborative variable editing (multi-user live) | Complex; not needed for v1 |
| Variable value templates / computed values | Out of scope; variables are static strings |
