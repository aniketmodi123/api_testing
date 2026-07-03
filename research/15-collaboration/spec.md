# Spec — Collaboration (Comments)

STATUS: Research complete
LAST_CHANGED: 2026-06-16
SOURCE: learning.postman.com/docs/collaborating-in-postman/comments + blog.postman.com/new-inline-comments

---

## Goal

Enable team collaboration through inline comments, global comments, replies, @mentions, reactions, and resolution on API requests, collections, folders, and examples.

---

## 1. Feature Overview

Postman has two comment modes:

| Mode | Description | Where |
|---|---|---|
| Global comment | General feedback on a whole element | Collections, folders, requests, examples, manual runs, pull requests |
| Inline comment | Pinned to a specific UI element within a request/example | Query params, path params, headers, form-data, x-www-form-urlencoded, raw body, pre-request script lines, post-response script lines, API spec lines |

Comments support Markdown (bold, italics, code, links, tables, image embeds).

---

## 2. Backend Specification

### 2.1 DB Models

#### `Comment`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `node_id` | UUID | FK → Node, nullable | null when attached to PR or run |
| `pull_request_id` | UUID | FK → PullRequest, nullable | set when comment is on a PR |
| `parent_id` | UUID | FK → Comment, nullable | null = root comment; set = reply |
| `author_id` | UUID | FK → User | |
| `body` | TEXT | NOT NULL | Markdown |
| `is_resolved` | BOOLEAN | default false | only meaningful on root comments |
| `context_selector` | VARCHAR(255) | nullable | CSS-like selector anchoring inline comment to a UI element (e.g. `header:2`, `query:api_key`, `script:pre:14`) |
| `context_type` | ENUM | nullable | `query_param`, `path_param`, `header`, `form_data`, `raw_body`, `script_pre`, `script_post`, `spec_line` |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | |
| `deleted_at` | TIMESTAMPTZ | nullable | soft delete |

#### `CommentReaction`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `comment_id` | UUID | FK → Comment | |
| `user_id` | UUID | FK → User | |
| `emoji` | VARCHAR(10) | NOT NULL | Unicode emoji character |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| Unique | `(comment_id, user_id, emoji)` | | one reaction per emoji per user |

#### `CommentMention`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `comment_id` | UUID | FK → Comment | |
| `mentioned_user_id` | UUID | FK → User | |
| `notified_at` | TIMESTAMPTZ | nullable | null = not yet sent |

---

### 2.2 Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| `POST` | `/nodes/{id}/comments` | viewer | Add global or inline comment to a node |
| `GET` | `/nodes/{id}/comments` | viewer | List all comment threads for a node (threaded) |
| `PUT` | `/comments/{id}` | owner | Edit own comment body |
| `DELETE` | `/comments/{id}` | owner (or workspace admin) | Soft-delete a comment |
| `POST` | `/comments/{id}/resolve` | editor | Mark thread resolved |
| `POST` | `/comments/{id}/reopen` | editor | Reopen a resolved thread |
| `POST` | `/comments/{id}/replies` | viewer | Add reply to a comment thread |
| `POST` | `/comments/{id}/reactions` | viewer | Add emoji reaction to a comment |
| `DELETE` | `/comments/{id}/reactions/{emoji}` | owner | Remove own reaction |
| `POST` | `/pull-requests/{id}/comments` | reviewer | Add comment on a PR |
| `GET` | `/pull-requests/{id}/comments` | reviewer | List PR comments |

### 2.3 Request Body — `POST /nodes/{id}/comments`

```json
{
  "body": "string (Markdown)",
  "parent_id": "UUID | null",
  "context_selector": "string | null",
  "context_type": "query_param | path_param | header | form_data | raw_body | script_pre | script_post | spec_line | null",
  "mentions": ["user_id_1", "user_id_2"]
}
```

### 2.4 Response — `GET /nodes/{id}/comments`

```json
{
  "threads": [
    {
      "id": "uuid",
      "author": { "id": "uuid", "name": "Alice", "avatar_url": "..." },
      "body": "markdown string",
      "is_resolved": false,
      "context_selector": "header:Authorization",
      "context_type": "header",
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "reactions": [{ "emoji": "👍", "count": 2, "reacted_by_me": true }],
      "replies": [
        {
          "id": "uuid",
          "author": { "id": "uuid", "name": "Bob", "avatar_url": "..." },
          "body": "markdown string",
          "reactions": [],
          "created_at": "ISO8601"
        }
      ]
    }
  ]
}
```

### 2.5 Business Logic

- Only the comment author can edit; workspace admins can delete (not edit) others' comments.
- `resolve` and `reopen` apply only to root comments (`parent_id IS NULL`).
- When `context_selector` is present, the comment is inline — return it with the thread so FE can pin it.
- `@mention` in `body`: parse `@username` tokens server-side, resolve to user IDs, insert `CommentMention` rows, fire notification.
- Notification rules:
  - `@mention` → email + in-app to mentioned user
  - Reply to thread → in-app + email to root comment author
  - PR comment → in-app + email to PR creator and all reviewers

### 2.6 Validation Rules

| Rule | Error |
|---|---|
| `body` empty or blank | 400 `body_required` |
| `parent_id` references non-root comment | 400 `cannot_reply_to_reply` |
| `context_selector` present without `context_type` | 400 `context_type_required` |
| Mentioned user lacks access to the node | Mention stored, notification includes access-request link |

---

## 3. Frontend Specification

### 3.1 Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Markdown render | `react-markdown` | Lightweight; handles bold/italic/code/tables; no editor complexity needed for comment input |
| Emoji picker | `emoji-mart` | Standard picker library; consistent emoji set across OS |
| Relative timestamps | `date-fns` | Already in project; `formatDistanceToNow` covers "2 hours ago" display |

### 3.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `CommentSidebar` | `components/collaboration/CommentSidebar.tsx` | Right-panel showing all threads for active node |
| `CommentThread` | `components/collaboration/CommentThread.tsx` | One root comment + its replies; resolve/reopen button |
| `CommentItem` | `components/collaboration/CommentItem.tsx` | Single comment bubble — avatar, name, timestamp, markdown body, reactions |
| `CommentInput` | `components/collaboration/CommentInput.tsx` | Textarea + submit; supports `@mention` autocomplete + emoji trigger |
| `InlineCommentPin` | `components/collaboration/InlineCommentPin.tsx` | Small chat-bubble icon anchored next to a param/header row; highlights thread on click |
| `CommentModeToggle` | `components/collaboration/CommentModeToggle.tsx` | Toolbar button: switches to "Comment Mode" where click on any field opens inline comment input |
| `ReactionBar` | `components/collaboration/ReactionBar.tsx` | Row of emoji reactions with counts; click to add/remove own reaction |
| `MentionAutocomplete` | `components/collaboration/MentionAutocomplete.tsx` | Dropdown appears after typing `@`; fetches `/workspaces/{id}/members` for suggestions |

### 3.3 TypeScript Interfaces

```typescript
interface Comment {
  id: string;
  author: { id: string; name: string; avatarUrl: string };
  body: string;           // raw Markdown
  isResolved: boolean;
  contextSelector: string | null;
  contextType: ContextType | null;
  createdAt: string;
  updatedAt: string;
  reactions: Reaction[];
  replies: Comment[];
}

type ContextType =
  | 'query_param' | 'path_param' | 'header'
  | 'form_data' | 'raw_body'
  | 'script_pre' | 'script_post' | 'spec_line';

interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

interface CommentSidebarProps {
  nodeId: string;
}

interface CommentThreadProps {
  thread: Comment;
  onReply: (parentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onReopen: (commentId: string) => void;
}

interface InlineCommentPinProps {
  contextSelector: string;
  commentCount: number;
  hasUnresolved: boolean;
  onClick: () => void;      // highlights thread in sidebar
}
```

### 3.4 Component Render Descriptions

**`CommentSidebar`**
- Fetches `GET /nodes/{nodeId}/comments` on mount and on `nodeId` change.
- Groups threads: unresolved first, resolved at bottom (collapsible).
- Each thread renders `CommentThread`.
- Bottom of sidebar: `CommentInput` for new top-level comments.
- Auto-scrolls to thread when `InlineCommentPin` is clicked.

**`CommentThread`**
- Shows `CommentItem` for root comment.
- Resolve/Reopen button visible only to editors.
- Collapsed reply list with "Show N replies" toggle.
- Reply `CommentInput` shown when "Reply" clicked.

**`CommentItem`**
- Avatar + name + relative timestamp.
- `react-markdown` renders body.
- Edit pencil icon on hover (own comments only).
- Trash icon on hover (own comment or workspace admin).
- `ReactionBar` below body.

**`InlineCommentPin`**
- Renders as a small chat-bubble SVG icon.
- Positioned in the gutter of the relevant param/header row using `context_selector` to locate the row.
- Red dot if any unresolved threads for that selector.
- Click → `CommentSidebar` scrolls to + highlights that thread.

**`CommentModeToggle`**
- Toggle in request builder toolbar.
- When ON: clicking any param row / header row / body field opens inline `CommentInput` pre-filled with `context_selector`.
- Keyboard shortcut: `Cmd+Shift+M`.

### 3.5 API Calls Table

| Action | Method | URL | Trigger |
|---|---|---|---|
| Load threads | GET | `/nodes/{nodeId}/comments` | Sidebar mount, nodeId change |
| Post new comment | POST | `/nodes/{nodeId}/comments` | CommentInput submit |
| Post reply | POST | `/comments/{id}/replies` | Reply CommentInput submit |
| Edit comment | PUT | `/comments/{id}` | Edit inline save |
| Delete comment | DELETE | `/comments/{id}` | Trash icon confirm |
| Resolve thread | POST | `/comments/{id}/resolve` | Resolve button |
| Reopen thread | POST | `/comments/{id}/reopen` | Reopen button |
| Add reaction | POST | `/comments/{id}/reactions` | Emoji click |
| Remove reaction | DELETE | `/comments/{id}/reactions/{emoji}` | Own emoji click toggle |
| Mention suggestions | GET | `/workspaces/{id}/members` | `@` typed in CommentInput |

### 3.6 State Shape

```typescript
interface CollaborationState {
  commentsByNodeId: Record<string, {
    threads: Comment[];
    loading: boolean;
    error: string | null;
  }>;
  highlightedThreadId: string | null;   // set when InlineCommentPin clicked
  commentModeActive: boolean;
}
```

---

## 4. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Inline pin storage | `context_selector` + `context_type` in Comment model | Matches Postman model; selector encodes element identity (e.g. `header:Authorization`) |
| 2 | Reply depth | 2 levels max (root + replies) | Postman does not allow replies-to-replies; avoids infinite nesting |
| 3 | Resolve scope | Root comments only | A reply cannot be independently resolved |
| 4 | Notification delivery | Email + in-app for @mention; in-app only for replies | Reduces email noise for passive observers |
| 5 | Emoji reactions | `emoji-mart` picker + `CommentReaction` model | Postman has "Add Reaction" — standard feature; one emoji per user dedup at DB |
| 6 | Markdown input | Plain `<textarea>` with `react-markdown` preview toggle | Full rich-text editor overkill for comments |
| 7 | Guest access | Mentioned users without access get link in notification | Postman behavior: mention stored, notification has access-request link |

---

## 5. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | `context_selector` points to deleted header row | Pin renders in "detached" state at top of sidebar with "(element removed)" label |
| 2 | User edits comment with @mentions after posting | Re-parse mentions on edit; only send notifications for newly added mentions |
| 3 | Node deleted with open threads | Soft-delete comments with node; expose via admin audit only |
| 4 | Reply to reply attempted | 400 `cannot_reply_to_reply` — FE should not show reply input on reply `CommentItem` |
| 5 | Mentioned user not in workspace | Store mention row; notification body includes "request access" CTA |
| 6 | `CommentModeToggle` ON + user clicks in script editor | `context_type: script_pre` or `script_post` with line number in `context_selector` |

---

## 6. Deferred

| Item | Reason |
|---|---|
| Real-time comment push (WebSocket events) | Complexity; polling on sidebar focus is MVP |
| Comment notifications in Slack/MS Teams integration | Separate integration feature (workspace activity feed) |
| Comment export | No user demand signal yet |
| Rich-text WYSIWYG comment editor | `react-markdown` textarea sufficient for MVP |
