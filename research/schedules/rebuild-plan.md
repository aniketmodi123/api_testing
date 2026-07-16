# Schedules — Engine Rebuild Plan

STATUS: approved-for-implementation
CREATED: 2026-07-12
IMPLEMENTER NOTE: This plan is self-contained. Read it top to bottom before writing code.
Follow the phases in order. Do not merge phases. Do not invent behavior not specified here —
if something is ambiguous, the Decision Table at the bottom is the tiebreaker.

---

## 1. Why this rebuild exists

The current scheduler "works sometimes." Root-cause investigation found the architecture
(DB-backed polling engine) is sound — it is the same pattern used by Solid Queue, GoodJob,
pg-boss, and Quartz JDBC JobStore. The bugs are all in the implementation. We are therefore
**keeping the polling architecture and rebuilding the engine internals**, not adopting
APScheduler/Celery/Temporal.

Why not a library:
- Schedules are dynamic rows created from the UI and live in Postgres already. APScheduler's
  persistent jobstores are sync-SQLAlchemy and fight asyncpg; APScheduler 4 is not stable.
- Celery beat requires a broker and a static beat schedule; dynamic per-user schedules need
  a custom DatabaseScheduler anyway — same work, more infra.
- Postgres `FOR UPDATE SKIP LOCKED` gives us multi-instance-safe claiming for free.

Industry patterns we adopt (mapped from Quartz / k8s CronJob / Solid Queue):

| Industry concept | k8s / Quartz name | Our implementation |
|---|---|---|
| Atomic job claim | Quartz `SELECT FOR UPDATE`, SKIP LOCKED in Solid Queue | Claim due schedules with `with_for_update(skip_locked=True)`, create execution row + advance `next_run` in one commit |
| Overlap control | k8s `concurrencyPolicy: Forbid`, APScheduler `max_instances=1` | Skip firing when schedule already has a `queued`/`running` execution |
| Misfire handling | Quartz "fire once now" (coalesce), k8s `startingDeadlineSeconds` | `compute_next_run` fast-forwards past `now` — at most one catch-up run after downtime |
| Stuck-job recovery | Sidekiq/GoodJob reaper | Reaper marks `queued`/`running` executions older than `EXEC_TIMEOUT` as `timed_out` |
| Timezone correctness | Quartz `CronTrigger(timeZone=...)` | IANA `timezone` column per schedule; wall-clock math in that tz; store UTC |
| History limits | k8s `successfulJobsHistoryLimit` | Keep last `RETENTION_N` executions per schedule, prune on completion |
| Manual trigger | `kubectl create job --from=cronjob` | `POST /schedules/{id}/run` |

---

## 2. Confirmed bugs being fixed (with locations)

| # | Bug | Location | Effect |
|---|-----|----------|--------|
| B1 | Engine checks `t == "minutes"` but enum value is `"minutely"` | `routers/script/test_scheduler.py:31,121` | Minutely schedules fire once, then `next_run=None` forever — silent death |
| B2 | `_seed_first_next_run` duplicated with divergent logic (CRUD vs engine) | `routers/shedulers/shedule_test.py:61`, `routers/script/test_scheduler.py:25` | CRUD seeds one cadence, engine advances another; B1 is a direct symptom |
| B3 | `ensure_naive_datetime` strips tzinfo without converting to UTC; engine uses naive server-local `datetime.now()` | `shedule_test.py:28`, everywhere in `test_scheduler.py` | Schedules run at wrong wall-clock time for any user not in the container's TZ |
| B4 | One DB session held across the entire HTTP bulk run (per-case timeout 200s) | `test_scheduler.py:211-266` | Pool exhaustion (default 5+10) under a few concurrent runs → intermittent 500s across the whole app |
| B5 | Executions stuck in `running` after process restart; delete endpoint refuses them | no reaper exists | Phantom "running" rows forever |
| B6 | `next_run` advanced + committed BEFORE tasks are created; no row locking | `test_scheduler.py:270-310` | Crash between commit and task spawn = silently lost run; two engine instances double-fire |
| B7 | Exception path commits without rollback | `test_scheduler.py:256-262` | DB error → session unusable → commit raises → execution stuck `running`, alerts skipped |
| B8 | No overlap guard | engine | Run longer than interval → concurrent executions of same schedule |
| B9 | `once` with past `date_time` fires immediately; CRUD comment claims engine ignores it | `shedule_test.py:64-68` | Surprise immediate run on create |
| B10 | Executions list unbounded, includes full per-case request/response JSON | `shedule_test.py:254-324` | Response grows without bound → slow/timeout |
| B11 | Monthly day silently capped to 28; weekly `startswith` fuzzy day match; `_parse_hhmm` silent `(0,0)` fallback; hourly ignores hour component | trigger helpers | Wrong-day / wrong-time runs, silently |
| B12 | `start_from` column exists, never used | `models.py:437` | Dead schema |

---

## 3. Target architecture

Three processes stay as-is: FastAPI app (CRUD), scheduler container (`scheduler_main.py`
under supervisord), shared Postgres. What changes is internal.

```
┌────────────┐   writes schedule rows    ┌──────────────────────────┐
│ FastAPI    │ ────────────────────────► │ bulk_test_schedules      │
│ /schedules │   next_run via triggers   │ (next_run = UTC, naive)  │
└────────────┘                           └────────────┬─────────────┘
                                                      │ poll every 30s
                                         ┌────────────▼─────────────┐
                                         │ Engine tick               │
                                         │ 1. reap stuck executions  │
                                         │ 2. claim due (SKIP LOCKED)│
                                         │    - overlap check        │
                                         │    - create exec 'queued' │
                                         │    - advance next_run     │
                                         │    - commit (atomic claim)│
                                         │ 3. spawn task per exec id │
                                         └────────────┬─────────────┘
                                                      │ asyncio task per execution
                                         ┌────────────▼─────────────┐
                                         │ run_execution_task(exec_id)│
                                         │ P1 session: mark running,  │
                                         │    build run plan, CLOSE   │
                                         │ P2 NO session: httpx runs  │
                                         │ P3 new session: persist    │
                                         │ P4 new session: alerts     │
                                         └──────────────────────────┘
```

Key invariant: **an execution row is created at claim time, before any work happens.**
A crash at any point leaves a `queued` or `running` row that the reaper converts to
`timed_out`. No run is ever silently lost (fixes B6), and no phantom `running` rows
survive (fixes B5).

### Datetime convention (project-wide for this feature)

- All DB `DateTime` columns stay **naive, semantically UTC**.
- All engine/CRUD code uses `utcnow_naive()` (helper: `datetime.now(timezone.utc).replace(tzinfo=None)`).
- Incoming tz-aware datetimes are converted to UTC **then** stripped:
  `dt.astimezone(timezone.utc).replace(tzinfo=None)`. Incoming naive datetimes are
  interpreted in the schedule's `timezone`.
- Wall-clock fields (`time`, `days_of_week`, `day_of_month`) are interpreted in the
  schedule's IANA `timezone` (default `"UTC"`), converted to UTC for storage/compare.
- DST rules: on a nonexistent local time (spring-forward gap) fire at the first valid
  instant after the gap; on an ambiguous time (fall-back) use the first occurrence
  (`fold=0`). Use stdlib `zoneinfo` — no new dependency.

---

## 4. Schema changes (expand-only, no drops)

### 4.1 New column

```sql
ALTER TABLE bulk_test_schedules ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);
```

- `NULL` means UTC (legacy rows keep behaving as before when the container runs UTC).
- Model: `timezone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)`.

There is no alembic in this project. Run the ALTER via an idempotent startup migration in
`scheduler_main.py` right after `create_all` (raw `text()` execute — `IF NOT EXISTS` makes
it safe to run every boot). Follow the existing one-off-script pattern
(`src/scripts/backfill_encrypt_secrets.py`) for the backfill below.

### 4.2 Backfill script — `src/scripts/recompute_schedule_next_runs.py`

One-off script: for every `enabled=true` schedule, recompute `next_run` with the new
trigger module (timezone `UTC`). Fixes all schedules already killed by B1
(`next_run IS NULL` but enabled) and any drift. Idempotent — safe to rerun.

### 4.3 Status vocabulary (documentation + code constants, no DB change)

Canonical execution statuses — define once as module-level constants (used in ~6 places
today as bare strings):

```
queued | running | success | partial | failed | timed_out
```

- `timed_out` is new (reaper). Alert mapping: `timed_out` triggers `on_failure`.
- Fix the `BulkTestExecution` docstring in `models.py` (currently claims
  `queued/running/completed/failed` — `completed` has never existed).
- "Active" statuses = `('queued', 'running')` — used by overlap check, reaper,
  delete-guard, and running-list endpoint. Define as one constant tuple.

---

## 5. New module: `src/schedule_triggers.py` (single source of truth)

Pure functions, no DB, no I/O — fully unit-testable with frozen time. Both the CRUD router
and the engine import from here. **Delete both existing `_seed_first_next_run` copies and
the engine's `compute_next_run` and `_parse_hhmm`** — nothing else may compute trigger
times. (Placement note: flat top-level module next to `notification_service.py` — matches
house layout.)

```python
def utcnow_naive() -> datetime: ...
def to_utc_naive(dt: datetime, tz_name: Optional[str]) -> datetime:
    """Aware → convert to UTC, strip. Naive → localize in tz_name (default UTC), convert, strip."""

def compute_next_run(
    *,
    schedule_type: str,          # "once"|"minutely"|"hourly"|"daily"|"weekly"|"monthly"
    after: datetime,             # naive UTC; first fire strictly AFTER this instant
    tz_name: Optional[str],      # IANA name or None (= UTC)
    interval_count: int = 1,
    anchor: Optional[datetime] = None,   # naive UTC; start_from or created_at
    date_time: Optional[datetime] = None,  # naive UTC; for "once"
    time_hhmm: Optional[str] = None,
    days_of_week: Optional[list[str]] = None,   # canonical full lowercase names
    day_of_month: Optional[int] = None,
) -> Optional[datetime]:         # naive UTC, strictly > after; None = never fires again
```

Keyword-only args, plain values (not the ORM object) — keeps it pure and testable. Add a
thin adapter `next_run_for(schedule: BulkTestSchedule, after: datetime)` that unpacks the
ORM row and calls it (anchor = `start_from or created_at` — this finally uses `start_from`,
fixing B12).

### Per-type semantics (locked — implement exactly this)

- **once** — return `date_time` if `> after`, else `None`. No recurrence.
- **minutely** — every `max(20, interval_count)` minutes, anchored:
  `anchor + ceil((after - anchor)/step) * step`, seconds/micros zeroed. Anchor-based math
  is drift-free and deterministic (no dependency on previous `next_run`).
- **hourly** — every `max(1, interval_count)` hours at minute `mm` from `time_hhmm`
  (hour component of `time` is **ignored — documented**, minute defines the offset within
  the hour). Anchor-based like minutely, computed in local tz.
- **daily** — every `max(1, interval_count)` days at `HH:MM` local time. Anchor date =
  anchor's local date.
- **weekly** — at `HH:MM` local on each day in `days_of_week`; `interval_count` = every N
  weeks, weeks aligned to the ISO week of the anchor. Candidate scan: from `after`'s local
  date forward, first matching (week-in-cadence, weekday, HH:MM) instant `> after`.
- **monthly** — every `max(1, interval_count)` months from the anchor month, on
  `day_of_month` **clamped to the last day of the target month** (31 → Feb 28/29, Apr 30 —
  clamp, don't skip: this matches user expectation "end of month", unlike cron's skip),
  at `HH:MM` local.

### Strictness rules (replace today's silent fallbacks — B11)

- `time_hhmm` malformed → raise `ValueError` (CRUD validation makes this unreachable from
  the API; the raise protects against bad legacy rows — engine catches per-schedule, logs,
  and skips that row without killing the tick).
- `days_of_week` values must be canonical full lowercase day names — exact `==` match
  only. Canonicalization happens once, in the Pydantic validator (§7.1). No `startswith`.

---

## 6. Engine rewrite: `routers/script/test_scheduler.py`

Same file, same entry point (`run_engine` — `scheduler_main.py` import path unchanged).
Constants at module top (env-overridable via `os.environ.get` with defaults):

```python
CHECK_INTERVAL = 30          # seconds between ticks
CLAIM_BATCH = 50             # max schedules claimed per tick
EXEC_TIMEOUT_MIN = 30        # reaper: minutes before queued/running → timed_out
RETENTION_N = 50             # executions kept per schedule
```

### 6.1 Tick — `run_engine_once()`

```python
async def run_engine_once():
    now = utcnow_naive()
    await reap_stuck_executions(now)           # own short session
    claimed: list[int] = []                    # execution ids

    async with SessionLocal() as db:
        scheds = (await db.execute(
            select(BulkTestSchedule)
            .where(
                BulkTestSchedule.enabled.is_(True),
                BulkTestSchedule.next_run.is_not(None),
                BulkTestSchedule.next_run <= now,
            )
            .order_by(BulkTestSchedule.next_run)
            .limit(CLAIM_BATCH)
            .with_for_update(skip_locked=True)
        )).scalars().all()

        for sched in scheds:
            sched.last_run = now
            try:
                sched.next_run = next_run_for(sched, after=now)   # coalesces past-due (misfire policy)
            except ValueError as e:
                logs(f"[scheduler] bad trigger config schedule={sched.id}: {e}", type="error")
                sched.enabled = False          # quarantine bad rows instead of retrying forever
                continue
            if sched.type == ScheduleType.once:
                sched.enabled = False

            # overlap policy: Forbid (k8s-style) — skip if an active execution exists
            active = (await db.execute(
                select(func.count()).select_from(BulkTestExecution).where(
                    BulkTestExecution.schedule_id == sched.id,
                    BulkTestExecution.status.in_(ACTIVE_STATUSES),
                )
            )).scalar()
            if active:
                logs(f"[scheduler] overlap skip schedule={sched.id}", type="error")
                continue

            ex = BulkTestExecution(schedule_id=sched.id, status="queued", started_at=now)
            db.add(ex)
            await db.flush()                   # get ex.id
            claimed.append(ex.id)

        await db.commit()                      # atomic claim: exec rows + next_run advance together

    for eid in claimed:
        asyncio.create_task(run_execution_task(eid))
```

Notes for the implementer:
- `with_for_update(skip_locked=True)` fixes B6: a second engine instance skips locked rows
  instead of double-firing. Row locks are released at commit — one commit for the whole
  batch keeps the claim atomic.
- The `last_run == now` sentinel hack is gone — tasks are spawned from the explicit
  `claimed` list of execution ids (not schedule ids).
- Misfire policy is inherent: `compute_next_run(after=now)` always returns a future time,
  so downtime produces at most one catch-up fire per schedule (Quartz "fire once now").
- `once` past-dated legacy rows: fire once (user created it deliberately), then disabled.
  New past-dated `once` rows are rejected at the API (§7.1), so this only applies to
  legacy data.
- `queued` rows get `started_at = claim time` so the reaper needs no new column; the task
  overwrites `started_at` when it actually starts running.

### 6.2 Reaper — `reap_stuck_executions(now)`

Single UPDATE, own session:

```sql
UPDATE bulk_test_executions
SET status = 'timed_out',
    finished_at = :now,
    error_message = 'Execution exceeded ' || :timeout || ' minutes (reaped by scheduler)'
WHERE status IN ('queued', 'running')
  AND started_at < :now - make_interval(mins => :timeout)
```

Fixes B5. Runs every tick; the WHERE is index-friendly (`status` is indexed).

### 6.3 Execution task — `run_execution_task(execution_id: int)`

Four phases, **never one session across an HTTP call** (fixes B4):

```python
async def run_execution_task(execution_id: int) -> None:
    # P1 — short session: claim the execution, build the run plan
    async with SessionLocal() as db:
        ex = await db.get(BulkTestExecution, execution_id)
        if not ex or ex.status != "queued":
            return                                # reaped or deleted meanwhile
        ex.status = "running"
        ex.started_at = utcnow_naive()
        await db.commit()
        schedule = await db.get(BulkTestSchedule, ex.schedule_id)
        schedule_id = schedule.id
        try:
            plan = await prepare_bulk_run(db, schedule)    # ALL db reads happen here (§6.4)
        except Exception as e:
            await db.rollback()                            # B7 fix: rollback before reuse
            await _finalize_failed(execution_id, e)
            return
    # session CLOSED here — no pool connection held during HTTP

    # P2 — no session: pure httpx execution
    try:
        flat_cases = await execute_bulk_run(plan)          # §6.4
    except Exception as e:
        await _finalize_failed(execution_id, e)
        return

    # P3 — new session: persist results + stats + rollup
    async with SessionLocal() as db:
        ex = await db.get(BulkTestExecution, execution_id)
        if not ex:
            return
        for case_res in flat_cases:
            db.add(BulkTestResult(execution_id=execution_id, ...))   # same field mapping as today
        _accumulate_execution_stats(ex, flat_cases)                   # keep existing helper
        ex.finished_at = utcnow_naive()
        await db.commit()
        await refresh_monitor_rollup(db, schedule_id)
        await db.commit()
        await _prune_old_executions(db, schedule_id)                  # retention, §6.5

    # P4 — new session: alerts (isolated so alert failures can't poison result persistence)
    async with SessionLocal() as db:
        ex = await db.get(BulkTestExecution, execution_id)
        if ex:
            await dispatch_alerts(db=db, schedule_id=schedule_id, execution=ex)
```

`_finalize_failed(execution_id, err)` opens its OWN fresh session, marks the execution
`failed` with `error_message=str(err)` and `finished_at`, commits, refreshes the rollup,
then dispatches alerts — a fresh session cannot be in a poisoned state (fixes B7
completely). Truncate `error_message` to 2000 chars.

### 6.4 Runner split — `routers/runner/runner.py`

Split the scheduler-facing `bulk_run_cases(data, db)` (runner.py:226) at its natural seam
— everything before the httpx loop is DB reads, everything after is pure HTTP:

```python
async def prepare_bulk_run(db: AsyncSession, schedule) -> BulkRunPlan   # all DB reads → plain data
async def execute_bulk_run(plan: BulkRunPlan) -> list[dict]             # httpx only, returns flat case results
```

`BulkRunPlan` = a Pydantic model (or TypedDict) holding fully-resolved, DB-free data:
per-file endpoint/method/headers and the resolved `cases_data` list (headers/params/body/
expected already variable-resolved). Nothing in it may hold an ORM object.

Keep `bulk_run_cases(data, db)` as a thin wrapper (`prepare` → `execute` → reassemble the
current `{"response_code": 200, "data": {...}}` shape) so any other caller is unaffected.
The HTTP route in `routers/runner/bulk_run_cases.py:57` is a different function — do not
touch it.

Also change: `execute_bulk_run` returns the flat case list directly, so the engine no
longer parses the `{"response_code": ...}` wrapper dict (today's `raise RuntimeError` on
`response_code != 200` becomes a normal exception from `prepare_bulk_run`, e.g.
`ValueError("user not found")`).

### 6.5 Retention — `_prune_old_executions(db, schedule_id)`

After each completed run (P3): delete executions (and their results) beyond the newest
`RETENTION_N` for that schedule:

```sql
DELETE FROM bulk_test_results WHERE execution_id IN (
  SELECT id FROM bulk_test_executions
  WHERE schedule_id = :sid
  ORDER BY started_at DESC OFFSET :n
);
DELETE FROM bulk_test_executions WHERE id IN (
  SELECT id FROM bulk_test_executions
  WHERE schedule_id = :sid
  ORDER BY started_at DESC OFFSET :n
);
```

Piggybacking on run completion means no global scan and no separate cron.

### 6.6 Engine loop

`run_engine()` stays as-is (while-True, catch-log-continue, `CancelledError` re-raised),
except: drop the per-tick `logs("scheduler tick")` info lines — logging rules say errors
only.

---

## 7. CRUD router changes: `routers/shedulers/shedule_test.py`

### 7.1 Validation hardening (`schema.py` → `ScheduleCreate`)

- Add `timezone: Optional[str] = None`; validator: must be resolvable by
  `zoneinfo.ZoneInfo(v)`, else `ValueError("invalid IANA timezone")`.
- `days_of_week` validator: canonicalize each entry — accept `"Mon"`, `"monday"`,
  `"MONDAY"` → store `"monday"`; anything not resolving to exactly one weekday → error.
  (Fixes fuzzy-match half of B11 at the boundary.)
- `once`: `date_time` must be in the future — after converting with `to_utc_naive(...)`,
  require `> utcnow_naive() - timedelta(seconds=60)` (60s clock-skew grace). Fixes B9 by
  contract; update the misleading comment.
- Keep existing `time`/`interval_count` per-type rules unchanged.

### 7.2 Handler changes

- **create / update**: replace local `_seed_first_next_run` with
  `next_run_for(sched, after=utcnow_naive())` from `schedule_triggers`. Delete the local
  helper and `ensure_naive_datetime` (use `to_utc_naive` with the schedule's timezone).
  Persist `timezone`. Include `timezone` in the response payload.
- **New `PATCH /schedules/{schedule_id}`** — partial update, body
  `SchedulePatch(enabled: Optional[bool])` (extensible later). On `enabled: true`, if
  `next_run` is NULL or `<= now`, recompute via `next_run_for` — re-enabling never causes
  an instant surprise fire.
- **New `POST /schedules/{schedule_id}/run`** — manual trigger. Ownership check (same
  pattern as delete), then: if an active (`queued`/`running`) execution exists → `409`
  with `"A run is already in progress"`. Else create `BulkTestExecution(status="queued",
  started_at=utcnow_naive())`, commit, `asyncio.create_task(run_execution_task(ex.id))`,
  return `201` with the execution row. Note: this endpoint lives in the API process, so
  the API process imports `run_execution_task` — that import chain is already present
  (both processes share the codebase); no supervisord change needed.
- **`GET /schedules/{id}/executions`** — add `limit: int = 20` (max 100), `offset: int = 0`
  query params; return executions **without** per-case `results` (summary fields only) plus
  `total` count. Fixes B10. (FE is not built yet per spec — no consumer breaks; MCP server
  has no schedule tools.)
- **New `GET /schedules/{id}/executions/{execution_id}`** — single execution WITH full
  `results` array (the detail view the list no longer carries).
- **delete guards**: swap hardcoded `("running", "queued")` for the `ACTIVE_STATUSES`
  constant (`timed_out` rows are deletable).
- **Response schemas**: define `ScheduleResponse`, `ExecutionSummaryResponse`,
  `ExecutionDetailResponse`, `CaseResultResponse` Pydantic models in `schema.py` and pass
  them as the third arg to `create_response(...)` on all success paths (house rule). Run
  the response-schema verification checklist from CLAUDE.md against the actual rows —
  e.g. `finished_at` IS nullable (running rows), `error_message` IS nullable,
  `interval_count` is NOT nullable.
- **try/except**: per project rules, drop the blanket try/except-`ExceptionHandler`
  wrappers in the endpoints you touch — the global handler in `main.py` owns unhandled
  exceptions; session close rolls back uncommitted work. Keep explicit handling only where
  a custom response is produced.

### 7.3 Shared-workspace access (product decision made 2026-07-12)

Rule: **anyone with access to the API — owner or joined workspace member — can schedule
it.** Today two duplicate `verify_nodes` functions disagree: the runner's copy
(`routers/runner/runner.py:20`) is already member-aware (owner OR joined member), while
the scheduler CRUD's copy (`routers/shedulers/shedule_test.py:40`) is owner-only, so
members can run but not schedule. Fix:

- Move the member-aware implementation (the runner.py version, verbatim semantics) into
  `common_querys.py` as `verify_nodes_access(db, node_ids, user_id) -> list[Node]`.
- Delete both local copies; runner and scheduler CRUD import the shared helper.
- Ownership checks on schedule rows themselves (`BulkTestSchedule.username == username`
  in GET/PUT/DELETE/executions) stay as-is — you manage your own schedules; the member
  rule only governs which files you may point a schedule at.

### 7.4 Out of scope for CRUD (do NOT do)

- Do not rename the `shedulers` folder / `shedule_test.py` typo in this change — imports
  in `main.py` and elsewhere depend on it. Optional follow-up commit, separate PR.
- Do not touch `alerts.py` except the `timed_out` mapping below.

---

## 8. Alerts: `notification_service.py`

One change: `timed_out` fires `on_failure` alerts, and `_execution_status_label` maps
`timed_out` → `"TIMED OUT"`. In `dispatch_alerts`, the `should_fire` check becomes
`status in ("failed", "timed_out") and alert.on_failure` for the failure branch.

---

## 9. Test plan (backend/tests, pytest — required, not optional)

### 9.1 Trigger unit tests — `tests/test_schedule_triggers.py` (table-driven, frozen `after`)

| Case | Expectation |
|---|---|
| minutely: interval 20, anchor 10:00, after 10:25 | 10:40 |
| minutely: interval below 20 | clamped to 20 |
| hourly: every 2h at :15, anchor 08:15, after 09:00 | 10:15 |
| daily: 14:30 in Asia/Kolkata, after = 08:45 UTC (=14:15 IST) | 09:00 UTC (=14:30 IST) same day |
| daily: same but after = 09:30 UTC | next day 09:00 UTC |
| weekly: ["monday","thursday"] 09:00, after = Tue | Thursday 09:00 local |
| weekly: interval 2, anchor in week W, after in week W+1 | first match in week W+2 |
| monthly: day 31, target February | Feb 28 (29 leap) — clamped |
| monthly: interval 3 from anchor Jan | Apr, Jul, Oct |
| once: date_time in past | None |
| once: date_time in future | that instant |
| DST: Europe/Berlin daily 02:30 on spring-forward day | fires 03:00 local (first valid instant) |
| DST: fall-back ambiguous 02:30 | fold=0 (first occurrence) |
| malformed time "9am" | raises ValueError |
| after far in past (downtime catch-up) | single next value strictly > after (coalesce) |

### 9.2 Engine integration tests — `tests/test_scheduler_engine.py` (real DB)

- Claim atomicity: two concurrent `run_engine_once()` on the same due schedule → exactly
  one execution row (SKIP LOCKED).
- Overlap Forbid: schedule with a `running` execution stays skipped, `next_run` still
  advances.
- Reaper: `running` execution with `started_at` 31 min ago → `timed_out`, alert fired via
  on_failure path.
- `once`: fires, then `enabled=False`, `next_run=None`.
- Bad-config row (weekly with empty days injected directly into DB): quarantined
  (`enabled=False`), tick survives.
- Task phases: exception inside `prepare_bulk_run` → execution `failed` with message, no
  stuck `running`.

### 9.3 API tests — `tests/test_schedules_api.py`

- Create: happy path per type; past `once` → 422; bad timezone → 422; bad day name → 422.
- Auth failure: unknown username → 400 (existing contract).
- Shared access: joined member creates schedule for shared-workspace file → 201;
  non-member → 403 (§7.3).
- PATCH enable recomputes stale `next_run`.
- Run-now: 201 + execution created; second call while active → 409.
- Executions list: pagination bounds, no `results` key in summary; detail endpoint has it.
- Delete guards: cannot delete `running`; can delete `timed_out`.

---

## 10. Implementation phases (do in order; each compiles + tests green before next)

| Phase | Scope | Files | Acceptance |
|---|---|---|---|
| 1 | Trigger module + unit tests | `src/schedule_triggers.py`, `tests/test_schedule_triggers.py` | §9.1 table passes; no other file touched |
| 2 | Schema expand + backfill | `models.py` (+timezone col, docstring fix, status constants), `scheduler_main.py` (idempotent ALTER), `src/scripts/recompute_schedule_next_runs.py` | ALTER runs twice cleanly; backfill revives B1-killed rows |
| 3 | Runner split | `routers/runner/runner.py` | `prepare_bulk_run`/`execute_bulk_run` exist; `bulk_run_cases` wrapper output byte-identical shape |
| 4 | Engine rewrite | `routers/script/test_scheduler.py` | §9.2 passes; old seed/compute/parse helpers deleted |
| 5 | CRUD + new endpoints + schemas + shared access | `routers/shedulers/shedule_test.py`, `schema.py`, `common_querys.py` (+`verify_nodes_access`), `routers/runner/runner.py` (import swap) | §9.3 passes; local trigger helpers and both `verify_nodes` copies deleted |
| 6 | Alerts timed_out | `notification_service.py` | reaper test's alert assertion passes |
| 7 | Docs + graph | `research/schedules/spec.md` status, `graphify update .` | spec reflects reality |

Optional follow-up (separate PR, not this change): rename `shedulers` → `schedulers`.

---

## 11. Decision Table

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Architecture | Keep DB-polling engine, rebuild internals | Industry-standard for Postgres-only stack (Solid Queue/GoodJob/pg-boss/Quartz); libraries add infra without fixing our bugs |
| D2 | Multi-instance safety | `FOR UPDATE SKIP LOCKED` claim + execution row at claim time | Atomic claim; crash-safe; scales to N engine replicas untouched |
| D3 | Timezone storage | Naive-UTC columns + IANA `timezone` column, zoneinfo math | No column type migration; correct wall-clock semantics; stdlib only |
| D4 | Overlap policy | Forbid (skip), hardcoded | k8s default-equivalent; simplest correct behavior; per-schedule knob = future work |
| D5 | Misfire policy | Coalesce to one catch-up run | Quartz "fire once now" default; inherent in `compute_next_run(after=now)` |
| D6 | Stuck executions | Reaper → `timed_out` after 30 min | No heartbeat infra needed; 30 min ≫ worst-case run (200s/case caps) |
| D7 | Monthly day 29–31 | Clamp to last day of month | Matches user intent "end of month"; cron-style skip surprises users |
| D8 | Bad trigger config at runtime | Quarantine (`enabled=False`) + error log | Stops infinite 30s retry loop; visible in UI as disabled |
| D9 | Retention | Last 50 executions per schedule, pruned on completion | Bounded growth; no global scan |
| D10 | Past-dated `once` | Reject at API (60s grace); legacy rows fire once | Contract over surprise |
| D11 | Executions list contract | Paginated summaries + separate detail endpoint | FE not built yet (spec), MCP has no schedule tools — safe to fix now, impossible later |
| D12 | Who can schedule shared-workspace APIs | Anyone with access (owner or joined member) — decided 2026-07-12 | Matches run permission (runner already member-aware); unify via shared `verify_nodes_access` in `common_querys.py` (§7.3) |
| D13 | `shedulers` typo rename | Deferred to separate PR | Pure churn risk inside a behavioral rewrite |
