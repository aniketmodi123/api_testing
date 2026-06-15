# EXECUTION GUIDE — How any coding assistant builds this roadmap

LAST_UPDATED: 2026-06-15

> Read this first. It tells you exactly how to pick up a phase and finish it without extra context.
> **Coding + validation are the LAST step. Do not write code until the user approves the gate**
> (`research/implementation-plan.md`).

---

## 1. Where things live
| You need… | Open… |
|---|---|
| Whole-project analysis (gaps, security, domain, API, DB) | `research/*.md` (strategic, read once) |
| The thing to BUILD | `research/phases/phase_N/` (one phase = one folder) |
| How to make code look like the user's own | `research/coding-style-guide.md` (MANDATORY) |
| What makes us beat Postman | `research/differentiators.md` |
| Decisions / assumptions / risks | `research/trackers.md` |

## 2. Build order
Strictly by phase number: **phase_0 → phase_15**. Respect each README's `Depends on`. Foundations
(0 hardening, 1 secrets, 2 audit) unblock the rest — never skip them.

## 3. How to execute ONE phase
1. Open `phase_N/README.md` → read goal, deliverables, **Task → Subtask checklist**.
2. Read `phase_N/spec.md` → exact tables/endpoints/decisions/edge-cases. (Stubs phase_6–15 have no spec yet — **write spec.md + research.md + test_matrix.md first**, using the README + root `research/*.md`, then build.)
3. Read `phase_N/research.md` → which existing code to REUSE. Reuse before writing new (project rule).
4. Pick the lowest unchecked subtask `Tx.y`. It is ≤1 day, one layer, one PR.
5. Build it following `coding-style-guide.md`. Logic stays in route handlers (no service layer unless the phase says so).
6. Write/extend tests from `phase_N/test_matrix.md`.
7. Pass the gate (section 5). Check off `Tx.y` in the README.
8. After the change: run `graphify update .`, update the spec Decision Table if a decision was made, flip status in `research/MEMORY.md`.

## 4. Subtask format (in every phase README)
```
### T1 — <name>   [files: ...]   [reuse: ...]   [done when: ...]
- [ ] T1.1 <one PR-sized step>
- [ ] T1.2 ...
```
IDs are stable. One checkbox = one independently shippable PR.

## 5. Definition of Done (every subtask / phase)
A subtask is done when its slice of `test_matrix.md` is green. A **phase** is done when ALL of:
- `validation-framework.md` V1–V10 pass for its endpoints
- the phase's per-feature validation row passes
- regression suite green
- secrets encrypted (if any), audit written (if mutating), RBAC gated
- README checklist fully checked, `MEMORY.md` status flipped

## 6. House rules (non-negotiable, from coding-style-guide.md)
- `username` header + `get_user_by_username`; `create_response(...)`; `try/except → rollback → ExceptionHandler`.
- Pydantic **v1**. Reuse `logs()` (not a new logger). RBAC via `can_access_workspace(min_role=)`.
- No AI tells: sparse comments, match naming, don't reformat unrelated lines, keep the `206` not-found quirk.
- New model → add import in `main.py` (until Alembic owns schema after phase_0).

## 7. The gate
`research/readiness-review.md` = planning complete. `research/implementation-plan.md` = code-gen gate,
**OPEN but awaiting user approval**. First coding task = phase_0 T1 (Alembic baseline). Nothing before approval.
