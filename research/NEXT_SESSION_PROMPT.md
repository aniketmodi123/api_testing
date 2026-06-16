# Next Session: Deep Research + Gap Fill (Resume-Safe)

TASK: Deep research only — no coding.

## HOW THIS SESSION WORKS

This prompt drives research with a 2-subagent parallel pipeline.

At session start:
1. Read RESEARCH_GAPS.md (create if missing).
2. Print the pending feature list with numbers — like a menu.
3. STOP. Ask the user TWO questions before doing anything:
   a. "Which feature(s) should I research? Enter number(s) in order (e.g. 1, 3, 5 — or 'all pending')."
   b. "Each feature's research is fully independent (no shared state, no cross-dependencies). Should I run 2 subagents in parallel to speed this up? Each subagent takes one feature; when one finishes it picks the next. (yes / no)"
4. Wait for user answers before proceeding.

If user says YES to parallel:
- Spawn 2 subagents simultaneously.
- Assign: Agent 1 → feature #1, Agent 2 → feature #2 from the user's selected list.
- As soon as either agent finishes, immediately assign it the next unstarted feature from the list.
- Continue until all selected features are done.
- Each agent works fully independently — never wait for the other to finish before assigning new work.

If user says NO to parallel:
- Research one feature at a time, in user's specified order.
- After each feature completes, report done and ask: "Continue to next, or pick new ones?"

RESUME RULE: Check RESEARCH_GAPS.md to see which features already done. Only show PENDING features in the menu.

---

## Step 0 — Load on every session start
```
research/FEATURE_INVENTORY.md
research/IMPLEMENTATION_ORDER.md
research/RESEARCH_GAPS.md   ← create if missing; tracks progress
```

---

## Step 1 — Per-feature loop (repeat for every selected feature)

IMPORTANT: Live web research is MANDATORY for every feature — even ones previously marked complete or partially researched. Old spec files may be stale or incomplete. Always fetch current Postman docs fresh.

For each feature:
1. Read its 4 files: README.md, research.md, spec.md, test_matrix.md
   — treat these as a baseline only, not ground truth
2. Live web search — REQUIRED, never skip:
   - Search using the terms in the table below
   - Sources: site:learning.postman.com, site:postman.com/docs, recent blog posts, changelogs
   - Fetch and read at least 2–3 actual pages per feature
   - Look for: sub-features, UI patterns, edge cases, gotchas, new additions since last research
   - Note: Postman ships fast — assume anything over 3 months old in spec files is potentially stale
3. Gap check — Postman current state vs APIPilot spec:
   - Sub-features missing from spec?
   - Endpoints missing from backend?
   - UI components missing from FE spec?
   - Edge cases / gotchas missing?
   - Any Postman feature that doesn't exist in APIPilot at all?
4. Update spec.md — add/complete FE section with:
   - Component breakdown (name, props, what it renders)
   - API calls (exact endpoint + response fields consumed)
   - State shape (local state vs Redux/store)
   - Library decision (chart lib, canvas lib, diff lib — pick specific, justify)
   - UX decisions informed by live Postman research
5. Update research.md — add live Postman findings, source URLs, new gaps found
6. Update test_matrix.md — add missing test cases from live research
7. Update README.md — adjust coverage % and missing list based on live findings
8. Mark feature done in RESEARCH_GAPS.md before moving to next

---

## Feature Order + Search Terms

### Batch A — FE Missing (highest priority)

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
