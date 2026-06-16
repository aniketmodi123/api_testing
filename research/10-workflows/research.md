# Research — Workflows / Flows

LAST_UPDATED: 2026-06-16
SOURCE: Claude training knowledge (cutoff Aug 2025); canonical Postman docs URLs listed but NOT fetched.

> FLAG: Postman Flows was still evolving rapidly as of Aug 2025. Block types, trigger options,
> and plan-gating may have changed. All items marked [UNVERIFIED — needs live check] must be
> validated against live Postman docs before finalising spec decisions that depend on them.

---

## Canonical Reference URLs (not fetched — for engineer validation)
- Overview:   https://learning.postman.com/docs/postman-flows/gs/flows-overview/
- Blocks ref: https://learning.postman.com/docs/postman-flows/flows-query-language/blocks-reference/
- Triggers:   https://learning.postman.com/docs/postman-flows/concepts/flows-triggers/
- Run history:https://learning.postman.com/docs/postman-flows/gs/flows-runs-and-output/
- Variables:  https://learning.postman.com/docs/postman-flows/concepts/flows-variables/
- Integration:https://learning.postman.com/docs/postman-flows/concepts/flows-and-collections/

---

## Existing Code (APIPilot baseline)
| File | Purpose |
|---|---|
| `backend/src/models.py` | `Flow`, `FlowStep`, `FlowRun`, `FlowStepResult` models |
| `backend/src/routers/flow/` | CRUD + run + history endpoints |
| `backend/src/routers/runner/bulk_run_cases.py` | Template for engine step loop pattern |
| `backend/src/routers/runner/execute_direct.py` | Source of `send_request()` — needs extraction |
| `backend/src/routers/runner/validator.py` | Assertion check reused per step |

---

## Models
```
Flow
  id, workspace_id(FK), name, description, graph(JSON), enabled

FlowStep
  id, flow_id(FK), step_order, type[request/condition/delay/set_var]
  api_id(FK null), config(JSON), extract(JSON jsonpath→var), condition(JSON)

FlowRun
  id, flow_id(FK), status, context(JSON run vars), started_at, finished_at, error_message

FlowStepResult
  id, flow_run_id(FK), step_id, success
  request(JSON), response(JSON masked), duration_ms, created_at
```

---

## Postman Flows — Deep Research

### 1. Canvas & Visual Builder

Postman Flows is a visual, node-based programming environment embedded in the Postman app
(web and desktop). The UI presents a zoomable, pannable infinite canvas. Users drag block
nodes from a left palette onto the canvas and connect them by drawing wires between typed
output ports and input ports on the blocks.

**Canvas UX mechanics:**
- Infinite canvas — pan with middle-mouse drag or trackpad two-finger scroll; zoom with
  Ctrl/Cmd + scroll wheel.
- Drag-and-drop block insertion from a collapsible left sidebar palette.
- Blocks snap to an implicit grid.
- Blocks are colour-coded by category (send = blue, control = orange/yellow, data = grey,
  output = green, debug = red/pink).
- Auto-layout button tidies block positions.
- Blocks are resizable in some cases (e.g. Template block text area).
- Selection box (rubber-band select) for multi-block move/delete.
- Right-click context menu on canvas (add block, paste).
- Block configuration opens in a right-side panel when a block is clicked — it does NOT
  open a modal.
- The top toolbar has: Run, Stop, Save, Flow Variables button, and a Trigger selector.

### 2. Block Types (Postman Flows)

#### 2a. Send Request
- The core building block. Selects one saved request from a connected Postman Collection.
- Config panel: collection picker → request picker → environment selector.
- Input ports:
  - `variable overrides` (object) — key-value pairs that override collection variables for
    this execution.
  - `auth override` (optional — [UNVERIFIED]).
- Output ports:
  - `body` (object/any) — parsed response body.
  - `headers` (object) — response headers.
  - `status` (number) — HTTP status code.
  - `success` (boolean) — true when 2xx.
  - `response` (object) — full response envelope for downstream blocks.
- Error: when request fails, flow takes the implicit error path or stops (depending on
  version — [UNVERIFIED whether Postman Flows has an explicit error port on Send Request]).

#### 2b. If (Conditional Branch)
- Evaluates a FQL (Flows Query Language) expression against its input.
- Input port: `value` (any).
- Output ports: `TRUE` path and `FALSE` path.
- Config panel: expression editor with FQL syntax — supports comparison operators
  (`==`, `!=`, `>`, `<`, `>=`, `<=`), logical (`&&`, `||`), string/array methods.
- The expression references input variable by `$value` or path into an object.
- Downstream blocks connect to either the TRUE or FALSE port.

#### 2c. For (Loop / Iteration)
- Iterates over every element of an input list.
- Input port: `list` (array).
- Output ports: `item` (current iteration element), `index` (number), `done` (fires once
  after loop completes — [UNVERIFIED exact naming of done port]).
- Blocks wired inside the loop body execute once per item.
- The loop body typically terminates by feeding back to a Collect block to accumulate results.

#### 2d. Select (Field Extraction)
- Extracts a field from a JSON object using a FQL path expression.
- Input port: `data` (object).
- Output port: `value` (any — type depends on extracted field).
- Config panel: path expression (e.g. `body.users[0].id`).
- Replaces the need for explicit JSONPath extraction in the engine; equivalent to APIPilot's
  `extract(JSON jsonpath→var)` but visual.

#### 2e. Collect (Aggregator)
- Receives values across loop iterations and accumulates them into a single list.
- Input port: `value` (any).
- Output port: `list` (array) — emitted once after the For block's `done` port fires.
- Required pattern: For → (block chain) → Collect → downstream output block.

#### 2f. Output
- Renders the final result in the Flow Run Output pane.
- Input port: `value` (any).
- No output ports (terminal node).
- Config: optional label / description for the output.
- Multiple Output blocks are allowed in one flow; each renders separately in the viewer.
- Supports rendering: JSON object, plain string, number, list.

#### 2g. Log (Debug)
- Writes its input value to the flow's debug log without stopping execution.
- Input port: `value` (any).
- Output port: `value` (passthrough — same value forwarded for chaining).
- Config: optional label.
- Values appear in the "Logs" sub-tab of the run output viewer.

#### 2h. Template (String Interpolation)
- Builds a string by interpolating variable values into a text template.
- Input ports: one per variable reference used in the template (typed dynamically).
- Output port: `output` (string).
- Config: a freeform text area with `{{variable_name}}` placeholder syntax.
- Useful for constructing request paths, messages, or composed strings.

#### 2i. Now (Current Timestamp)
- Emits the current UTC timestamp when the flow runs.
- No input ports.
- Output port: `output` (string — ISO 8601 format; [UNVERIFIED exact type]).
- No config panel.

#### 2j. Date/Time Manipulation
- Blocks for date arithmetic: add/subtract duration, format, parse.
- [UNVERIFIED — Postman Flows had basic date support; exact block names and available
  operations were evolving as of Aug 2025. Needs live check.]

#### 2k. Delay
- Pauses execution for a configured duration before the next block fires.
- Input port: `value` (passthrough; optional).
- Output port: `value` (same as input).
- Config: delay in milliseconds (or seconds — [UNVERIFIED unit]).
- Max delay: [UNVERIFIED — likely plan-gated].

#### 2l. Evaluate (JS Expression)
- Runs a small JavaScript expression against the input.
- Input port: `value` (any).
- Output port: `result` (any).
- Config: JavaScript expression text area.
- Sandbox: runs in a V8 isolate with no DOM, no network access, no require().
  [UNVERIFIED — whether Postman Flows Evaluate block uses JS or FQL; some sources indicate
  FQL-based evaluation rather than raw JS. Needs live check.]

#### 2m. Other / Data blocks (partial — needs live check)
- **Regex** — match/replace with a regex pattern. [UNVERIFIED]
- **String** blocks (split, join, slice, trim). [UNVERIFIED]
- **Math** blocks (add, subtract, multiply, divide). [UNVERIFIED]
- **Merge** — joins two object inputs into one merged object. [UNVERIFIED block name]
- **Create Variable** / **Get Variable** — explicit variable scope manipulation. [UNVERIFIED]

### 3. Typed Connection Ports

Postman Flows enforces types on connection ports:
- Primitive types: `string`, `number`, `boolean`, `null`
- Composite types: `object`, `array` (called `list`)
- Special: `any` (accepts anything)

When a user tries to connect an `object` output to a `string` input, Flows shows a type
mismatch warning (orange/red highlight on the connection) and may prevent the connection or
warn at run time — [UNVERIFIED exact enforcement mode].

Type coercion: some coercions are implicit (number → string). Others require an explicit
block (object → string requires Template or JSON serialise). [UNVERIFIED — exact coercion rules].

### 4. Flow Variables

Flow-level variables are key-value pairs scoped to the entire flow run.

**Mechanics:**
- Defined via the "Flow Variables" button/panel in the top toolbar.
- Each variable has: name, type (string/number/boolean/object/list), and optional default value.
- Variables are injected as input ports on the first block that references them
  (or as initial data nodes at the top of the canvas — [UNVERIFIED exact UX]).
- Variables can be set as query params, path params, body fields, or header values in
  Send Request's variable override port.
- Variables are NOT the same as Postman Environment/Global variables; they are flow-scoped.
- A flow can read a Postman Environment variable from the selected environment (via the
  Send Request block's environment selector) but cannot write back to it.

**Data passing (block-to-block):**
- Data moves exclusively through wires (connections between output ports and input ports).
- There is no implicit shared memory between blocks — all data must be explicitly wired.
- This is the key paradigm difference from a script-based runner.

### 5. Flow Triggers

#### 5a. Manual (Run Button)
- User clicks the Run button in the canvas toolbar.
- A "Run" modal/drawer optionally lets user set flow variable values before starting.
  [UNVERIFIED — exact UX of pre-run variable entry].
- Flow executes immediately in the Postman client (cloud-backed execution).

#### 5b. Scheduled Trigger
- Cron-like scheduling using Postman's monitor infrastructure.
- Config: interval (every N minutes/hours) or specific time + day combination.
- [UNVERIFIED — whether full cron syntax is supported or only preset intervals].
- Scheduled flows run on Postman's cloud runner (not the user's machine).
- Notification on failure: email alert (same as Postman Monitors). [UNVERIFIED]
- Plan gating: scheduled triggers likely require a paid Postman plan. [UNVERIFIED]

#### 5c. Webhook Trigger
- Postman generates a unique HTTPS POST URL for the flow.
- A POST to that URL fires the flow. Payload body is available as flow variable input.
  [UNVERIFIED — exact mechanism for passing webhook payload into flow variables].
- The response of the webhook call is the Output block's value (or a generic ack).
  [UNVERIFIED].
- Webhook triggers are likely plan-gated. [UNVERIFIED]

#### 5d. API Trigger (programmatic)
- [UNVERIFIED — whether Postman Flows supports triggering via Postman API as of Aug 2025].

### 6. Flow Run History & Output Viewer

#### Run list
- Each flow has a "Runs" tab listing past executions.
- Columns: run number, triggered by (manual/scheduled/webhook), status (passed/failed/running),
  started at (timestamp), duration.
- Clicking a run opens the run detail view.

#### Run detail / output viewer
- Split view: left = canvas with block execution state overlaid (green/red per block);
  right = output panel.
- Per-block execution trace:
  - Block name + type.
  - Input values received (shown as JSON).
  - Output values emitted (shown as JSON).
  - Duration (ms).
  - Status (passed / failed / skipped).
- Error state: failed block shows error message inline; downstream blocks marked "skipped".
- Log block output appears in a "Logs" sub-tab.
- Output block renders its value in the "Output" sub-tab.
- Variable values at each point are visible by inspecting block I/O in the trace.
- [UNVERIFIED — whether Postman Flows supports live/streaming run view or only post-run].

### 7. Integration with Collections

- The Send Request block MUST reference a saved request from a Postman Collection.
  Flows cannot send ad-hoc requests — you must first save the request to a collection.
- The block inherits the collection's:
  - Pre-request scripts (run before send).
  - Tests/assertions (run after response — results surfaced in run trace).
  - Auth configuration (collection-level or request-level auth).
  - Collection/environment variables (resolved in the normal Postman variable scope chain).
- Flow variables can OVERRIDE collection variables for the duration of a step via the
  variable overrides input port.
- This means APIPilot's advantage: APIPilot flows can target any saved API case directly
  without the "collection first" prerequisite.

### 8. Canvas UX Details

| UX Feature | Postman Flows behaviour |
|---|---|
| Palette | Left sidebar, searchable, categorised (Send, Control, Data, Output, Debug) |
| Block insertion | Drag from palette onto canvas; double-click canvas shows quick-add picker |
| Canvas navigation | Pan: drag canvas background; Zoom: scroll wheel / pinch-to-zoom |
| Auto-layout | Single button — positions blocks in left-to-right execution order |
| Block resize | Text/Template blocks have a drag handle to expand text area |
| Multi-select | Rubber-band drag; Shift+click for additive select |
| Keyboard shortcuts | Ctrl/Cmd+Z undo; Del to delete selected; Ctrl/Cmd+C/V copy-paste |
| Connection wiring | Click output port → drag to input port; wire type enforced |
| Connection removal | Click wire → delete key; or right-click → remove |
| Block config | Click block → right panel opens; panel stays docked |
| Snap-to-grid | Blocks snap; can be disabled [UNVERIFIED] |
| Minimap | Available for large flows [UNVERIFIED] |
| Collapse/group | No grouping in Postman Flows as of Aug 2025 [UNVERIFIED if added later] |

### 9. Postman Flows vs Collection Runner — When to use which

| Criterion | Postman Flows | Collection Runner |
|---|---|---|
| Primary use | Complex orchestration with branching, looping, data extraction | Run a full collection in sequence (linear, all or filtered) |
| Conditional branching | Yes (If block) | No (scripts only, can skip via `pm.test`) |
| Data extraction between steps | Yes (Select block → wired to next) | Yes (via `pm.environment.set`) |
| Loop over data | Yes (For + Collect blocks) | Yes (CSV/JSON data file rows) |
| Visual authoring | Yes | No (list-based UI) |
| Scheduling | Yes (built-in trigger) | Yes (Postman Monitors) |
| Ad-hoc requests | No (must be in collection) | Yes (collection already defines them) |
| Parallel execution | No (sequential by default; [UNVERIFIED if parallel supported]) | No |
| Plan requirement | Paid plan for scheduling/webhook | Free for basic; paid for heavy monitor usage |

### 10. Postman Flows Query Language (FQL)

Postman Flows uses FQL — a purpose-built expression language for the If and Select blocks.

Key FQL features:
- Path navigation: `body.users[0].name` — dot notation + bracket index.
- Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`.
- Logical: `&&`, `||`, `!`.
- String methods: `.length`, `.includes("x")`, `.startsWith("x")`, `.endsWith("x")`.
- Array methods: `.length`, `.includes(x)`, `.filter(...)`, `.map(...)` [UNVERIFIED full set].
- Ternary: `condition ? then : else` [UNVERIFIED].
- No full JavaScript — FQL is a subset/superset designed for data navigation.
- [UNVERIFIED — exact FQL grammar and feature set; needs live check against Postman docs].

### 11. Plan Gating & Limits (as of Aug 2025 — subject to change)

| Feature | Free plan | Paid (Basic/Pro/Enterprise) |
|---|---|---|
| Flows execution | Limited runs/month [UNVERIFIED exact number] | Unlimited or higher limit |
| Scheduled triggers | No [UNVERIFIED] | Yes |
| Webhook triggers | No [UNVERIFIED] | Yes |
| Max blocks per flow | [UNVERIFIED] | [UNVERIFIED] |
| Flow run history retention | [UNVERIFIED — likely 7 days free] | [UNVERIFIED — longer] |
| Team sharing | Workspace-scoped (all members) | Same |

> FLAG: Plan gating is the most volatile aspect of Postman Flows — check live pricing page
> before using this as a differentiator argument. As of Aug 2025 Postman was frequently
> adjusting free-tier limits.

### 12. Collaboration & Sharing

- Flows are workspace-scoped: all workspace members can see and run the flow.
- Role-based: edit rights follow workspace member role.
- Fork: a flow can be forked into another workspace (creates a copy).
  [UNVERIFIED — whether flow fork is a full feature or partially supported].
- Version history: Postman does NOT have a full Git-like version history for flows as of
  Aug 2025 — only a single latest saved state. [UNVERIFIED if changed].
- Templates: Postman provides a public flow template gallery (pre-built flows for common
  patterns: GitHub issue creation, Slack notification, data pipeline examples).
  [UNVERIFIED whether template gallery was available on all plans].

### 13. APIPilot Comparison & Differentiator Analysis

**APIPilot naming:** APIPilot uses "Workflows" not "Flows". This is a product naming decision —
internally the concept is the same (chained request execution with branching and variable passing).
Engineers should use "Workflow" in UI copy and "flow" only in internal code identifiers where
already established.

**Key differentiators APIPilot has / can claim:**

| Differentiator | Detail |
|---|---|
| Free and unlimited | APIPilot flow execution is not plan-gated — all users get unlimited runs |
| No "collection prerequisite" | APIPilot flow steps target API Cases directly; no intermediate collection save required |
| Linear + canvas | APIPilot can offer both a simple linear step list (lower learning curve) AND a visual canvas |
| Open-source / self-hostable | Postman Flows is cloud-only; APIPilot can run entirely on-prem |
| JSONPath extraction | Already implemented in engine; Postman requires visual Select block |
| Integrated with APIPilot test cases | Flow steps reuse all APIPilot assertion/validation results |

**Gaps APIPilot has vs Postman Flows:**

| Gap | Severity | Recommendation |
|---|---|---|
| No visual canvas (FE missing) | High — this is the key UX differentiator for Postman | Implement FlowCanvas with React Flow |
| No For/loop block | High — Postman loops over arrays visually | Implement loop step type in engine + FE |
| No Collect/aggregator block | Medium — needed with loop | Implement alongside For |
| No Template (string interpolation) block | Medium | Implement as set_var with template syntax |
| No Evaluate (expression) block | Medium | Implement JS/FQL expression evaluator in engine |
| No webhook trigger | Medium | Implement as new trigger endpoint |
| No scheduled trigger in flow | Low — APIPilot has separate scheduler (schedules feature) | Integrate scheduler with flow triggers |
| No FQL — uses JSONPath instead | Low — JSONPath is more widely known | Keep JSONPath; document in UI |
| No run viewer (live canvas overlay) | Medium — Postman's real-time block status is impressive UX | Implement in FlowRunViewer |
| No canvas minimap | Low | Nice-to-have for large flows |
| No flow template gallery | Low | Post-MVP |

---

## Engine Pattern (existing APIPilot)
```python
# Step loop (engine.py):
for step in ordered_steps:
    resolved = resolve_variables(step.config, context)   # inject local run vars
    auth = await resolve_auth(step.api_id)
    response = await send_request(resolved, auth)        # shared fn from execute_direct
    if step.extract:
        context[step.extract["var"]] = jsonpath(response.json(), step.extract["path"])
    if step.type == "condition":
        branch = eval_condition(step.condition, context)
        # take branch path
    persist FlowStepResult(masked)
```

---

## Gotchas
| # | Thing | Fix |
|---|---|---|
| 1 | execute_direct logic inline in handler | Extract shared `send_request(...)` callable; keep handler thin |
| 2 | Async run needs own DB session | Open `SessionLocal` in engine (like scheduler) |
| 3 | Secrets in FlowRun.context | Mask on persist; raw only in-memory during run |
| 4 | Graph cycles | Validate DAG on save + max-steps guard |
| 5 | React Flow library choice | Use `reactflow` (MIT, 20k+ GitHub stars, handles typed edges, custom nodes) not D3 |
| 6 | FE state complexity | Flow graph JSON must be the single source of truth; React Flow nodes/edges are derived state |
| 7 | For loop in linear engine | Current engine is ordered steps — need branch/loop pointer model for DAG execution |
| 8 | Type mismatch on ports | Validate port types at save time, not only at runtime |
| 9 | Webhook trigger SSRF | Webhook payload could be crafted to inject URLs — validate against SSRF blocklist |
| 10 | Run output polling | Client polls `GET /flow/run/{run_id}` — add step-level SSE for live updates (nice-to-have) |

---

## jsonpath
- Use `jsonpath-ng` library (small dep) or minimal hand-rolled for common paths (`$.field`, `$.nested.field`, `$[0].field`)
- FQL equivalent for APIPilot: JSONPath is sufficient; no need to implement FQL
