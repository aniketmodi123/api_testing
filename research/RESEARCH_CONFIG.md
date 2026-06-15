# Research Config — Polaris API Testing Project

Every research file in this folder tree follows these rules.
Compact = minimum characters, maximum recoverable information.
Adapted from the aniket_tools library pattern for full-stack feature work.

---

## Folder Structure Rule

```
feature or phase → one folder
research/
  phases/X/               ← one folder per upgrade phase
    README.md             ← HUMAN: goal, deliverable, status, sub-tasks
    spec.md               ← AI: backend changes, frontend changes, decisions, edge cases
    research.md           ← AI: existing code to reuse, patterns, API contracts
    test_matrix.md        ← AI: acceptance tests, edge cases, regression cases
  project/X/              ← one folder per existing system/service (knowledge base)
    README.md
    spec.md
    research.md
```

One folder per feature or phase. Sub-tasks inside a phase = sub-folders.

---

## README.md (human-facing)

```markdown
# <Phase/Feature Name> — <one-line what it delivers>

**Status:** not-started | in-progress | ready | done
**Phase:** 0–7
**Depends on:** Phase X (or "none")
**Estimated scope:** frontend-only | backend-only | full-stack | S/M/L

---

## What the user sees after this is done
<one paragraph — visible result>

## Deliverables
- [ ] item 1
- [ ] item 2

## Sub-tasks (if any)
| Folder | What |
|---|---|

## AI agent files
| File | Purpose |
|---|---|
| spec.md | Technical requirements, decisions, edge cases |
| research.md | Existing code to reuse, patterns, contracts |
| test_matrix.md | Acceptance tests, edge cases |
```

---

## spec.md (AI-facing — dense)

```markdown
# Spec — <Feature Name>

STATUS: not-started | in-progress | ready | done
LAST_CHANGED: YYYY-MM-DD

## Goal
<one-line task summary>

## Deliverables (what "done" looks like)
<numbered list>

## Backend Changes
### New Models
| Model | Fields | Notes |
### New Endpoints
| Method | Path | Purpose |
### Modified Endpoints / Logic
| File | Change |

## Frontend Changes
### New Components
| Component | Location | Purpose |
### Modified Components
| Component | Change |
### New Routes / Pages
| Route | Component |

## Decision Table
| # | Decision | Choice | Reason |

## Edge Cases
| # | Trap | How it breaks | Fix |

## Open Questions
| # | Question | Recommendation |
```

**Compact rules:**
- No prose — tables and code only
- One line per row — never wrap
- Imperative verbs in Fix columns
- Move resolved Open Questions → Decision Table

---

## research.md (AI-facing — deep knowledge)

```markdown
# Research — <Feature Name>

LAST_UPDATED: YYYY-MM-DD

## Existing Code to Reuse
| File | Function/Component | How to use |

## Patterns in this Codebase
<code snippets of the exact pattern to follow>

## API Contracts (existing endpoints this feature touches)
| Endpoint | Input | Output | Notes |

## Component Patterns
<how existing components are structured — what to mirror>

## Gotchas
| # | Thing | Why it trips you up | How to handle |
```

---

## test_matrix.md (AI-facing — acceptance tests)

```markdown
# Test Matrix — <Feature Name>

LAST_UPDATED: YYYY-MM-DD

## Happy Path (must work)
| ID | Scenario | Input | Expected | Notes |

## Edge Cases
| ID | Trap # | Scenario | Input | Expected | Why |

## Error Cases
| ID | Scenario | Expected Behavior |

## Regression (must not break)
| ID | Existing feature | Must still work |
```

---

## After Every Code Change

1. Open `research/phases/X/spec.md`
2. If a decision was made → add to Decision Table
3. If open question resolved → move to Decision Table
4. If spec changed → update Deliverables
5. Update `research/MEMORY.md` — status + one-line summary

---

## MEMORY.md (root of research/)

Format: one line per research folder, pipe-separated.
```
path/to/folder | status | one-line summary
```
Status: `active` | `stable` | `empty` | `needs-update`

---

## Compaction Trigger

When `spec.md` > 200 lines OR `research.md` > 300 lines:
- Merge repeated rows into summary rows
- Replace resolved Open Questions with "All resolved — see Decision Table"
