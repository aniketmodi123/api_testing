# Spec — Documentation + Publishing

STATUS: Research-complete
LAST_CHANGED: 2026-06-16
SOURCE: Postman Learning Center (live fetch 2026-06-16) + prior phase spec

## Goal

Auto-generate and publish interactive API documentation from a collection. Public URL
updates automatically when the collection changes — no manual republish. Differentiator:
available free (Postman gates custom domains + multi-theme behind paid plans).

---

## 1. Postman Feature Catalog (ground truth)

### 1.1 Documentation Levels
Descriptions can be authored at every level of the collection hierarchy:

| Level | Where authored | Rendered in docs |
|---|---|---|
| Collection | Overview tab | Landing page description |
| Folder | Folder info panel | Section header description |
| Request | Docs tab on request | Request description block |
| Parameter / header | Inline description in key-value row | Param/header table in docs |

### 1.2 Editor Options
| Mode | Description |
|---|---|
| WYSIWYG (Postman Editor) | Toolbar-driven; bold/italic shortcuts (⌘B, ⌘I); table builder; no Markdown knowledge needed |
| Markdown Editor | Raw Markdown with Preview tab |

Users can toggle between modes per description. Default mode configurable in settings.

**Embeddable content:**
- Images: PNG / JPG / SVG / GIF, ≤5 MB; upload or URL embed; resizable with caption
- Videos: YouTube / Vimeo only; click-to-play; resizable with caption
- Tables: toolbar-created (no Markdown required in WYSIWYG)
- Code blocks, headings, lists, blockquotes, links

### 1.3 Publishing Config Options
| Option | Detail |
|---|---|
| URL slug | Auto-generated from collection name; customizable |
| Environment | Optional; published env vars visible in docs (warn: no secrets) |
| Layout | Double-column (code right of docs) OR single-column (code below) |
| Theme | Light / Dark / System |
| Brand color | Hex color for header background, code background, hyperlinks |
| Logo | Custom logo: JPEG/PNG ≤2 MB; separate light/dark variant |
| Favicon | Custom favicon |
| SEO title | ≤60 chars; shown in browser tab + search results |
| SEO description | ≤160 chars; shown in search snippet |
| Custom domain | Subdomain only (e.g. `docs.example.com`); CNAME to `phs.getpostman.com`; paid plan |
| Private | Unpublish removes public access; toggling is instant |

### 1.4 Published Doc Page Structure
Three-panel layout (Postman default — "double-column"):
- **Left**: Navigation sidebar — collection tree (folders → requests); search within docs
- **Middle**: Request detail — method badge, URL, description (Markdown rendered), params table, headers table, body schema, auth section, examples (request + response pair)
- **Right**: Code snippets — curl, JS Fetch, Python Requests, and more; syntax highlighted

**"Run in APIPilot" button** (equivalent of "Run in Postman"):
- Embedded in published docs header
- On click: deeplink to APIPilot import flow → forks collection into user's workspace
- Button stays live-updated — no manual refresh when collection changes

### 1.5 Auto-Sync
- Published docs **auto-update** when the collection is modified — no republish action required
- Unpublish removes public access immediately

### 1.6 Custom Domain (paid feature, APIPilot deferred)
- DNS: TXT record at root (`@`) for ownership verification + CNAME at subdomain to APIPilot docs host
- SSL: auto-provisioned via Let's Encrypt
- Root domain (`example.com`) not supported — subdomain required
- DNS propagation: up to 24 h

### 1.7 Plan Gating
| Feature | Postman Free | Postman Paid | APIPilot |
|---|---|---|---|
| Publish public docs | Yes | Yes | Yes (free) |
| Custom domain | No | Yes | Deferred (Phase 2) |
| Custom logo/brand | Limited | Full | Full (free) |
| Private docs (unpublish) | Yes | Yes | Yes |
| "Try it" console | No (Postman has no live try-it in published docs) | No | N/A |

---

## 2. Backend Specification

### 2.1 DB Models

#### `PublishedDoc` (extend / rename from existing)
```python
id: UUID PK
collection_id: UUID FK unique  # one published doc per collection
workspace_id: UUID FK
slug: str unique               # URL-safe; e.g. "my-awesome-api"
environment_id: UUID FK nullable
layout: str default 'double'   # 'double' | 'single'
theme: str default 'light'     # 'light' | 'dark' | 'system'
brand_color: str nullable      # hex e.g. '#3b82f6'
logo_url: str nullable
favicon_url: str nullable
seo_title: str nullable        # ≤60 chars
seo_description: str nullable  # ≤160 chars
is_published: bool default True
custom_domain: str nullable    # subdomain; Phase 2
published_at: datetime UTC
updated_at: datetime UTC
created_by: UUID FK → User
```

### 2.2 Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/collections/{id}/publish` | editor | Publish docs for collection (creates PublishedDoc) |
| PUT | `/collections/{id}/publish` | editor | Update publish settings (theme, logo, SEO, etc.) |
| PATCH | `/collections/{id}/publish` | editor | Unpublish (set is_published=false) or republish |
| GET | `/collections/{id}/publish` | viewer | Get current publish settings for management UI |
| GET | `/docs/{slug}` | public | Serve public documentation page data |
| GET | `/docs/{slug}/export` | public | Return collection JSON for "Run in APIPilot" import |

**`GET /docs/{slug}` response shape:**
```python
{
  "slug": str,
  "collection_name": str,
  "description": str | None,  # collection-level, Markdown
  "layout": str,
  "theme": str,
  "brand_color": str | None,
  "logo_url": str | None,
  "seo_title": str | None,
  "seo_description": str | None,
  "environment": {key: value, ...} | None,  # non-secret env vars only
  "folders": [
    {
      "id": str,
      "name": str,
      "description": str | None,
      "requests": [
        {
          "id": str,
          "name": str,
          "method": str,
          "url": str,
          "description": str | None,
          "params": [{"key": str, "value": str, "description": str | None}],
          "headers": [{"key": str, "value": str, "description": str | None}],
          "body": {"mode": str, "raw": str | None, "schema": dict | None} | None,
          "auth": {"type": str, ...} | None,
          "examples": [
            {
              "name": str,
              "request": {"headers": [...], "body": str | None},
              "response": {"status": int, "headers": [...], "body": str | None}
            }
          ],
          "code_snippets": {
            "curl": str,
            "javascript": str,
            "python": str,
            "nodejs": str
          }
        }
      ]
    }
  ]
}
```

### 2.3 Business Logic

**Slug generation:**
- Slugify collection name: lowercase, spaces→hyphens, strip special chars
- Check uniqueness; append `-2`, `-3` etc. on conflict

**Auto-sync:**
- No snapshot stored — `GET /docs/{slug}` queries collection live at request time
- Code snippets generated on-the-fly per request at doc-serve time
- Cache doc response for 60 s (cache key: `{slug}:doc:{collection_updated_at}`)

**Environment var exposure:**
- Only include env vars from the selected environment where `type != 'secret'`
- Secret vars replaced with `<secret>` placeholder in rendered docs

**Unpublish:**
- `PATCH /collections/{id}/publish` sets `is_published=False`
- `GET /docs/{slug}` returns 404 when `is_published=False`

**Code snippet generation** (per request, 4 languages):
- `curl`: `curl -X {method} '{url}' {headers} {body}`
- `javascript`: `fetch('{url}', {method, headers, body})`
- `python`: `requests.{method.lower()}('{url}', headers={...}, json={...})`
- `nodejs`: `const res = await fetch(...)` (same as JS Fetch but with `node-fetch` comment)

### 2.4 Modified Files
| File | Change |
|---|---|
| `src/models/published_doc.py` | Add `layout`, `theme`, `brand_color`, `logo_url`, `favicon_url`, `seo_title`, `seo_description`, `slug` fields |
| `src/routers/docs.py` | Add PATCH (unpublish), GET /publish (settings), GET /docs/{slug}/export |
| `src/services/doc_builder.py` | New: assembles full doc data structure from collection; injects env vars; strips secrets |
| `src/services/code_snippet_generator.py` | New: generates curl / JS / Python / Node snippets per request |

---

## 3. Frontend Specification

### 3.1 Library Decisions
| Decision | Choice | Reason |
|---|---|---|
| Markdown renderer | `react-markdown` + `remark-gfm` | GFM support (tables, strikethrough); lightweight |
| Code highlighting | `react-syntax-highlighter` (Prism) | Syntax highlight in code snippet tabs; tree-shakeable |
| State | Local component state (no Redux) | Public doc page is read-only; no cross-component mutations |

### 3.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `PublishDocModal` | `features/docs/PublishDocModal.tsx` | Create/edit publish settings: theme, logo, SEO, env, layout |
| `PublishDocPreview` | `features/docs/PublishDocPreview.tsx` | Live preview iframe of published doc (updates as settings change) |
| `UnpublishConfirmModal` | `features/docs/UnpublishConfirmModal.tsx` | Confirm unpublish action; warns public URL will 404 |
| `PublicDocLayout` | `features/docs/public/PublicDocLayout.tsx` | Root layout for public doc page: sidebar + content + (double: code panel) |
| `DocSidebar` | `features/docs/public/DocSidebar.tsx` | Nav tree: folders → requests; search within docs; smooth scroll on click |
| `DocRequestView` | `features/docs/public/DocRequestView.tsx` | Request detail: method badge, URL, description (Markdown), params, headers, body, auth |
| `DocExamplesPanel` | `features/docs/public/DocExamplesPanel.tsx` | Tabs of saved examples; shows request + response pair per example |
| `CodeSnippetPanel` | `features/docs/public/CodeSnippetPanel.tsx` | Tabs: curl / JS / Python / Node; syntax highlighted; copy button per tab |
| `RunInAPIPilotButton` | `features/docs/public/RunInAPIPilotButton.tsx` | CTA button: deeplinks to import flow with collection export URL |
| `DocSearchBar` | `features/docs/public/DocSearchBar.tsx` | Search across request names and descriptions within the doc |

### 3.3 TypeScript Interfaces

```typescript
interface PublishedDocSettings {
  id: string;
  collection_id: string;
  slug: string;
  environment_id: string | null;
  layout: 'double' | 'single';
  theme: 'light' | 'dark' | 'system';
  brand_color: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  is_published: boolean;
  public_url: string;   // derived: `${baseUrl}/docs/${slug}`
}

interface PublicDocData {
  slug: string;
  collection_name: string;
  description: string | null;
  layout: 'double' | 'single';
  theme: 'light' | 'dark' | 'system';
  brand_color: string | null;
  logo_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  folders: DocFolder[];
}

interface DocFolder {
  id: string;
  name: string;
  description: string | null;
  requests: DocRequest[];
}

interface DocRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  description: string | null;
  params: DocParam[];
  headers: DocParam[];
  body: DocBody | null;
  auth: DocAuth | null;
  examples: DocExample[];
  code_snippets: {
    curl: string;
    javascript: string;
    python: string;
    nodejs: string;
  };
}

interface DocParam {
  key: string;
  value: string;
  description: string | null;
}

interface DocExample {
  name: string;
  request: { headers: DocParam[]; body: string | null };
  response: { status: number; headers: DocParam[]; body: string | null };
}
```

### 3.4 API Calls

| Action | Method | URL | When |
|---|---|---|---|
| Get publish settings | GET | `/collections/{id}/publish` | PublishDocModal open |
| Publish docs | POST | `/collections/{id}/publish` | PublishDocModal first publish |
| Update publish settings | PUT | `/collections/{id}/publish` | PublishDocModal save |
| Unpublish | PATCH | `/collections/{id}/publish` | UnpublishConfirmModal confirm |
| Serve public doc | GET | `/docs/{slug}` | PublicDocLayout mount (public route) |
| Export for import | GET | `/docs/{slug}/export` | RunInAPIPilotButton click |

### 3.5 UX Decisions
- `PublishDocModal` has live preview: iframe loads `/docs/{slug}?preview=true` as settings change (debounced 500 ms)
- Double-column layout (default): code snippet panel sticky-scrolls alongside request content
- Single-column layout: code snippet panel below request content
- `DocSidebar`: active request highlighted; smooth-scroll to request anchor on click
- `RunInAPIPilotButton`: always visible in doc page header; opens import modal in APIPilot app
- URL displayed in `PublishDocModal` with one-click copy after first publish
- SEO: `<title>` and `<meta description>` injected from `seo_title` / `seo_description` server-side (or meta tags on public route)
- Brand color applies to: sidebar active state, method badges, button accents
- Unpublish confirm: show current public URL so user knows what they're taking down

---

## 4. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Doc data storage | Live query (no snapshot) | Always reflects current collection; no sync lag |
| 2 | Doc caching | 60 s TTL keyed on collection updated_at | Balance freshness vs. DB load |
| 3 | Code snippet generation | Server-side at serve time | Single source of truth; client doesn't need generation logic |
| 4 | Env var secrets | Replaced with `<secret>` | Never expose secret values in public docs |
| 5 | Markdown renderer | `react-markdown` + `remark-gfm` | GFM support; no heavy deps |
| 6 | Custom domain | Deferred (Phase 2) | Requires DNS infra + Let's Encrypt automation |
| 7 | "Try it" console | Not implemented | Postman doesn't have it in published docs; out of scope |
| 8 | Public doc route | Separate public route (`/docs/:slug`) | No auth required; different layout from app |
| 9 | WYSIWYG editor | Use existing description fields | Collection already has description at each level; no new model needed |
| 10 | Layout toggle | 'double' (default) / 'single' | Matches Postman options; double preferred for readability |

---

## 5. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | Slug collision on publish | Auto-append `-2`, `-3`; show final slug in success response |
| 2 | Collection deleted after publishing | `GET /docs/{slug}` returns 404 with "Documentation unavailable" |
| 3 | Secret env vars exposed | Strip all vars where `type='secret'` before serving; replace with `<secret>` |
| 4 | Brand color invalid hex | Validate hex regex at PUT; 400 if invalid |
| 5 | Logo file too large | Validate ≤2 MB at upload; 400 if exceeded |
| 6 | Slug changed by user | Old slug returns 301 redirect to new slug for 30 days |
| 7 | Empty collection (no requests) | Publish allowed; doc shows "No requests documented yet" |
| 8 | Folder with no requests | Omit folder from sidebar and rendered output |
| 9 | Request with no description | Render without description block; no placeholder text |
| 10 | Very long request body in code snippet | Truncate body in snippet at 2 KB; add `# ... truncated` comment |

---

## 6. Deferred Items

| Item | Reason |
|---|---|
| Custom domain hosting | Requires DNS TXT+CNAME infra + auto-SSL; Phase 2 |
| "Try it" interactive console | Postman doesn't have it; APIPilot deferred |
| Custom CSS injection | Enterprise feature; Phase 2+ |
| Changelog / release notes pages | Not in Postman published docs; out of scope |
| Private docs (password-protected URL) | Phase 2 |
| Postman API Network listing | No equivalent in APIPilot v1 |
| Video embeds in descriptions | Phase 2 (YouTube/Vimeo support) |
