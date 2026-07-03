# Research Config — Compact Format Rules

Every research file in this folder tree follows these rules.
Compact = minimum characters, maximum recoverable information.

---

## Folder Structure Rule

```
src/aniket_tools/X/Y.py
        ↕  mirrors
research/X/Y/
    README.md        ← HUMAN-FACING: goal, why needed, usage examples, links to AI files
    spec.md          ← AI: requirements, signature, input forms, value matrix, decisions, edge cases
    research.md      ← AI: type tables, detection code, decision tree, annotation introspection
    test_matrix.md   ← AI: happy path, edge cases, error cases, regression cases
```

One folder per source file. `__init__.py` files are skipped.

---

## README.md (human-facing)

```markdown
# <module name> — <one-line what it does>

**Source:** `src/aniket_tools/X/Y.py`
**Status:** not-started | in-research | ready-to-implement | implemented | stable

---

## What it does
<one paragraph — plain language>

## Why it exists
<one paragraph — why this exists instead of inline code elsewhere>

## Usage
<code example>

## AI agent files

| File | Purpose |
|---|---|
| spec.md | ... |
| research.md | ... |
| test_matrix.md | ... |
```

---

## spec.md (AI-facing — dense)

```markdown
# Spec — <function_name>()

SOURCE: src/aniket_tools/X/Y.py
STATUS: not-started | ready-to-implement | implemented | stable
LAST_CHANGED: YYYY-MM-DD

## Goal
<one-line task summary>

## Authoritative Function Signature
<full signature with all params and defaults>

## Parameter Decision Table
| Parameter | Default | Rationale |

## Input Form Handling
| Input form | Detection | Action |

## Value → Output Matrix
| Input value type | Output type | Note |

## Decision Tree — Step Ordering
<ordered steps — ordering only, not full pseudocode>

## Key Decisions (Resolved)
| # | Decision | Choice | Reason |

## Edge Cases
| # | Trap | How naive code breaks | Fix |

## Open Questions
| # | Question | Recommendation |
```

**Compact rules:**
- No prose — tables and code only
- One line per row — never wrap
- Imperative verbs in Action/Fix columns
- Remove Open Questions when resolved — move to Key Decisions

---

## research.md (AI-facing — deep knowledge)

```markdown
# Research — <module_name>

SOURCE: src/aniket_tools/X/Y.py
LAST_UPDATED: YYYY-MM-DD

## 1. <Type System Name> Type Table
<full type table: annotation | input | output | nested? | trap?>

## 2. Detection Code
<runtime isinstance checks in mandatory order>

## 3. Decision Tree Pseudocode
<full implementation blueprint>

## 4. Introspection Helpers
<helper functions for annotation unwrapping, field iteration>
```

**Rules:**
- Code blocks for all implementation patterns
- Tables for type catalogs
- No explanatory prose — comments in code are enough
- Mandatory ordering noted inline

---

## test_matrix.md (AI-facing — test scenarios)

```markdown
# Test Matrix — <module_name>

SOURCE: src/aniket_tools/X/Y.py
LAST_UPDATED: YYYY-MM-DD

## Happy Path
| ID | Input | Expected Output | Notes |

## Edge Case Tests
| ID | Trap # | Input | Expected Output | Why |

## Error Cases
| ID | Input | Config | Expected Behavior |

## Regression Cases
| ID | Scenario | Input | Guard Against |
```

---

## After Every Code Change to src/

1. Open `research/X/Y/spec.md`
2. If a new decision was made → add row to "Key Decisions"
3. If an open question was resolved → remove from "Open Questions", add to "Key Decisions"
4. If signature changed → update "Authoritative Function Signature" and "Parameter Decision Table"
5. Update `research/MEMORY.md` — status + one-line summary

---

## MEMORY.md (project root of research/)

Format: one line per research folder, pipe-separated.
```
path/to/folder | status | one-line summary of active work or last change
```

Status values: `active` | `stable` | `empty` | `compaction-needed`

---

## Compaction Trigger

When `spec.md` > 200 lines OR `research.md` > 300 lines OR `test_matrix.md` > 150 rows:
- Merge repeated rows into summary rows
- Replace resolved Open Questions with "All resolved — see Key Decisions"
- Replace solved Regression Cases with inline note on the relevant Edge Case row
