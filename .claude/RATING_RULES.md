# Rating Rules — reusable_code_lib

One score per file. Run on demand. Loop until target is met.

---

## Trigger Syntax

```
rate <file_path> target <N>
```

Example: `rate src/path/to/file.py target 9`

**Input contract:**
- `file_path` — string; relative path from repo root; must point to an existing source file; no glob patterns; no directory paths
- `N` — integer 1–10 inclusive; required; no default

**Invalid input behavior:**

| Condition | Response |
|---|---|
| N is not an integer | Reject: "Target must be an integer 1–10" |
| N outside 1–10 | Reject: "Target must be an integer 1–10" |
| file_path not found | Reject: "File not found: <path>" |
| file_path is a directory | Reject: "Path must point to a file, not a directory" |
| File has no functions or classes | Rate normally; Correctness and Type Safety will reflect minimal structure |

---

## Code Quality Score (100 pts → /10)

| Category            | Weight | Criteria |
|---|---|---|
| Correctness         | /25    | Correct results in all expected and edge cases; undocumented behavior surprises count as bugs |
| Architecture        | /15    | Separation of concerns, layering, responsibility boundaries |
| API Design          | /15    | Naming, consistency, ergonomics, return types, discoverability |
| Framework Reusability | /15  | Can multiple projects/teams use it safely without modification |
| Type Safety         | /10    | Type hints, contracts, schema guarantees, IDE/static analysis support |
| Maintainability     | /5     | Ease of future modification and debugging |
| Extensibility       | /5     | Ability to add new behavior without modifying core logic |
| Error Handling      | /5     | Structured failures, diagnostics, observability |
| Documentation       | /3     | Accuracy and completeness of docstrings (evaluate against `.claude/DOCSTRING_RULES.md`) |
| Performance         | /2     | Algorithmic efficiency at *actual usage bounds*, not theoretical worst case |
| **TOTAL**           | **/100** | Divide by 10 for the /10 rating |

---

## Scoring Calibration

Hard deduction rules per category. Apply exactly — do not deviate.

**Correctness**
- Partial-success path that silently discards valid data: **-2**
- Undocumented output side-effect (e.g. defaults injected, fields mutated): **-1**
- Ambiguous status value that caller cannot distinguish without reading source: **-1**
- Sibling shape gap — function handles shape X (e.g. `list[tuple]`) but silently passes through the directly analogous scalar form (e.g. single `tuple`) when that scalar form is a realistic caller input in the same usage context: **-1**
- Feature or shape absent from the spec's stated goal applied as missing functionality by a reviewer: **no deduction** — rate against the stated goal, not aspirational requirements; document the scope boundary as a `Note:` in the Problems list if non-obvious
- Edge-case behavior explicitly documented in the docstring or spec: **no deduction**, even if surprising to the caller

**Architecture**
- Dispatch logic at a public entrypoint is part of its contract — **do not penalize**
- Unrelated concerns mixed inside a single layer (e.g. validation + persistence in one function): **-2**
- Private helper that should be extracted for testability: **-1**

**API Design**
- Redundant-but-harmless surface area (second way to do the same thing): **-1 max**
- Ambiguous or conflicting API (two params with overlapping but different behavior): **-3**
- Imprecise type annotation that defeats IDE/static analysis: **-1 per instance**

**Framework Reusability**
- Hard dependency that cannot be swapped without modifying the module: **-2 per dependency**
- Unexported extension point that requires monkey-patching to customize: **-2**
- Behavior that assumes a specific deployment context (env vars, global state): **-1**
- Global mutable extension registry (append-only list, dict, etc.) with no exported reset or clear function — callers in test environments cannot isolate state between test runs: **-1**; fix: export a `clear_<registry_name>()` function

**Type Safety**
- `Any` used where a narrower type is inferable: **-1 per instance**
- Missing type hints on a public function signature: **-2**
- Overly broad union that defeats type narrowing: **-1 per instance**

**Maintainability**
- Structural complexity fully compensated by inline step comments and ordering rationale: **no deduction**
- Complex ordering constraint with no inline documentation explaining why: **-2**
- Magic numbers or strings without named constants: **-1 per instance**

**Extensibility**
- No extension point anywhere in the module: **-2**
- Extension point on main path; gap on secondary path only: **-1**
- Extension point exists but is not exported (requires monkey-patching): **-1**

**Error Handling**
- Swallowed exception that makes two distinct failure modes indistinguishable: **-1 per case**
- Missing error context that forces the caller to read source to diagnose: **-1**
- Bare `except Exception` with no re-raise or logging: **-2**
- Extension point (hook, registry, callback) that propagates caller errors without any isolation, allowing a bad predicate or converter to corrupt the main execution path: **-1**; fix: wrap in `try/except` and raise a typed error with context

**Performance**
- O(n²) or worse with no caller-controlled bound: **-1**
- O(n²) at a bounded n (e.g. `max_depth=25`): **no deduction**
- Unnecessary repeated computation inside a loop (fixable by hoisting): **-1**

---

## Weight Overrides

To adjust weights for a specific project, add an `## Overrides` section at the bottom of this file:

| Category | Old Weight | New Weight | Reason |
|---|---|---|---|
| Performance | /2 | /5 | latency-critical service |

Rules:
- All weights must still sum to 100
- New categories may be added
- Removed categories must redistribute their weight to another category stated in the Reason column; if unspecified, weight transfers to Correctness
- Overrides apply for all ratings in the session

---

## Rating Scale

| Rating | Meaning |
|---|---|
| 10/10 | Production-ready — publishable as internal company library |
| 9/10  | Strong reusable library — minor improvements remain |
| 8/10  | Good architecture — meaningful weaknesses present |
| 7/10  | Works — several framework concerns |
| 6/10  | Project-specific utility — not framework quality |
| <6/10 | Needs redesign |

---

## Required Review Output Format

When a rating is triggered, produce this exact structure — no variation:

```
## Code Review — <file_path>
Target: <N>/10

### Code Quality Score
| Category              | /pts | Score | Issues |
|---|---|---|---|
| Correctness           | /25  |  XX   | <issue or —> |
| Architecture          | /15  |  XX   | <issue or —> |
| API Design            | /15  |  XX   | <issue or —> |
| Framework Reusability | /15  |  XX   | <issue or —> |
| Type Safety           | /10  |  XX   | <issue or —> |
| Maintainability       | /5   |  XX   | <issue or —> |
| Extensibility         | /5   |  XX   | <issue or —> |
| Error Handling        | /5   |  XX   | <issue or —> |
| Documentation         | /3   |  XX   | <issue or —> |
| Performance           | /2   |  XX   | <issue or —> |
| **TOTAL**             | /100 |  XX   |              |
| **→ Rating**          |      | X.X/10|              |

### Problems — must fix to reach target <N>/10
1. [Category] <specific issue> — <what to fix>
2. [Category] <specific issue> — <what to fix>
...

### Goal: <N>/10 — NOT MET / MET
```

Rules for the problems list:
- List only problems that block reaching the target rating
- Each problem: `[Category]` tag + specific issue + concrete fix action
- If goal is already met, write "No blocking problems." and mark MET
- If a problem cannot be fixed due to domain constraints (e.g. inherently O(n²) algorithm), document it as `Note: <constraint reason>` — do not count it as blocking

---

## Iteration Loop

```
1. Trigger:  rate <file_path> target <N>
2. AI:       read full source file → produce review output above
3. AI:       if rating ≥ target on first run → mark MET, stop
4. User:     review problems list → ask AI to fix
5. Repeat:   re-trigger rating on same file, same target
6. Exit:     when Code Quality Rating ≥ target
```

**Edge cases:**
- Rating already meets target on first run: mark MET immediately, list no problems
- A fix in one category lowers another: note the tradeoff explicitly in the problems list; do not silently absorb the regression
- Target is 10/10: all categories must be at full marks; any issue in the Issues column blocks MET
- User explicitly ends the loop before target is reached: state final rating, do not re-rate
