# Next Session: Deep Research + Gap Fill (Resume-Safe)

TASK: Deep research only — no coding.

## HOW THIS SESSION WORKS

Sequential only — one feature at a time. No parallel subagents.

At session start:
1. Read RESEARCH_GAPS.md (create if missing).
2. Print the pending feature list with numbers — like a menu.
3. STOP. Ask the user ONE question:
   "Which feature(s) should I research? Enter number(s) in order (e.g. 1, 3, 5 — or 'all pending')."
4. Wait for user answer before proceeding.
5. Research one feature at a time, in user's specified order.
6. After each feature completes, report done and ask: "Continue to next, or pick new ones?"

RESUME RULE: Check RESEARCH_GAPS.md status column for each feature.
- `pending` → not started, include in menu
- `redo` → was researched but BEFORE current source list / prompt standard existed; treat as pending, include in menu with "(REDO)" label
- `done` → skip entirely, do NOT show in menu

Show both `pending` and `redo` features in the menu. Never re-research a `done` feature unless user explicitly asks.

---

## Step 0 — Load on every session start
```
research/FEATURE_INVENTORY.md
research/IMPLEMENTATION_ORDER.md
research/RESEARCH_GAPS.md   ← create if missing; tracks progress
```

---

## Step 1 — Per-feature loop (repeat for every selected feature)

IMPORTANT: Live web research is MANDATORY. Old spec files may be stale. Always fetch Postman docs fresh.

**SPEC QUALITY BAR**: The goal is a spec so complete that a dev can implement the feature in one pass with zero ambiguity. Use `research/04-variables/spec.md` as the quality benchmark — every feature spec must match that level of detail before marking done.

## Sources (check in this order)

### 1. Official Postman Docs
| Source | URL pattern |
|---|---|
| Postman Learning Center | `learning.postman.com/docs/...` |
| Postman API Docs | `learning.postman.com/docs/developer/intro-apis/` |
| Postman Collection Format | `schema.getpostman.com/json/collection/v2.1.0/collection.json` |
| Postman Collection Format reference | `learning.postman.com/collection-format` |
| Postman Blog / Changelog | `blog.postman.com` |

### 2. Reference Repos (read logic only — do NOT copy or depend on)
| Repo | What to extract |
|---|---|
| `hoppscotch/hoppscotch` | FE UI patterns, component structure, state shape |
| `usebruno/bruno` → `@usebruno/lang`, `filestore` | Data model, file format, parser logic |
| `postmanlabs/newman` | Collection-runner logic, iteration, data file handling |
| `postmanlabs/postman-collection` | Request/collection object model |
| `postmanlabs/postman-code-generators` | Codegen templates per language |
| `Kong/insomnia` | Desktop app behavior reference |
| `postmanlabs/schemas` | OpenAPI / Collection schema definitions |

Use `deepwiki.com/<owner>/<repo>` for fast repo summaries. Only check repos relevant to current feature.

---

For each feature:
1. Read only `spec.md` — baseline only, not ground truth
2. Live web search — REQUIRED, never skip:
   - Use search terms from the table below
   - Fetch the single most comprehensive official Postman docs page for this feature
   - Look for: sub-features, exact API behavior, UI patterns, edge cases, gotchas, recent additions
   - Postman ships fast — anything over 3 months old in spec files is potentially stale
3. Check relevant reference repos (deepwiki first for overview, then drill into source if needed)
4. Gap check — Postman current state vs APIPilot spec (BOTH BE and FE):
   - BE: missing endpoints, missing DB models, missing business logic, missing validation rules
   - FE: missing components, missing state, missing API calls wired up
   - Missing sub-features, undocumented edge cases, features not in APIPilot at all
5. Update `spec.md` only — must include ALL of the following sections that apply:

   **Backend section:**
   - New DB models (table name, all fields, types, constraints, FK relationships)
   - New endpoints (method, path, min role, purpose, request body schema, response schema)
   - Modified files (exact file path, what changes and why)
   - Business logic (algorithms, precedence rules, resolution order)
   - Validation rules (field constraints, error responses)
   - Security rules (what is masked, what requires extra auth, audit logging)

   **Frontend section:**
   - Component inventory table (component name, location, purpose)
   - Per-component TypeScript interface (props + key types)
   - Component render description (what it shows, interaction behavior)
   - API calls table (action, method, URL, when triggered)
   - State shape (TypeScript interface for store/context slice)
   - Library decisions (pick specific lib, justify — e.g. "CodeMirror 6 not Monaco: bundle size")

   **Both:**
   - Decision table (numbered, decision → choice → reason)
   - Edge cases table (numbered, trap → fix)
   - Deferred items (what is explicitly out of scope + why)

6. Mark feature done in RESEARCH_GAPS.md before moving to next — set status to `done` regardless of whether it was `pending` or `redo`. Update the "New Gaps Found" column with count and short summary of gaps found this session.

DO NOT update research.md, test_matrix.md, or README.md — spec.md only.

---

## Feature Order + Search Terms

### Batch A — Missing / Incomplete (highest priority)

| # | Folder | Search Terms |
|---|---|---|
| 1 | research/04-variables/ | "postman variables scopes" "postman variable preview" "postman collection variables" "postman variable highlighting" |
| 2 | research/10-workflows/ | "postman flows" "postman flow builder" "postman flow steps" "postman flow canvas" |
| 3 | research/20-openapi-specs/ | "postman import openapi" "postman api definition" "postman contract testing" "postman diff" "postman schema" |
| 4 | research/13-monitoring/ | "postman monitors" "postman monitor dashboard" "postman uptime" "postman monitor metrics" |
| 5 | research/12-mock-servers/ | "postman mock server" "postman mock routes" "postman mock from collection" "postman mock response" |
| 6 | research/11-documentation/ | "postman api documentation" "postman publish docs" "postman public api" "postman doc page" |
| 7 | research/15-collaboration/ | "postman comments" "postman inline comments" "postman team collaboration" |
| 8 | research/16-version-control/ | "postman version control" "postman fork" "postman pull request" "postman history" |
| 9 | research/23-governance/ | "postman api governance" "postman style guide" "postman linting" "postman rule" |
| 10 | research/audit-logs/ | "postman audit logs" "postman activity feed" "postman audit trail" |
| 11 | research/19-sse/ | "postman server sent events" "postman SSE" "postman event stream" |

### Batch B — Marked complete but verify no gaps

| # | Folder | Search Terms |
|---|---|---|
| 12 | research/06-authentication/ | "postman authentication" "postman auth helpers" "postman oauth2 flow" "postman api key" |
| 13 | research/07-collections/ | "postman collections" "postman folder" "postman collection variables" "postman collection sharing" |
| 14 | research/08-testing/ | "postman test scripts" "postman assertions" "postman pm.test" "postman test results" |
| 15 | research/01-api-request-builder/ | "postman request builder" "postman path variables" "postman code snippet" "postman params" |
| 16 | research/05-environments/ | "postman environments" "postman environment variables" "postman secret variable" |
| 17 | research/09-collection-runner/ | "postman collection runner" "postman run order" "postman data file" "postman iteration" |
| 18 | research/14-workspaces/ | "postman workspaces" "postman team workspace" "postman RBAC" "postman roles" |
| 19 | research/17-graphql/ | "postman graphql" "postman introspection" "postman graphql variables" |
| 20 | research/18-websocket/ | "postman websocket" "postman socket.io" "postman ws message" |
| 21 | research/assertions/ | "postman test assertions" "postman pm.response" "postman response check" |
| 22 | research/test-cases/ | "postman test cases" "postman saved responses" "postman examples" |
| 23 | research/schedules/ | "postman scheduled monitors" "postman scheduled runs" "postman cron" |
| 24 | research/secrets-vault/ | "postman vault" "postman secret variables" "postman encrypted" |
| 25 | research/alerts/ | "postman monitor alerts" "postman notifications" "postman webhook alert" |
| 26 | research/25-administration/ | "postman admin" "postman comparison" "postman pricing features" |
| 27 | research/multi-request-groups/ | "postman multi request" "postman request groups" "postman bulk" |

### Batch C — Never researched / thin specs (added 2026-06-17)

| # | Folder | Search Terms |
|---|---|---|
| 28 | research/01-api-request-builder/ | "postman request builder" "postman params tab" "postman body types" "postman pre-request" "postman form-data" "postman binary upload" "postman curl import" 2025 |
| 29 | research/02-api-execution-engine/ | "postman send request internals" "postman request lifecycle" "postman pre-request script" "postman variable resolution order" "postman redirect" "postman timeout" |
| 30 | research/03-response-viewer/ | "postman response viewer" "postman response body" "postman pretty raw preview" "postman response cookies" "postman response headers" "postman response search" |
| 31 | research/22-security/ | "postman security" "postman SSRF" "postman TLS" "postman certificate" "postman proxy settings" "postman CORS" |
| 32 | research/20-grpc/ | "postman grpc" "postman protobuf" "postman grpc unary streaming" "postman proto file" |
| 33 | research/21-soap/ | "postman soap" "postman wsdl" "postman xml envelope" "postman soap request" |

---

## RESEARCH_GAPS.md format (create/update as you go)

```markdown
# Research Gaps Log

## Progress
| # | Feature | Status | New Gaps Found |
|---|---|---|---|
| 1 | 04-variables | done / in-progress / pending | count |
...

## New Gaps (features APIPilot is missing entirely)
| Feature | Gap | Severity | Add to FEATURE_INVENTORY? |
|---|---|---|---|
| 04-variables | X | P1 | yes/no |
```

---

## Final Step (after all features done)

Update `research/FEATURE_INVENTORY.md` — add any new Missing features found.
Write summary at bottom of `research/RESEARCH_GAPS.md`:
- Total new gaps found
- P1 gaps (must build before launch)
- P2 gaps (important but not blocking)
- P3 gaps (nice to have)

---

## Rules
- No coding. Research + doc updates only.
- Load only current feature folder — never load all of research/ at once.
- If token limit approaching: finish current feature file write, update RESEARCH_GAPS.md progress row, stop. Next session reads RESEARCH_GAPS.md to resume.
- New feature entirely missing from APIPilot → add to FEATURE_INVENTORY.md as Missing + note in RESEARCH_GAPS.md.
