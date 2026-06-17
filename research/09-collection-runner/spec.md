# Spec — Collection Runner

STATUS: Research complete
LAST_CHANGED: 2026-06-16
SOURCE: phases/stable + live research 2026-06-16

---

## 1. Goal

Execute a collection (or folder within a collection) sequentially, with optional iteration data files, variable persistence, configurable delays, and pass/fail test result aggregation. The runner is the primary mechanism for automated API testing within APIPilot.

---

## 2. Postman Feature Parity

| Postman Feature | APIPilot Scope |
|---|---|
| Run collection / folder | Yes |
| Iterations (repeat N times) | Yes |
| Delay between requests (ms) | Yes |
| Data file upload (CSV or JSON) | Yes — injects iteration variables |
| Active environment selection | Yes |
| Persist variables after run | Yes — configurable flag |
| Stop on first error (bail) | Yes |
| Custom request run order (drag + setNextRequest) | Yes |
| Skip request via setNextRequest | Yes |
| Real-time results display | Yes — SSE stream |
| Per-request pass/fail with test results | Yes |
| Response body/header viewer in results | Yes |
| Export results as JSON | Yes |
| Run history (persisted) | Yes — BulkTestExecution table |
| Performance mode (load testing) | Deferred |
| Newman CLI compatibility | Out of scope (no CLI product) |
| Scheduled runs | Delegated to 13-monitoring |

---

## 3. Data Models

### 3.1 CollectionRun (alias: BulkTestExecution — verify existing name)

Verify existing model has these fields; add missing ones.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace | |
| collection_id | UUID | FK → Collection | |
| folder_id | UUID | FK → CollectionFolder, nullable | NULL = run entire collection |
| environment_id | UUID | FK → Environment, nullable | |
| triggered_by | UUID | FK → User, nullable | NULL for scheduled/monitor runs |
| status | VARCHAR(20) | NOT NULL | `pending`, `running`, `completed`, `failed`, `cancelled` |
| iterations | INTEGER | NOT NULL, DEFAULT 1 | |
| delay_ms | INTEGER | NOT NULL, DEFAULT 0 | ms between requests |
| bail_on_error | BOOLEAN | NOT NULL, DEFAULT false | Stop on first request error |
| persist_variables | BOOLEAN | NOT NULL, DEFAULT false | Write variable changes back to environment |
| data_file_id | UUID | FK → RunDataFile, nullable | |
| total_requests | INTEGER | nullable | Populated on completion |
| passed_requests | INTEGER | nullable | |
| failed_requests | INTEGER | nullable | |
| total_assertions | INTEGER | nullable | |
| passed_assertions | INTEGER | nullable | |
| failed_assertions | INTEGER | nullable | |
| duration_ms | INTEGER | nullable | Wall-clock run time |
| started_at | TIMESTAMPTZ | nullable | |
| completed_at | TIMESTAMPTZ | nullable | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Index: `(collection_id, created_at DESC)` — run history queries.
Index: `(workspace_id, created_at DESC)` — workspace run history.

### 3.2 CollectionRunResult (alias: TestExecutionResult — verify existing name)

Per-request result within a run.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| run_id | UUID | FK → CollectionRun, NOT NULL | |
| request_id | UUID | FK → CollectionRequest | |
| request_name | VARCHAR(255) | NOT NULL | Denormalized |
| iteration | INTEGER | NOT NULL, DEFAULT 1 | Which iteration this result belongs to |
| status_code | INTEGER | nullable | HTTP status |
| response_time_ms | INTEGER | nullable | |
| response_size_bytes | INTEGER | nullable | |
| response_body | TEXT | nullable | Stored if ≤ 300 KB |
| response_headers | JSONB | nullable | |
| assertions | JSONB | NOT NULL, DEFAULT '[]' | Array of `{name, passed, error_message}` |
| error | TEXT | nullable | Request-level error (network error, timeout) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Index: `(run_id, iteration, created_at)` — results ordered per run.

### 3.3 RunDataFile

Uploaded CSV/JSON data files for iteration data.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workspace_id | UUID | FK → Workspace | |
| name | VARCHAR(255) | NOT NULL | Original filename |
| format | VARCHAR(10) | NOT NULL | `csv` or `json` |
| storage_key | VARCHAR(500) | NOT NULL | Object storage path |
| row_count | INTEGER | NOT NULL | Number of data rows (= iterations) |
| column_names | JSONB | NOT NULL | Array of column/key names |
| uploaded_by | UUID | FK → User | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### 3.4 CollectionRequestOrder

Stores custom request execution order per collection/folder.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| collection_id | UUID | FK → Collection | |
| folder_id | UUID | FK → CollectionFolder, nullable | NULL = collection-level order |
| ordered_request_ids | JSONB | NOT NULL | Array of request UUIDs in execution order |
| updated_at | TIMESTAMPTZ | NOT NULL | |

Unique: `(collection_id, folder_id)`.

---

## 4. Backend Specification

### 4.1 Endpoints

| Method | Path | Min Role | Purpose |
|---|---|---|---|
| POST | `/collections/{id}/runs` | editor | Start collection run; returns run_id immediately |
| GET | `/collections/{id}/runs` | viewer | List run history for collection |
| GET | `/runs/{run_id}` | viewer | Get run summary + config |
| GET | `/runs/{run_id}/results` | viewer | Get all per-request results |
| GET | `/runs/{run_id}/stream` | viewer | SSE stream of real-time results during run |
| DELETE | `/runs/{run_id}` | editor | Cancel running run |
| GET | `/runs/{run_id}/export` | viewer | Export results as JSON |
| POST | `/workspaces/{id}/data-files` | editor | Upload CSV/JSON data file |
| GET | `/workspaces/{id}/data-files` | viewer | List uploaded data files |
| DELETE | `/data-files/{id}` | editor | Delete data file |
| GET | `/collections/{id}/run-order` | viewer | Get custom run order |
| PUT | `/collections/{id}/run-order` | editor | Save custom run order |

### 4.2 POST `/collections/{id}/runs` Request Schema

```json
{
  "folder_id": "uuid|null",
  "environment_id": "uuid|null",
  "iterations": 1,
  "delay_ms": 0,
  "bail_on_error": false,
  "persist_variables": false,
  "data_file_id": "uuid|null",
  "use_custom_order": true
}
```

Response (202 Accepted):
```json
{
  "run_id": "uuid",
  "status": "pending",
  "stream_url": "/runs/{run_id}/stream"
}
```

Run is dispatched to Celery worker immediately. Client connects to SSE stream for real-time updates.

### 4.3 SSE Stream Events (`GET /runs/{run_id}/stream`)

| Event | Payload |
|---|---|
| `run.started` | `{run_id, total_requests, iterations}` |
| `request.started` | `{request_id, request_name, iteration, index}` |
| `request.completed` | Full `CollectionRunResult` object |
| `run.progress` | `{completed, total, passed, failed}` |
| `run.completed` | Full `CollectionRun` summary object |
| `run.cancelled` | `{run_id}` |
| `run.error` | `{run_id, message}` — unrecoverable engine error |

Client disconnects from SSE on `run.completed`, `run.cancelled`, or `run.error`.

### 4.4 Runner Engine (Celery Worker Logic)

```
For each iteration (1..N):
  If data_file_id set:
    Load row[iteration-1] from data file
    Inject as local variables (highest scope for this iteration)
  
  Determine request execution order:
    If use_custom_order and CollectionRequestOrder exists → use that order
    Else → DFS order of collection folders + requests
  
  current_request_index = 0
  While current_request_index < len(requests):
    request = requests[current_request_index]
    
    Emit request.started
    
    Execute pre-request script (if any)
    
    Build and send HTTP request with resolved variables
    
    Execute post-response script (if any) → collect assertions
    
    Store CollectionRunResult
    
    Emit request.completed
    
    If bail_on_error and (request errored or any assertion failed):
      Mark run as failed
      Emit run.cancelled
      Return
    
    next_request = pm.execution.getNextRequest()  # set by script
    If next_request is None:
      current_request_index += 1
    Elif next_request == "__STOP__":
      Break iteration
    Else:
      current_request_index = index_of(next_request)

If persist_variables:
  Write updated variable values back to Environment (local values only)
```

### 4.5 Data File Handling

**CSV format:**
```csv
base_url,user_id,token
https://api.example.com,123,abc
https://staging.example.com,456,def
```
Each row = one iteration. Column headers = variable names.

**JSON format:**
```json
[
  {"base_url": "https://api.example.com", "user_id": 123},
  {"base_url": "https://staging.example.com", "user_id": 456}
]
```
Array of objects. Each object = one iteration. Keys = variable names.

If `data_file_id` is set, `iterations` param is ignored — iteration count = row count in file.

Max file size: 5 MB. Max rows: 1,000.

### 4.6 pm.execution API (script-accessible)

Scripts can call these during post-response:
- `pm.execution.setNextRequest("Request Name")` — jump to named request
- `pm.execution.setNextRequest(null)` — stop current iteration
- `pm.execution.skipRequest()` — alias for setNextRequest to next index

### 4.7 Variable Scope During Run

Priority (highest → lowest) during request execution:
1. Data file variables (current iteration row)
2. Environment variables (active environment)
3. Collection variables
4. Global variables

Variables updated by scripts during run exist only for that run's scope unless `persist_variables = true`, in which case environment local values are updated after run completes.

### 4.8 Results Export Format

`GET /runs/{run_id}/export` returns JSON:
```json
{
  "run": { ...CollectionRun fields... },
  "results": [
    {
      "request_name": "GET /users",
      "iteration": 1,
      "status_code": 200,
      "response_time_ms": 45,
      "assertions": [
        {"name": "Status is 200", "passed": true, "error": null}
      ],
      "error": null
    }
  ]
}
```

### 4.9 Run Limits

| Limit | Value |
|---|---|
| Max iterations | 1,000 |
| Max requests per run (collection size) | 500 |
| Max delay_ms | 60,000 (1 minute) |
| Response body stored if | ≤ 300 KB |
| Max concurrent runs per workspace | 3 |
| Run result retention | 30 days |

### 4.10 Modified Files

| File | Change |
|---|---|
| `models/collection_run.py` | Verify/add missing columns; add RunDataFile, CollectionRequestOrder models |
| `routers/collection_runs.py` | All endpoints above |
| `services/runner_engine.py` | Core runner logic (Celery task) |
| `services/data_file_service.py` | CSV/JSON parse + validation |
| `services/sse_service.py` | SSE event emission during run |
| `alembic/versions/xxx_runner.py` | Migration: missing columns + new tables |

---

## 5. Frontend Specification

### 5.1 Library Decisions

| Decision | Choice | Reason |
|---|---|---|
| Real-time results | SSE (`EventSource`) | Already used in 19-sse feature; runner emits events per request |
| Progress display | Custom progress bar | Simple; no library needed |
| Results table | `@tanstack/react-table` | Sortable/filterable results; large result sets |
| Charts (pass/fail summary) | `recharts` | Project standard |
| Data file upload | `react-dropzone` | Drag-and-drop + click; already used elsewhere |

### 5.2 Component Inventory

| Component | Location | Purpose |
|---|---|---|
| `CollectionRunnerPanel` | `components/runner/` | Main runner UI: config form + run button |
| `RunConfigForm` | `components/runner/` | All run options: env select, iterations, delay, data file, flags |
| `DataFileUploader` | `components/runner/` | Upload or select existing data file |
| `RunRequestOrderEditor` | `components/runner/` | Drag-and-drop request order (DnD kit) |
| `RunProgressBar` | `components/runner/` | Live progress during run |
| `RunResultsSummary` | `components/runner/` | Pass/fail counts, duration, iteration count |
| `RunResultsTable` | `components/runner/` | Per-request results: status, time, assertions |
| `RunResultRow` | `components/runner/` | Expandable row: response body/headers viewer |
| `AssertionResultList` | `components/runner/` | List of assertion results per request |
| `RunHistoryList` | `components/runner/` | Past runs for collection; click to reload results |
| `ExportRunButton` | `components/runner/` | Download results as JSON |

### 5.3 Per-Component TypeScript Interfaces

```typescript
interface RunConfig {
  folder_id: string | null;
  environment_id: string | null;
  iterations: number;
  delay_ms: number;
  bail_on_error: boolean;
  persist_variables: boolean;
  data_file_id: string | null;
  use_custom_order: boolean;
}

interface CollectionRun {
  id: string;
  collection_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  iterations: number;
  total_requests: number | null;
  passed_requests: number | null;
  failed_requests: number | null;
  total_assertions: number | null;
  passed_assertions: number | null;
  failed_assertions: number | null;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface CollectionRunResult {
  id: string;
  run_id: string;
  request_name: string;
  iteration: number;
  status_code: number | null;
  response_time_ms: number | null;
  response_body: string | null;
  response_headers: Record<string, string> | null;
  assertions: AssertionResult[];
  error: string | null;
}

interface AssertionResult {
  name: string;
  passed: boolean;
  error_message: string | null;
}

interface RunDataFile {
  id: string;
  name: string;
  format: 'csv' | 'json';
  row_count: number;
  column_names: string[];
}

interface RunConfigFormProps {
  collectionId: string;
  onRun: (config: RunConfig) => void;
}

interface RunResultsTableProps {
  results: CollectionRunResult[];
  loading: boolean;
  activeIteration: number;
  onIterationChange: (n: number) => void;
}
```

### 5.4 API Calls Table

| Action | Method | URL | When Triggered |
|---|---|---|---|
| Start run | POST | `/collections/{id}/runs` | RunConfigForm submit |
| Connect SSE | GET (SSE) | `/runs/{run_id}/stream` | After run started |
| Load run summary | GET | `/runs/{run_id}` | RunResultsSummary mount |
| Load results | GET | `/runs/{run_id}/results` | RunResultsTable mount |
| Load run history | GET | `/collections/{id}/runs` | RunHistoryList mount |
| Cancel run | DELETE | `/runs/{run_id}` | Stop button click |
| Export results | GET | `/runs/{run_id}/export` | ExportRunButton click |
| List data files | GET | `/workspaces/{id}/data-files` | DataFileUploader open |
| Upload data file | POST | `/workspaces/{id}/data-files` | DataFileUploader drop |
| Load run order | GET | `/collections/{id}/run-order` | RunRequestOrderEditor mount |
| Save run order | PUT | `/collections/{id}/run-order` | RunRequestOrderEditor save |

### 5.5 State Shape (Zustand)

```typescript
interface RunnerStore {
  // Config
  runConfig: RunConfig;
  setRunConfig: (config: Partial<RunConfig>) => void;

  // Active run
  activeRun: CollectionRun | null;
  activeRunResults: CollectionRunResult[];
  runStreaming: boolean;

  // History
  runHistory: CollectionRun[];
  historyLoading: boolean;

  // Data files
  dataFiles: RunDataFile[];

  // Custom order
  customRequestOrder: string[];  // array of request IDs

  // Actions
  startRun: (collectionId: string) => Promise<void>;
  cancelRun: (runId: string) => Promise<void>;
  loadRunHistory: (collectionId: string) => Promise<void>;
  loadRunResults: (runId: string) => Promise<void>;
  uploadDataFile: (file: File) => Promise<RunDataFile>;
  saveRunOrder: (collectionId: string, order: string[]) => Promise<void>;
}
```

### 5.6 UX Behavior

- **Run panel** opens as a side panel or bottom drawer within the collection view.
- **Live results**: SSE events append rows to RunResultsTable in real time. Pass = green row, fail = red row.
- **Iteration tabs**: if `iterations > 1`, show iteration selector to filter results table by iteration.
- **Stop button** visible during run; calls `DELETE /runs/{run_id}`; emits `run.cancelled` from server.
- **Request order editor**: only visible when "Use custom order" toggle is on. Drag-and-drop list using `@dnd-kit/sortable`.
- **Data file preview**: after upload, show column names + first 3 rows as a table preview.
- **History**: clicking a past run loads its results in the results panel (no new SSE connection; static load).

---

## 6. Decision Table

| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Run execution method | Celery worker + SSE | Async execution; client gets live updates |
| 2 | Real-time delivery | SSE (`EventSource`) | Unidirectional server→client; simpler than WebSocket for this case |
| 3 | Data file variable scope | Highest priority in scope chain | Data file overrides environment — enables true parameterized testing |
| 4 | iterations when data file set | Ignored; use row count | Data file determines iteration count — prevents config mismatch |
| 5 | persist_variables scope | Local env values only | Matches Postman; shared values not overwritten by run |
| 6 | Max response body stored | 300 KB | Matches Postman; prevents DB bloat from large responses |
| 7 | Max iterations | 1,000 | Prevents runaway jobs; covers load-like data file scenarios |
| 8 | setNextRequest mechanism | Stored per-iteration in worker context | Engine reads it after each post-response script |
| 9 | Run order storage | Separate CollectionRequestOrder table | Doesn't mutate collection structure |
| 10 | Performance/load test mode | Deferred | Different engine needed (concurrent requests); out of scope v1 |

---

## 7. Edge Cases

| # | Trap | Fix |
|---|---|---|
| 1 | `setNextRequest` targets non-existent request name | Skip (log warning in run); continue to next request |
| 2 | `setNextRequest` creates infinite loop | Detect: if same request visited >100 times in one iteration → bail with error |
| 3 | Data file has fewer rows than `iterations` param | iterations = row count (row count wins) |
| 4 | Data file CSV has inconsistent columns per row | Pad missing values with empty string; log warning in run |
| 5 | Run cancelled mid-iteration | Mark partial results as-is; mark run `cancelled` |
| 6 | Celery worker dies mid-run | Heartbeat check: if `running` run has no SSE event for 60s → mark `failed` |
| 7 | Environment deleted between run config and run start | Start run with no environment; log warning |
| 8 | 3 concurrent runs reached | 429 response: "Max 3 concurrent runs per workspace" |
| 9 | SSE client disconnects mid-run | Run continues in worker; client can reconnect and poll `GET /runs/{id}/results` |
| 10 | Response body > 300 KB | Store null; `response_body = null` in result; UI shows "Response too large to store" |
| 11 | bail_on_error on network error vs test assertion failure | Both trigger bail; any non-2xx-with-passing-tests counts as error |

---

## 8. Deferred Items

| Item | Reason |
|---|---|
| Performance / load test mode (concurrent VUs) | Needs different execution engine |
| Newman CLI compatibility | No CLI product |
| Browser-based local runner (no server) | Server-side runner sufficient for v1 |
| Run comparison / regression diff | Separate feature (21-regression-diff) |
| Scheduled runs | Handled by 13-monitoring |
