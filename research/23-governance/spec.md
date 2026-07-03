# Spec — Governance

STATUS: Research complete
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_13_governance/spec.md + live research 2026-06-16

---

## 1. Goal

Enforce API design standards and consistency by linting OpenAPI specifications against configurable rulesets (Spectral v6). Mirrors Postman's enterprise governance capability: rule libraries, governance groups, severity-per-group, CI/CD integration, compliance reports.

---

## 2. Postman Feature Parity (what we must match)

| Postman Feature | APIPilot Scope |
|---|---|
| Built-in rule libraries (Postman, Zalando, OWASP) | Yes — seed DB with bundled rules |
| Custom Spectral v6 rules (YAML/JSON upload) | Yes |
| Custom JavaScript functions for rules | Yes (ES6/CommonJS, `targetVal` + optional `options` + `context`) |
| Governance Groups (workspaces → group → rules + severity override) | Yes — core model |
| Default "All workspaces" group | Yes |
| Rule enable/disable per group | Yes |
| Severity override per group (same rule, stricter in regulated group) | Yes |
| Real-time linting in spec editor (debounced) | Yes |
| Inline Monaco editor markers for violations | Yes |
| Rule violations panel (clickable → jump to line) | Yes |
| CI/CD linting via CLI (`postman spec lint`) | Out of scope (no CLI product) |
| Governance reports dashboard | Yes — simplified version |
| Security rules (OWASP request-level checks) | Deferred (spec-level only for now) |
| API Governance Manager role | Map to existing `admin` role |
| Hide violations with reason | Yes |

---

## 3. Data Models

### 3.1 GovernanceRuleLibrary
Seed-only table. Bundled rule sets APIPilot ships.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL, UNIQUE | e.g. "Postman API Guidelines", "Zalando RESTful", "OWASP API Top 10" |
| slug | VARCHAR(50) | NOT NULL, UNIQUE | `postman`, `zalando`, `owasp` |
| description | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### 3.2 GovernanceRule
Individual linting rule. May be built-in (library) or custom (user-created).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace, NULL for built-in | NULL = global built-in |
| library_id | UUID | FK → GovernanceRuleLibrary, nullable | NULL for custom rules |
| name | VARCHAR(100) | NOT NULL | Human display name |
| slug | VARCHAR(100) | NOT NULL | Machine key, e.g. `operation-id-camel-case` |
| description | TEXT | | |
| spectral_rule | JSONB | NOT NULL | Full Spectral rule object: `{given, then, message?, severity?, formats?, resolved?}` |
| is_builtin | BOOLEAN | NOT NULL, DEFAULT false | |
| created_by | UUID | FK → User, nullable | NULL for built-ins |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

Unique constraint: `(workspace_id, slug)` — custom rules per workspace; `(library_id, slug)` for built-ins.

### 3.3 GovernanceCustomFunction
JavaScript custom functions attachable to rules.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | Referenced by rule's `then.function` |
| source_code | TEXT | NOT NULL | ES6 or CommonJS. Must export default fn with `targetVal` param |
| created_by | UUID | FK → User | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

Unique: `(workspace_id, name)`.

### 3.4 GovernanceGroup
Groups workspaces for shared rule configuration with severity overrides.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace (owner), NOT NULL | The workspace that manages this group |
| name | VARCHAR(100) | NOT NULL | |
| description | TEXT | | |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | Only one default per workspace |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### 3.5 GovernanceGroupWorkspace
Many-to-many: which workspaces belong to a governance group.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| group_id | UUID | FK → GovernanceGroup | |
| member_workspace_id | UUID | FK → Workspace | The workspace being governed |
| PK | (group_id, member_workspace_id) | | |

### 3.6 GovernanceGroupRule
Rules assigned to a group, with optional severity override.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| group_id | UUID | FK → GovernanceGroup | |
| rule_id | UUID | FK → GovernanceRule | |
| enabled | BOOLEAN | NOT NULL, DEFAULT true | |
| severity_override | VARCHAR(10) | nullable | `error`, `warn`, `info`, `hint`; NULL = use rule default |
| PK | (group_id, rule_id) | | |

### 3.7 GovernanceViolation
Persisted violation record per spec lint run.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| spec_id | UUID | FK → OpenApiSpec | |
| rule_id | UUID | FK → GovernanceRule | |
| severity | VARCHAR(10) | NOT NULL | Effective severity at time of lint (after override) |
| message | TEXT | NOT NULL | Spectral-generated message |
| line | INTEGER | NOT NULL | 1-indexed line number in spec content |
| column | INTEGER | nullable | Column offset |
| path | TEXT | nullable | JSON path in spec e.g. `$.paths./users.get.operationId` |
| is_hidden | BOOLEAN | NOT NULL, DEFAULT false | User dismissed this violation |
| hidden_reason | TEXT | nullable | Required when is_hidden = true |
| hidden_by | UUID | FK → User, nullable | |
| hidden_at | TIMESTAMPTZ | nullable | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Index: `(spec_id, is_hidden)` for fast panel load.

---

## 4. Backend Specification

### 4.1 Endpoints

#### Rule Library (built-in rules)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/governance/libraries` | viewer | List all built-in rule libraries |
| GET | `/governance/libraries/{library_slug}/rules` | viewer | List all rules in a built-in library |

#### Rules (workspace-scoped custom rules)

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/governance/rules` | viewer | List all rules (built-in + workspace custom) |
| POST | `/governance/rules` | admin | Create custom rule (Spectral YAML/JSON body) |
| GET | `/governance/rules/{rule_id}` | viewer | Get single rule |
| PUT | `/governance/rules/{rule_id}` | admin | Update custom rule |
| DELETE | `/governance/rules/{rule_id}` | admin | Delete custom rule (not built-ins) |
| POST | `/governance/rules/import` | admin | Batch import rules from uploaded YAML/JSON file |

#### Custom Functions

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/governance/functions` | admin | List custom functions for workspace |
| POST | `/governance/functions` | admin | Create function |
| PUT | `/governance/functions/{fn_id}` | admin | Update function source |
| DELETE | `/governance/functions/{fn_id}` | admin | Delete function |

#### Governance Groups

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/governance/groups` | viewer | List governance groups |
| POST | `/governance/groups` | admin | Create group |
| GET | `/governance/groups/{group_id}` | viewer | Get group + member workspaces + rules |
| PUT | `/governance/groups/{group_id}` | admin | Rename/describe group |
| DELETE | `/governance/groups/{group_id}` | admin | Delete group (not default) |
| POST | `/governance/groups/{group_id}/workspaces` | admin | Add workspace(s) to group |
| DELETE | `/governance/groups/{group_id}/workspaces/{ws_id}` | admin | Remove workspace from group |
| GET | `/governance/groups/{group_id}/rules` | viewer | List rules in group with enabled status + severity override |
| PUT | `/governance/groups/{group_id}/rules` | admin | Bulk set rules for group (enabled + severity_override) |
| PATCH | `/governance/groups/{group_id}/rules/{rule_id}` | admin | Toggle single rule or change severity override |

#### Linting

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/governance/lint` | viewer | Lint spec content against workspace's active rules; returns violations array |
| POST | `/governance/specs/{spec_id}/lint` | viewer | Lint saved spec; persists violations to GovernanceViolation table |
| GET | `/governance/specs/{spec_id}/violations` | viewer | Fetch persisted violations for spec |
| PATCH | `/governance/specs/{spec_id}/violations/{violation_id}/hide` | editor | Hide a violation with reason |
| PATCH | `/governance/specs/{spec_id}/violations/{violation_id}/show` | editor | Unhide violation |

#### Reports

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| GET | `/governance/reports/summary` | admin | Conformant vs non-conformant spec counts, violations by severity |
| GET | `/governance/reports/trends` | admin | Monthly violation counts over last 12 months |
| GET | `/governance/reports/rules` | admin | Per-rule violation counts across all specs |

### 4.2 Business Logic

#### Rule Resolution (which rules apply to a spec)
1. Get spec's workspace_id.
2. Find all GovernanceGroups whose GovernanceGroupWorkspace includes this workspace.
3. If no groups → use default "All workspaces" group.
4. Union all enabled GroupRules from all matching groups.
5. If same rule appears in multiple groups: take strictest severity (error > warn > info > hint).

#### Linting Engine
- Use `@stoplight/spectral-core` + `@stoplight/spectral-parsers` Node.js libs (run via subprocess or embedded Node worker).
- Input: spec content (string, YAML or JSON), resolved ruleset (array of Spectral rule objects).
- Output: array of `{rule_slug, message, severity, line, column, path}`.
- Debounce on FE side (500ms); backend is stateless per call.
- Custom functions: inject as Spectral custom functions before running lint.

#### Spectral Rule Validation
- On POST `/governance/rules`: parse submitted YAML/JSON, validate `given` (valid JSONPath) and `then.function` (known Spectral function or registered custom function name).
- Reject if `then.function` references a custom function not yet uploaded.

#### Conformance Status
- Spec is **conformant** if all violations are severity `info` or `hint` only.
- Spec is **non-conformant** if any violation is `error` or `warn`.

### 4.3 Request/Response Schemas

**POST `/governance/lint` request:**
```json
{
  "content": "openapi: 3.0.0\n...",
  "format": "yaml",           // "yaml" | "json"
  "group_id": "uuid|null"     // null = use workspace default resolution
}
```

**Violation object:**
```json
{
  "rule_id": "uuid",
  "rule_slug": "operation-id-camel-case",
  "rule_name": "Operation ID Camel Case",
  "severity": "warn",
  "message": "Operation ID 'list_users' must be camelCase",
  "line": 42,
  "column": 5,
  "path": "$.paths./users.get.operationId"
}
```

**GovernanceGroup rule config object:**
```json
{
  "rule_id": "uuid",
  "rule_slug": "operation-id-camel-case",
  "enabled": true,
  "severity_override": "error"   // null = use rule default
}
```

### 4.4 Validation Rules

| Field | Rule |
|---|---|
| `spectral_rule.given` | Must be valid JSONPath Plus expression |
| `spectral_rule.then.function` | Must be known Spectral built-in or registered custom fn name |
| `spectral_rule.severity` | One of: `error`, `warn`, `info`, `hint` |
| `severity_override` | One of: `error`, `warn`, `info`, `hint` or null |
| Custom function `source_code` | Must export default function; must have `targetVal` as first param |
| Group name | 1–100 chars |
| Rule slug | 1–100 chars, lowercase kebab-case |
| Cannot delete built-in rule | 400 if `is_builtin = true` |
| Cannot delete default group | 400 |

### 4.5 Modified Files

| File | Change |
|---|---|
| `models/governance.py` | New ORM models: all 7 models above |
| `routers/governance.py` | All endpoints above |
| `services/governance_lint.py` | Spectral engine subprocess wrapper, rule resolution logic |
| `services/governance_reports.py` | Report aggregation queries |
| `alembic/versions/xxx_governance.py` | Migration: create all 7 tables + seed built-in libraries |
| `seeds/governance_rules.py` | Seed script: Postman, Zalando, OWASP built-in rules |

---

## 5. Frontend Specification

### 5.1 Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Spec editor with inline markers | Monaco Editor (`@monaco-editor/react`) | Same as 20-openapi-specs; supports `editor.setModelMarkers()` for inline violation highlighting |
| Rule YAML editor | Monaco Editor (YAML mode) | Same lib, language mode switch |
| Lint debounce | 500ms (`useDebounce` hook) | Fast enough for real-time feel; avoids thrashing lint endpoint on every keystroke |
| State management | Zustand slice `governanceStore` | Project standard |

### 5.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `GovernanceDashboard` | `pages/governance/` | Top-level admin view: groups + rule library tabs |
| `GovernanceGroupList` | `components/governance/` | List all groups; create/delete group buttons |
| `GovernanceGroupEditor` | `components/governance/` | Edit group: assign workspaces, enable/disable rules, set severity overrides |
| `WorkspaceAssignPicker` | `components/governance/` | Multi-select picker for assigning workspaces to a group |
| `RuleLibraryBrowser` | `components/governance/` | Browse built-in rule libraries; add to group |
| `CustomRuleEditor` | `components/governance/` | Create/edit custom rule: Monaco YAML editor + validation feedback |
| `CustomFunctionEditor` | `components/governance/` | Create/edit JS custom function: Monaco JS editor |
| `RuleGroupTable` | `components/governance/` | Table: rule slug, name, enabled toggle, severity select per group |
| `LintReportPanel` | `components/spec-editor/` | Docked violation list; each row clickable → jump to line in Monaco |
| `ViolationRow` | `components/spec-editor/` | Single violation: severity badge, rule name, message, line number, hide button |
| `HideViolationModal` | `components/spec-editor/` | Confirm hide with required reason text |
| `ConformanceBadge` | `components/spec-editor/` | Green "Conformant" / Red "Non-conformant" pill shown in spec header |
| `GovernanceReportsDashboard` | `pages/governance/reports/` | Admin-only: summary + trend charts |
| `ConformanceSummaryCard` | `components/governance/reports/` | Count of conformant vs non-conformant specs |
| `ViolationTrendChart` | `components/governance/reports/` | Line chart: violations by severity over 12 months (recharts) |
| `RuleViolationTable` | `components/governance/reports/` | Per-rule violation counts, sortable |

### 5.3 Per-Component TypeScript Interfaces

```typescript
// GovernanceGroup
interface GovernanceGroup {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  workspace_count: number;
  rule_count: number;
  created_at: string;
}

// GovernanceRule
interface GovernanceRule {
  id: string;
  library_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  spectral_rule: SpectralRuleObject;
  is_builtin: boolean;
}

interface SpectralRuleObject {
  given: string;
  then: { function: string; functionOptions?: Record<string, unknown> };
  message?: string;
  severity?: 'error' | 'warn' | 'info' | 'hint';
  formats?: string[];
  resolved?: boolean;
}

// GroupRuleConfig
interface GroupRuleConfig {
  rule_id: string;
  rule_slug: string;
  rule_name: string;
  enabled: boolean;
  severity_override: 'error' | 'warn' | 'info' | 'hint' | null;
}

// LintViolation (from POST /governance/lint)
interface LintViolation {
  rule_id: string;
  rule_slug: string;
  rule_name: string;
  severity: 'error' | 'warn' | 'info' | 'hint';
  message: string;
  line: number;
  column: number;
  path: string;
}

// GovernanceGroupEditorProps
interface GovernanceGroupEditorProps {
  groupId: string;
  onSave: () => void;
  onCancel: () => void;
}

// LintReportPanelProps
interface LintReportPanelProps {
  specId: string;
  violations: LintViolation[];
  onJumpToLine: (line: number) => void;
  onHide: (violationId: string, reason: string) => void;
}

// CustomRuleEditorProps
interface CustomRuleEditorProps {
  ruleId: string | null;  // null = create mode
  onSave: (rule: GovernanceRule) => void;
}
```

### 5.4 API Calls Table

| Action | Method | URL | When Triggered |
|---|---|---|---|
| Load groups | GET | `/governance/groups` | GovernanceDashboard mount |
| Create group | POST | `/governance/groups` | GovernanceGroupList "New Group" submit |
| Load group detail | GET | `/governance/groups/{id}` | GovernanceGroupEditor open |
| Update group rules | PUT | `/governance/groups/{id}/rules` | GovernanceGroupEditor "Apply Changes" |
| Toggle single rule | PATCH | `/governance/groups/{id}/rules/{rule_id}` | RuleGroupTable toggle |
| Add workspace to group | POST | `/governance/groups/{id}/workspaces` | WorkspaceAssignPicker confirm |
| Remove workspace | DELETE | `/governance/groups/{id}/workspaces/{ws_id}` | WorkspaceAssignPicker deselect |
| List built-in libraries | GET | `/governance/libraries` | RuleLibraryBrowser mount |
| List library rules | GET | `/governance/libraries/{slug}/rules` | RuleLibraryBrowser expand |
| Create custom rule | POST | `/governance/rules` | CustomRuleEditor save |
| Update custom rule | PUT | `/governance/rules/{id}` | CustomRuleEditor save (edit mode) |
| Delete custom rule | DELETE | `/governance/rules/{id}` | CustomRuleEditor delete confirm |
| Import rules | POST | `/governance/rules/import` | RuleLibraryBrowser "Import from file" |
| Lint spec (real-time) | POST | `/governance/lint` | SpecEditor onChange debounced 500ms |
| Load persisted violations | GET | `/governance/specs/{id}/violations` | LintReportPanel mount |
| Hide violation | PATCH | `/governance/specs/{id}/violations/{vid}/hide` | HideViolationModal confirm |
| Reports summary | GET | `/governance/reports/summary` | GovernanceReportsDashboard mount |
| Reports trends | GET | `/governance/reports/trends` | GovernanceReportsDashboard mount |

### 5.5 State Shape (Zustand)

```typescript
interface GovernanceStore {
  // Groups
  groups: GovernanceGroup[];
  groupsLoading: boolean;
  activeGroupId: string | null;
  activeGroupRules: GroupRuleConfig[];

  // Rules
  builtinLibraries: { id: string; name: string; slug: string }[];
  customRules: GovernanceRule[];
  rulesLoading: boolean;

  // Lint state (per spec — keyed by spec_id)
  lintViolations: Record<string, LintViolation[]>;
  lintLoading: Record<string, boolean>;

  // Reports
  reportsSummary: GovernanceReportSummary | null;
  reportsTrends: GovernanceReportTrend[] | null;

  // Actions
  fetchGroups: () => Promise<void>;
  fetchGroupDetail: (groupId: string) => Promise<void>;
  updateGroupRules: (groupId: string, rules: GroupRuleConfig[]) => Promise<void>;
  lintSpec: (specId: string, content: string) => Promise<void>;
  hideViolation: (specId: string, violationId: string, reason: string) => Promise<void>;
  fetchReports: () => Promise<void>;
}
```

### 5.6 SpecEditor Integration (Monaco markers)

On every debounced lint result:
```typescript
// Map LintViolation severity → Monaco MarkerSeverity
const severityMap = {
  error: monaco.MarkerSeverity.Error,
  warn: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
  hint: monaco.MarkerSeverity.Hint,
};

const markers = violations.map(v => ({
  startLineNumber: v.line,
  startColumn: v.column,
  endLineNumber: v.line,
  endColumn: v.column + 1,
  message: `[${v.rule_slug}] ${v.message}`,
  severity: severityMap[v.severity],
}));

monaco.editor.setModelMarkers(editorRef.current.getModel(), 'governance', markers);
```

LintReportPanel row click calls `onJumpToLine(violation.line)` → `editor.revealLineInCenter(line)` + `editor.setPosition({lineNumber: line, column: 1})`.

---

## 6. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Linting engine | Spectral v6 (`@stoplight/spectral-core`) | Postman-native; supports JSONPath + custom functions |
| 2 | Rule format | YAML or JSON (Spectral format) | Spectral standard; both accepted on import |
| 3 | Custom function language | JavaScript (ES6/CommonJS) | Spectral only supports JS functions |
| 4 | Severity hierarchy | error > warn > info > hint | Matches Spectral/Postman ordering |
| 5 | Conformance threshold | error or warn = non-conformant; info/hint = conformant | Matches Postman's definition |
| 6 | Group rule conflict resolution | Strictest severity wins when same rule in multiple groups | Prevents severity downgrade via group membership |
| 7 | Real-time linting debounce | 500ms | Below 300ms floods backend; above 700ms feels slow |
| 8 | Security rules (OWASP request-level) | Deferred | Spec-level linting first; request-level is a separate engine |
| 9 | CI/CD linting | Out of scope | No CLI product; Spec Hub CI integration deferred |
| 10 | Reports non-realtime | Acceptable | Matches Postman (reports don't update in real time) |
| 11 | Governance Manager role | Map to `admin` | APIPilot has no sub-admin role system yet |
| 12 | Built-in rules seeded how | DB seed migration | Simplest; no external API call needed at runtime |

---

## 7. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Custom function referenced in rule not yet uploaded | Validate on rule save; 400 if function name not in GovernanceCustomFunction |
| 2 | Spec content invalid YAML/JSON (parse error before lint) | Return parse error as single synthetic violation at line 1, severity `error` |
| 3 | Workspace in zero governance groups | Fall back to default "All workspaces" group rules |
| 4 | Same rule in two groups with different severity | Take strictest (lowest in: hint < info < warn < error) |
| 5 | User deletes built-in rule | 400: `is_builtin = true`, cannot delete |
| 6 | User deletes default group | 400: `is_default = true`, cannot delete |
| 7 | Lint called with empty content | Return 400; don't run Spectral |
| 8 | Spectral subprocess crashes | Catch subprocess error; return 500 with safe message; log full error |
| 9 | Monaco editor unmounted before lint response returns | Cancel debounced call; check editor ref before calling `setModelMarkers` |
| 10 | Hidden violation re-triggered by next lint run | `POST /governance/lint` returns fresh violations; FE filters against hidden list from persisted violations endpoint |
| 11 | Import file contains duplicate rule slug | Upsert by `(workspace_id, slug)`: update existing, insert new |
| 12 | Governance group with 0 rules enabled | Lint returns 0 violations; spec shown as conformant |

---

## 8. Deferred Items

| Item | Reason |
|---|---|
| Security rules (OWASP request-level, checks on Collection requests) | Separate engine; spec-level only for v1 |
| CI/CD CLI (`postman spec lint` equivalent) | No CLI product in APIPilot |
| Governance reports: workspace-level filtering | Reports show org-wide data only; workspace drill-down deferred |
| Custom domain for public governance policy page | No public-facing governance portal planned |
| Rule severity per-spec override (not per-group) | Over-engineering; group-level is sufficient |
| Postman Flows governance integration | Flows are code; spec linting doesn't apply |
