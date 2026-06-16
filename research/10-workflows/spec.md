# Spec — Workflows / Flows

STATUS: in-progress (backend done; FE spec expanded — canvas lib decided)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_5_flows/spec.md + Postman Flows research (Aug 2025 training data)

---

## Goal
Visual flow builder: chain requests, extract values (jsonpath) into run context, feed into
next request, branch on conditions, loop over arrays, add delays. Differentiator X7.
APIPilot calls this feature "Workflows" in UI copy; "flow" in code identifiers.

---

## Backend (shipped)

### Models (in models.py)
| Model | Key Fields |
|---|---|
| Flow | id, workspace_id(FK), name, graph(JSON), enabled |
| FlowStep | id, flow_id(FK), step_order, type, api_id(FK null), config(JSON), extract(JSON), condition(JSON) |
| FlowRun | id, flow_id(FK), status, context(JSON), started_at, finished_at |
| FlowStepResult | id, flow_run_id(FK), step_id, success, request(JSON), response(JSON masked), duration_ms |

### Endpoints (all in routers/flow/)
| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST/GET/PUT/DELETE | `/flow[/{id}]` | editor/viewer | CRUD |
| POST | `/flow/{id}/run` | editor | Execute async → run_id |
| GET | `/flow/{id}/runs` | viewer | Run history list |
| GET | `/flow/run/{run_id}` | viewer | Run detail + step results |

### Step types (engine — current)
| Type | Behaviour |
|---|---|
| `request` | Send HTTP request via shared `send_request()` |
| `condition` | Evaluate expression against context; take branch |
| `delay` | Wait configured ms then continue |
| `set_var` | Write value into run context (supports template syntax) |

### Step types (engine — to be added)
| Type | Behaviour |
|---|---|
| `loop` | Iterate over a context list variable; execute sub-steps per item |
| `collect` | Aggregate loop iteration values into a list var in context |
| `evaluate` | Run a JSONPath/expression against context; store result |
| `log` | Write debug message to FlowStepResult without stopping |

### Prerequisite (not yet done)
- Extract `send_request()` callable from `execute_direct.py` — engine calls it per step.
  This is T2 on the current task board and must be done before any engine extension.

---

## Frontend (missing — next sprint)

### Canvas Library Decision: React Flow (reactflow.dev)

**Chosen library:** `reactflow` (package: `@xyflow/react` as of v12; or `reactflow` for v11)

**Justification:**
| Criterion | React Flow | D3 (force-graph) | Cytoscape.js |
|---|---|---|---|
| React-native | Yes — nodes are React components | No — imperative DOM manipulation | No — separate canvas engine |
| Custom node types | First-class (per-type React component) | Complex to add | Supported but verbose |
| Typed edges / ports | Built-in handle system | Not built-in | Not built-in |
| License | MIT | BSD-3 | MIT |
| Bundle size | ~130KB gzipped | ~80KB | ~200KB |
| Active maintenance | Yes (Xyflow team, 20k+ GitHub stars) | Yes (D3 team) | Lower activity |
| Flow-specific features | Mini-map, controls, background grid, connection validation | None | Some |
| Learning curve | Low (React patterns) | High (D3 imperative) | Medium |

**Version pin:** Use `@xyflow/react` ^12 (if React 18+) or `reactflow` ^11 for React 17.
Check existing frontend React version before installing.

**React Flow core concepts used:**
- `nodes` array — each node has `id`, `type`, `position`, `data` (block config).
- `edges` array — each edge has `id`, `source`, `sourceHandle`, `target`, `targetHandle`.
- `onNodesChange` / `onEdgesChange` — controlled state callbacks.
- Custom node type registered via `nodeTypes` prop — one per block type.
- `<Handle>` component on each custom node — defines typed connection ports.
- `isValidConnection` callback — type-check connections before allowing wire.
- `<MiniMap>` component — optional, for large flows.
- `<Controls>` component — zoom in/out/fit buttons.
- `<Background>` component — grid/dots backdrop.

---

### Component Breakdown

#### FlowCanvas
**Purpose:** Root canvas container. Owns all React Flow state. Entry point for the flow builder page.

**Props:**
```tsx
interface FlowCanvasProps {
  flowId: string;
  initialFlow: FlowDefinition;      // loaded from GET /flow/{id}
  readOnly?: boolean;               // viewer-role users: no drag/edit
  onSave: (flow: FlowDefinition) => Promise<void>;
  onRun: (flowId: string) => Promise<{ run_id: string }>;
}
```

**Responsibilities:**
- Initialise `nodes` + `edges` from `FlowDefinition.graph`.
- Register all `nodeTypes` (one per block type: `send_request`, `if`, `for`, `select`,
  `collect`, `output`, `log`, `template`, `delay`, `set_var`, `evaluate`).
- Validate connection type compatibility via `isValidConnection`.
- Serialise `nodes` + `edges` back to `FlowDefinition.graph` on save.
- Toolbar: Save button, Run button (→ FlowRunDrawer), Trigger config button, Flow Variables button.
- Keyboard shortcuts: Ctrl+S to save, Del to delete selected node/edge.

**State:**
```tsx
const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
// selectedNodeId drives FlowBlockConfigPanel content
```

---

#### FlowPalette
**Purpose:** Left sidebar listing all available block types. Drag-and-drop source.

**Props:**
```tsx
interface FlowPaletteProps {
  onAddBlock: (type: BlockType, position: XYPosition) => void;
}
```

**Block categories in palette:**
| Category | Colour | Block types |
|---|---|---|
| Send | Blue | Send Request |
| Control | Orange | If, For, Collect |
| Data | Grey | Select, Set Variable, Template, Evaluate |
| Utility | Purple | Delay, Log |
| Output | Green | Output |

**UX:** Each palette item shows block icon + name. Drag onto canvas → `onDrop` → `addNode`.
Double-click canvas background → shows quick-add picker with palette items (nice-to-have).

---

#### BlockNode (per type — custom React Flow nodes)

All block nodes share a base layout:
```
┌─────────────────────────────┐
│  [icon] Block Type Name     │  ← header, colour-coded by category
│─────────────────────────────│
│  [input handles left side]  │
│  [config summary preview]   │  ← truncated config visible inline
│  [output handles right side]│
└─────────────────────────────┘
```

Handles (ports) appear as small circles on the node border. Each handle has a `type`
attribute (`source` or `target`) and an `id` matching the port name (e.g. `"body"`, `"status"`).

**Registered node types:**

| nodeType key | Block | Input handles | Output handles |
|---|---|---|---|
| `send_request` | Send Request | `variable_overrides` (object) | `body` (object), `headers` (object), `status` (number), `success` (boolean) |
| `if_block` | If | `value` (any) | `true` (any), `false` (any) |
| `for_block` | For | `list` (array) | `item` (any), `index` (number), `done` (boolean) |
| `select_block` | Select | `data` (object) | `value` (any) |
| `collect_block` | Collect | `value` (any), `trigger` (boolean — connects to For's `done`) | `list` (array) |
| `output_block` | Output | `value` (any) | — |
| `log_block` | Log | `value` (any) | `value` (any passthrough) |
| `template_block` | Template | dynamic (one per `{{var}}` reference) | `output` (string) |
| `delay_block` | Delay | `value` (any passthrough) | `value` (any passthrough) |
| `set_var_block` | Set Variable | `value` (any) | — |
| `evaluate_block` | Evaluate | `data` (any) | `result` (any) |

**Port type colour coding (edge colours):**
| Type | Colour |
|---|---|
| string | Green |
| number | Blue |
| boolean | Orange |
| object | Purple |
| array | Yellow |
| any | Grey |

**Connection validation rule:**
- `any` connects to any type.
- Typed ports only connect to matching type or `any`.
- Self-loop edges rejected.
- Edges from `source`→`source` or `target`→`target` rejected.

---

#### ConnectionLine (custom edge)

React Flow's default edge rendered as a bezier curve. Customise:
- Stroke colour = port type colour (from source handle type).
- Animated stroke (dashed animation) when flow is running.
- Label on hover: shows source port name → target port name.
- Animated delete on click (edge highlights, press Del to remove).

No special component needed — configure via `edgeOptions` and `defaultEdgeOptions` on
the `<ReactFlow>` component.

---

#### FlowBlockConfigPanel
**Purpose:** Right-side docked panel. Shows configuration form for the currently selected block.
Hides when no block is selected.

**Props:**
```tsx
interface FlowBlockConfigPanelProps {
  nodeId: string | null;
  nodeType: BlockType | null;
  nodeData: BlockData;
  onUpdate: (nodeId: string, newData: BlockData) => void;
}
```

**Per-block config forms:**

| Block | Config fields |
|---|---|
| Send Request | Collection picker (searchable dropdown from `GET /collection`), Request picker (filtered by collection), Environment picker |
| If | Expression input (FQL/JSONPath text field with syntax highlight), preview of TRUE/FALSE routing |
| For | List variable reference picker (dropdown of context vars typed as array) |
| Select | Path expression input (JSONPath text, e.g. `$.body.users[0].id`), output variable name |
| Collect | Auto-configured when wired from For; optional output variable name |
| Output | Label text input, optional description |
| Log | Label text input |
| Template | Template text area with `{{var}}` syntax; input handles auto-added per detected `{{var}}` |
| Delay | Duration input (ms), numeric spinner |
| Set Variable | Variable name text input, value source (literal text or JSONPath expression) |
| Evaluate | Expression text area (JSONPath expression against `data` input) |

---

#### FlowVariablesPanel
**Purpose:** Modal/drawer for defining flow-level variables before run.

**Props:**
```tsx
interface FlowVariablesPanelProps {
  variables: FlowVariable[];
  onChange: (vars: FlowVariable[]) => void;
}

interface FlowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  default_value: string | number | boolean | null;
}
```

**UX:** Table of variables. Add/remove rows. Inline edit name, type dropdown, default value.
Accessible from toolbar "Variables" button. Variables appear as source nodes at top of canvas
(optional visual) or are injected into run context before first block executes.

---

#### FlowTriggerConfig
**Purpose:** Drawer/modal for configuring the flow trigger type.

**Props:**
```tsx
interface FlowTriggerConfigProps {
  trigger: FlowTrigger;
  flowId: string;
  onChange: (trigger: FlowTrigger) => void;
}

type FlowTrigger =
  | { type: 'manual' }
  | { type: 'scheduled'; cron: string; timezone: string }
  | { type: 'webhook'; webhook_url: string /* read-only, generated by backend */ };
```

**UX:**
- Trigger type selector (radio buttons or segmented control): Manual / Scheduled / Webhook.
- Scheduled: shows cron builder UI (presets: every hour, every day, every week) + custom cron input.
- Webhook: shows generated webhook URL (read-only) + copy button + "Regenerate URL" button.
- Manual: no config, just a note "Run manually from the canvas toolbar."

**Backend needs:**
- `POST /flow/{id}/trigger` — saves trigger config (type + cron or generates webhook secret).
- `GET /flow/{id}/trigger` — returns current trigger config + webhook URL.
- `POST /flow/webhook/{webhook_token}` — public endpoint (no auth) that fires the flow.
  Must: validate webhook token, check SSRF blocklist on payload URL fields, enqueue run.

---

#### FlowRunHistory
**Purpose:** Panel/page listing past runs for a flow.

**Props:**
```tsx
interface FlowRunHistoryProps {
  flowId: string;
}
```

**Data from:** `GET /flow/{id}/runs`

**Columns:**
| Column | Source |
|---|---|
| Run # | `FlowRun.id` (or sequential counter) |
| Triggered by | `FlowRun.trigger_type` (manual / scheduled / webhook) |
| Status | `FlowRun.status` (running / passed / failed) — colour-coded badge |
| Started at | `FlowRun.started_at` (localised to user timezone) |
| Duration | Derived: `finished_at - started_at` in ms |
| Actions | "View" button → opens FlowRunViewer |

**UX:** Table with pagination (GET /flow/{id}/runs?limit=20&offset=0). Status badge:
running=blue/spinning, passed=green, failed=red.

---

#### FlowRunViewer
**Purpose:** Detailed view of a single flow run — per-block execution trace.

**Props:**
```tsx
interface FlowRunViewerProps {
  runId: string;
}
```

**Data from:** `GET /flow/run/{run_id}`

**Layout:** Two-column.
- Left: Canvas in read-only mode with block status overlaid (green border = passed,
  red border = failed, grey border = skipped, pulsing blue = running [if live polling]).
- Right: Accordion list of executed blocks in order.
  Each accordion item:
  ```
  [status icon] [block type icon] Block Name         [duration ms] [chevron]
  ─────────────────────────────────────────────────────────────────────────
  Inputs:   { "variable_overrides": {...} }
  Outputs:  { "body": {...}, "status": 200, "success": true }
  Error:    [shown only if failed]
  ```

**Live polling:** `GET /flow/run/{run_id}` polled every 2s while `status == "running"`.
  Stop polling when status is terminal (passed/failed). [Consider SSE as upgrade path.]

**Output tab:** Renders all Output block values (one card per Output block in execution order).
**Logs tab:** Renders all Log block messages in chronological order.

---

### State Shape (Flow Definition JSON)

The `Flow.graph` JSON column stores the canonical flow definition. React Flow state is
derived from this — the graph is the source of truth, not the React Flow internal state.

```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "send_request",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "Login",
        "collection_id": "col_abc",
        "request_id": "req_xyz",
        "environment_id": "env_123"
      }
    },
    {
      "id": "node_2",
      "type": "select_block",
      "position": { "x": 400, "y": 200 },
      "data": {
        "label": "Extract token",
        "path": "$.body.token",
        "output_var": "auth_token"
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "sourceHandle": "body",
      "target": "node_2",
      "targetHandle": "data"
    }
  ],
  "variables": [
    { "name": "base_url", "type": "string", "default_value": "https://api.example.com" }
  ],
  "trigger": { "type": "manual" }
}
```

**Notes:**
- `Flow.graph` is indexed as JSONB (Postgres) for future querying.
- Backend validates DAG (no cycles) on every save before persisting.
- Backend rejects nodes with duplicate IDs.
- Backend rejects edges referencing non-existent node IDs.

---

### API Calls APIPilot Backend Needs (FE → BE)

| Operation | Method | Path | Notes |
|---|---|---|---|
| Load flow | GET | `/flow/{id}` | Returns full flow including `graph` JSON |
| Save flow | PUT | `/flow/{id}` | Body: updated `graph` JSON; backend validates DAG |
| Run flow | POST | `/flow/{id}/run` | Returns `{ run_id }` |
| Run history | GET | `/flow/{id}/runs?limit=20&offset=0` | Paginated |
| Run detail | GET | `/flow/run/{run_id}` | Full step results |
| List collections | GET | `/collection` | For Send Request block config picker |
| List requests | GET | `/collection/{id}/requests` | For Send Request block config picker |
| List environments | GET | `/environment` | For Send Request block env picker |
| Get trigger config | GET | `/flow/{id}/trigger` | |
| Save trigger config | POST | `/flow/{id}/trigger` | |
| Webhook fire | POST | `/flow/webhook/{token}` | Public — no auth header |

---

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Engine execution | In-process async, own DB session | Reuse FastAPI async; queue later if scale (O2) |
| 2 | Reuse send path | Extract shared fn from execute_direct | DRY, auth/var/secret consistent |
| 3 | Extraction | jsonpath into FlowRun.context (local vars) | Feeds 04-variables local scope |
| 4 | Run async | Return run_id, poll for progress | Don't block request lifecycle |
| 5 | Secrets in results | Mask before persist | vault.py rule |
| 6 | Canvas library | React Flow (`@xyflow/react`) | MIT, React-native, typed handles, mini-map, best maintained |
| 7 | Graph JSON format | Aligned with React Flow nodes/edges schema | Avoid double-conversion; RF state directly serialises to DB |
| 8 | Port type system | Enforced in FE `isValidConnection`; validated BE on save | Catch type errors before run; not just runtime |
| 9 | Loop support | Add `loop` + `collect` step types to engine | Postman For+Collect parity; needed for real use cases |
| 10 | Trigger types | Manual (now) + Scheduled (integrates with scheduler feature) + Webhook (new endpoint) | Manual is MVP; others as follow-on |
| 11 | Run polling | Poll GET /flow/run/{run_id} every 2s | Simple; SSE upgrade path for live block status |
| 12 | APIPilot UI naming | "Workflows" in all user-facing copy | "flow" retained in code; avoids Postman trademark confusion |

---

## Edge Cases
| # | Trap | Fix |
|---|---|---|
| 1 | Infinite loop in graph | Max-steps guard + cycle detect on DAG save |
| 2 | jsonpath no match | Mark unresolved, surface in result |
| 3 | Long flow blocks worker | Async + step timeouts |
| 4 | Concurrent runs same flow | Each FlowRun owns independent context |
| 5 | For loop with empty list | Skip loop body, continue from For's `done` port |
| 6 | Template with missing variable | Render `{{var}}` unresolved; flag in step result |
| 7 | Webhook trigger SSRF | Validate payload URLs against SSRF blocklist before send_request |
| 8 | React Flow edge type mismatch | `isValidConnection` blocks wire; show tooltip with reason |
| 9 | Large flow (50+ nodes) | MiniMap required; auto-layout available; test render perf |
| 10 | Flow save with stale graph | PUT uses `updated_at` optimistic lock — 409 if conflict |
| 11 | Collection deleted mid-flow | Send Request block shows error state; run marks step failed |
| 12 | Circular DAG slips through FE | Backend re-validates DAG; returns 400 with cycle detail |
