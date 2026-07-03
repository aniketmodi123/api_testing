# Spec — Version Control (Fork / PR / Snapshot)

STATUS: Research complete
LAST_CHANGED: 2026-06-16
SOURCE: learning.postman.com/docs/collaborating-in-postman/using-version-control/ (overview + forking + creating-pull-requests + reviewing-pull-requests)

---

## Goal

Provide Git-like version control for collections and environments: fork, pull changes from parent, create pull request, review with visual diff, resolve conflicts, merge with 3 strategies, and maintain snapshot history with named tags.

---

## 1. Feature Overview

| Concept | Postman Term | APIPilot Term |
|---|---|---|
| Branch | Fork | Fork |
| Commit | Snapshot | Snapshot |
| Pull request | Pull request | Pull request |
| Pull from upstream | Pull changes | Pull changes |
| Merge | Merge | Merge |
| Tag / release | (label) | Snapshot tag |

**Forkable elements:** collections, environments, API specifications.

**Not forkable (out of scope):** individual requests, folders, flows.

---

## 2. Backend Specification

### 2.1 DB Models

#### `Fork`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `source_node_id` | UUID | FK → Node | parent element being forked |
| `fork_node_id` | UUID | FK → Node | the new forked node |
| `label` | VARCHAR(255) | nullable | user-editable fork label |
| `created_by` | UUID | FK → User | |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `last_synced_at` | TIMESTAMPTZ | nullable | last "pull from parent" timestamp |

#### `Snapshot`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `node_id` | UUID | FK → Node | element this snapshot belongs to |
| `tag` | VARCHAR(100) | nullable | user-defined name e.g. "v1.0" |
| `data` | JSONB | NOT NULL | full collection/environment JSON at snapshot time |
| `created_by` | UUID | FK → User | |
| `created_at` | TIMESTAMPTZ | NOT NULL | |

#### `PullRequest`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `fork_id` | UUID | FK → Fork | |
| `title` | VARCHAR(255) | NOT NULL | |
| `description` | TEXT | nullable | Markdown |
| `status` | ENUM | NOT NULL | `open`, `approved`, `merged`, `declined` |
| `created_by` | UUID | FK → User | |
| `merged_by` | UUID | FK → User, nullable | set on merge |
| `merge_strategy` | ENUM | nullable | `merge_only`, `merge_and_update_source`, `merge_and_delete_source` |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | |

#### `PullRequestReviewer`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `pull_request_id` | UUID | FK → PullRequest | |
| `user_id` | UUID | FK → User | |
| `status` | ENUM | NOT NULL | `pending`, `approved`, `unapproved` |
| `assigned_at` | TIMESTAMPTZ | NOT NULL | |

#### `PullRequestWatcher`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `pull_request_id` | UUID | FK → PullRequest | |
| `user_id` | UUID | FK → User | |
| Unique | `(pull_request_id, user_id)` | | |

---

### 2.2 Endpoints

#### Fork

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| `POST` | `/nodes/{id}/fork` | viewer | Fork a collection or environment |
| `GET` | `/nodes/{id}/forks` | viewer | List all forks of a node |
| `PATCH` | `/forks/{id}/label` | owner | Rename fork label |
| `POST` | `/forks/{id}/pull` | editor | Pull parent changes into fork (preview + confirm) |
| `GET` | `/forks/{id}/diff` | viewer | Diff fork against parent (returns structured delta) |

#### Snapshot

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| `POST` | `/nodes/{id}/snapshots` | editor | Create named snapshot of current state |
| `GET` | `/nodes/{id}/snapshots` | viewer | List all snapshots for a node (paginated) |
| `GET` | `/snapshots/{id}` | viewer | Get full snapshot data |
| `POST` | `/snapshots/{id}/restore` | editor | Restore node to snapshot state |
| `GET` | `/snapshots/{a}/diff/{b}` | viewer | Diff two snapshots; returns structured delta |

#### Pull Request

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| `POST` | `/pull-requests` | viewer | Create PR from a fork |
| `GET` | `/pull-requests/{id}` | viewer | Get PR details + diff |
| `GET` | `/nodes/{id}/pull-requests` | viewer | List PRs targeting a node |
| `PUT` | `/pull-requests/{id}` | owner | Edit PR title/description |
| `POST` | `/pull-requests/{id}/reviewers` | editor | Add reviewers (up to 50) |
| `DELETE` | `/pull-requests/{id}/reviewers/{userId}` | editor | Remove reviewer |
| `POST` | `/pull-requests/{id}/approve` | reviewer | Approve PR |
| `POST` | `/pull-requests/{id}/unapprove` | reviewer | Revoke approval |
| `POST` | `/pull-requests/{id}/decline` | editor | Permanently decline PR |
| `POST` | `/pull-requests/{id}/merge` | editor | Merge PR with chosen strategy |
| `POST` | `/pull-requests/{id}/watch` | viewer | Watch PR for notifications |
| `DELETE` | `/pull-requests/{id}/watch` | viewer | Stop watching PR |

---

### 2.3 Request Bodies

**`POST /nodes/{id}/fork`**
```json
{ "label": "string | null" }
```

**`POST /pull-requests`**
```json
{
  "fork_id": "UUID",
  "title": "string",
  "description": "string | null",
  "reviewer_ids": ["UUID"]
}
```

**`POST /pull-requests/{id}/merge`**
```json
{
  "strategy": "merge_only | merge_and_update_source | merge_and_delete_source",
  "conflict_resolutions": [
    { "path": "requests.0.headers.1", "keep": "source | destination" }
  ]
}
```

**`POST /nodes/{id}/snapshots`**
```json
{ "tag": "string | null" }
```

---

### 2.4 Diff Format

Both `/forks/{id}/diff` and `/snapshots/{a}/diff/{b}` return the same structured delta:

```json
{
  "summary": { "additions": 3, "deletions": 1, "modifications": 5 },
  "changes": [
    {
      "path": "requests.0.headers.Authorization",
      "type": "modification",
      "before": "Bearer old",
      "after": "Bearer new"
    },
    {
      "path": "requests.1",
      "type": "addition",
      "after": { /* full request object */ }
    }
  ]
}
```

---

### 2.5 Business Logic

**Fork creation:**
- Creates a deep copy of the node's current data.
- Inserts `Fork` row linking source and fork nodes.
- Returns the new fork node ID for navigation.

**Pull from parent:**
- Computes diff between parent's current state and fork's last-synced state.
- If no conflicts: applies changes, updates `last_synced_at`.
- If conflicts: returns diff with conflict flags; client sends `conflict_resolutions`.

**PR merge strategies:**
- `merge_only`: apply fork changes to parent; fork survives unchanged.
- `merge_and_update_source`: merge + pull parent state back into fork.
- `merge_and_delete_source`: merge + soft-delete fork node.

**PR states:**
- `open` → `approved` (reviewer approves) → `merged` (editor merges)
- `open` → `declined` (terminal; cannot reopen)
- `approved` → `unapproved` (reviewer revokes before merge)

**Notifications:**
- PR created → email + in-app to all assigned reviewers.
- Reviewer comments/approves/merges → in-app + email to PR creator.
- PR watcher → in-app for any PR state change.

---

### 2.6 Validation Rules

| Rule | Error |
|---|---|
| PR on non-forked node | 400 `node_is_not_a_fork` |
| Reviewer does not have Editor on parent | 400 `reviewer_needs_editor_access` |
| More than 50 reviewers | 400 `reviewer_limit_exceeded` |
| Merge on `declined` PR | 409 `pr_is_declined` |
| Merge with unresolved conflicts | 409 `conflicts_must_be_resolved` |
| Snapshot `tag` longer than 100 chars | 400 `tag_too_long` |

---

## 3. Frontend Specification

### 3.1 Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Diff rendering | `jsondiffpatch` + custom renderer | Renders hierarchical JSON diffs; visual added/removed/modified with color coding |
| Relative timestamps | `date-fns` | Already in project |
| Conflict resolution UI | Custom side-by-side panel | Postman uses "Keep Source / Keep Destination" per conflict — simple enough to build custom |

### 3.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `VersionHistorySidebar` | `components/version-control/VersionHistorySidebar.tsx` | Right panel listing snapshots for current collection |
| `SnapshotListItem` | `components/version-control/SnapshotListItem.tsx` | One row: tag, timestamp, author, Restore button |
| `CreateSnapshotModal` | `components/version-control/CreateSnapshotModal.tsx` | Modal to name + save snapshot |
| `VersionDiffView` | `components/version-control/VersionDiffView.tsx` | Side-by-side diff of two snapshots using jsondiffpatch |
| `ForkLabelBadge` | `components/version-control/ForkLabelBadge.tsx` | Editable label shown in sidebar below forked collection name |
| `PullRequestCreateModal` | `components/version-control/PullRequestCreateModal.tsx` | Multi-step: title/desc → reviewer picker → submit |
| `PullRequestListPanel` | `components/version-control/PullRequestListPanel.tsx` | Lists open/closed PRs for a collection |
| `PullRequestReviewView` | `components/version-control/PullRequestReviewView.tsx` | Full PR review: diff + approve/decline/merge buttons |
| `ConflictResolutionPanel` | `components/version-control/ConflictResolutionPanel.tsx` | Per-conflict "Keep Source / Keep Destination" picker |
| `PullChangesModal` | `components/version-control/PullChangesModal.tsx` | Preview diff from parent then confirm pull |

### 3.3 TypeScript Interfaces

```typescript
interface Snapshot {
  id: string;
  nodeId: string;
  tag: string | null;
  createdBy: { id: string; name: string; avatarUrl: string };
  createdAt: string;
}

interface SnapshotDiff {
  summary: { additions: number; deletions: number; modifications: number };
  changes: DiffChange[];
}

interface DiffChange {
  path: string;
  type: 'addition' | 'deletion' | 'modification';
  before?: unknown;
  after?: unknown;
}

interface Fork {
  id: string;
  sourceNodeId: string;
  forkNodeId: string;
  label: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  lastSyncedAt: string | null;
}

interface PullRequest {
  id: string;
  forkId: string;
  title: string;
  description: string | null;
  status: 'open' | 'approved' | 'merged' | 'declined';
  createdBy: { id: string; name: string; avatarUrl: string };
  reviewers: PRReviewer[];
  createdAt: string;
  updatedAt: string;
}

interface PRReviewer {
  userId: string;
  name: string;
  avatarUrl: string;
  status: 'pending' | 'approved' | 'unapproved';
}

interface ConflictResolution {
  path: string;
  keep: 'source' | 'destination';
}
```

### 3.4 Component Render Descriptions

**`VersionHistorySidebar`**
- Fetches `GET /nodes/{nodeId}/snapshots` paginated (20 per page).
- "Create Snapshot" button at top opens `CreateSnapshotModal`.
- Each snapshot: `SnapshotListItem`. Click selects it for diff.
- Select two snapshots → "Compare" button opens `VersionDiffView`.

**`PullRequestReviewView`**
- Loads PR + diff on mount.
- Diff section uses `jsondiffpatch` renderer: additions green, deletions red, modifications yellow.
- "Jump to" navigation for large diffs.
- Approve / Unapprove button (reviewer only).
- Decline button (editor only, via "More actions" menu).
- Merge button (editor only, appears after at least one approval).
  - Opens merge strategy picker: "Merge only / Merge and update source / Merge and delete source".
  - If conflicts: opens `ConflictResolutionPanel` before merge.

**`ConflictResolutionPanel`**
- Lists each conflicting path with side-by-side values.
- Radio per conflict: "Keep Source (parent)" | "Keep Destination (fork)".
- Must resolve all conflicts before Confirm Merge enables.

**`PullChangesModal`**
- Shows diff of parent changes not yet in fork.
- "Pull Changes" button sends `POST /forks/{id}/pull`.
- If conflicts in pull: same `ConflictResolutionPanel` flow inline.

### 3.5 API Calls Table

| Action | Method | URL | Trigger |
|---|---|---|---|
| List snapshots | GET | `/nodes/{nodeId}/snapshots` | VersionHistorySidebar mount |
| Create snapshot | POST | `/nodes/{nodeId}/snapshots` | CreateSnapshotModal confirm |
| Restore snapshot | POST | `/snapshots/{id}/restore` | SnapshotListItem Restore button |
| Diff two snapshots | GET | `/snapshots/{a}/diff/{b}` | VersionDiffView on selection |
| Fork element | POST | `/nodes/{id}/fork` | "Fork" button in collection menu |
| List forks | GET | `/nodes/{id}/forks` | Fork panel in collection info |
| Pull from parent | POST | `/forks/{id}/pull` | PullChangesModal confirm |
| Diff fork vs parent | GET | `/forks/{id}/diff` | PullChangesModal preview |
| Create PR | POST | `/pull-requests` | PullRequestCreateModal submit |
| List PRs | GET | `/nodes/{id}/pull-requests` | PullRequestListPanel mount |
| Get PR | GET | `/pull-requests/{id}` | PullRequestReviewView mount |
| Approve PR | POST | `/pull-requests/{id}/approve` | Approve button |
| Decline PR | POST | `/pull-requests/{id}/decline` | Decline menu action |
| Merge PR | POST | `/pull-requests/{id}/merge` | Merge button with strategy + resolutions |
| Watch PR | POST | `/pull-requests/{id}/watch` | Watch toggle |

### 3.6 State Shape

```typescript
interface VersionControlState {
  snapshotsByNodeId: Record<string, {
    items: Snapshot[];
    loading: boolean;
    hasMore: boolean;
    selectedIds: [string?, string?];   // up to 2 for diff
  }>;
  forksByNodeId: Record<string, Fork[]>;
  pullRequests: Record<string, PullRequest>;   // by PR id
  activeDiff: SnapshotDiff | null;
  activeConflicts: ConflictResolution[];
}
```

---

## 4. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Diff library | `jsondiffpatch` | Hierarchical JSON diff exactly matching collection data shape; renders addition/deletion/modification clearly |
| 2 | Merge strategies | 3 options: merge_only / update_source / delete_source | Matches Postman's exact 3-option merge flow |
| 3 | PR reviewer limit | 50 | Matches Postman; prevent abuse |
| 4 | Declined PRs | Terminal (cannot reopen) | Postman behavior; reviewer must create new PR if declined in error |
| 5 | Snapshot data storage | Full JSONB blob per snapshot | Enables restore without re-computation; storage cost acceptable for typical collection sizes |
| 6 | Fork as separate Node | Fork creates new Node record | Enables reuse of existing node permission + endpoint system on fork |
| 7 | Named snapshot tags | Optional VARCHAR on Snapshot | Postman supports user-defined version names (e.g. "v1.0") |

---

## 5. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Merge conflicts in PR | Block merge; surface `ConflictResolutionPanel`; require all resolved before proceed |
| 2 | Parent deleted after fork | `source_node_id` FK becomes orphan; cascade soft-delete forks; show "Parent deleted" badge on PR |
| 3 | Fork of a fork | `source_node_id` → fork node; diff computed against immediate parent, not original root |
| 4 | PR merged while reviewer still reviewing | PR status transitions to `merged`; reviewer UI shows "Already merged" banner |
| 5 | Snapshot `data` > 10MB (huge collection) | Store as compressed JSONB; warn user if restore will overwrite unpublished changes |
| 6 | Diff between snapshot + current unsaved state | Disallow — only compare committed snapshots or current saved state |
| 7 | `merge_and_delete_source` on fork with open child PRs | 409 `fork_has_open_prs`; must close child PRs first |

---

## 6. Deferred

| Item | Reason |
|---|---|
| Multi-level fork tree (fork of a fork of a fork) | UX complexity; limit to 2 levels in MVP |
| Git remote sync (push/pull to GitHub/GitLab) | Separate Git integration feature (not version control feature) |
| Snapshot auto-creation on save | Noise; user-triggered only for MVP |
| PR labels / milestones | Nice-to-have; no demand signal |
| Line-level diff for script content | jsondiffpatch shows string changes; word-diff for scripts is enhancement |
