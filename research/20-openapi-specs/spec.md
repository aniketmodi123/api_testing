# Spec — OpenAPI & Schema Management + Contract Testing + Regression Diff

STATUS: in-progress (backend done; FE missing)
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_6_openapi_specs/spec.md + phases/phase_7_contract_testing/spec.md

## Goal

Bidirectional OpenAPI import/export, cURL round-trip, live contract testing, run-to-run regression diff. Differentiators X4 + X6.

## Backend (shipped)

### Endpoints

| Method | Path                       | Min Role | Purpose                                    |
| ------ | -------------------------- | -------- | ------------------------------------------ |
| POST   | `/spec/import`             | editor   | Parse OpenAPI/Swagger → nodes+apis+cases   |
| GET    | `/spec?workspace_id=`      | viewer   | List specs                                 |
| GET    | `/spec/{id}`               | viewer   | Detail                                     |
| DELETE | `/spec/{id}`               | editor   | Delete                                     |
| GET    | `/spec/{id}/export`        | viewer   | Export collection → OpenAPI 3.0 JSON       |
| POST   | `/curl/to-request`         | viewer   | Parse cURL → {method, url, headers, body}  |
| POST   | `/request/to-curl`         | viewer   | {method, url, headers, body} → cURL string |
| POST   | `/spec/{id}/contract-test` | editor   | Live responses vs schema → violations      |
| GET    | `/run/{exec_id}/diff`      | viewer   | Diff two BulkTestExecution result sets     |

## Frontend (missing)

---

## 4. Frontend Specification

The frontend for OpenAPI specification management will be a major feature area, replicating the core functionality of Postman's "Spec Hub".

### 4.1. Library Decisions

- **Schema Editor**: `Monaco Editor` (via `@monaco-editor/react` and `monaco-yaml`).
  - **Justification**: This is the same editor used by VS Code and Postman itself, providing a familiar, feature-rich experience. The `monaco-yaml` extension provides out-of-the-box validation against the OpenAPI schema, which is critical for linting and error-checking.
- **Diff Viewer**: `jsondiffpatch`.
  - **Justification**: This library can produce and render structural, semantic diffs for JSON objects, which is superior to a simple text-based line diff. It highlights added, removed, and modified fields in a nested structure, which is essential for both spec-to-spec diffs and response regression diffs. For non-JSON content, we will fall back to `diff` (jsdiff).

### 4.2. Component Breakdown

| Component                  | Props                                   | Renders                                                                                                                                                       | API Calls & State                                                                                                                                                                     |
| :------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SpecListView`             | `{ workspaceId }`                       | A table of all `ApiSpec` documents in the workspace. Each row shows name, version, format, and actions (Edit, Diff, Test, Delete).                            | `GET /workspace/{ws_id}/specs`. Consumes `specs` from Redux store.                                                                                                                    |
| `SpecImportModal`          | `{ workspaceId, onComplete }`           | A multi-tab modal for importing specs via File, URL, or Raw Text. Includes a preview of the collection/requests that will be generated.                       | `POST /workspace/{ws_id}/specs/import`. Uses local component state for form management. Dispatches action to refresh spec list on success.                                            |
| `SpecEditorLayout`         | `{ specId }`                            | A two-pane layout. Left pane is a file tree (for multi-file specs). Main pane is the `SpecEditor`. Right sidebar shows `SpecIssuesPanel` and `SpecInfoPanel`. | `GET /spec/{spec_id}` to load. `PUT /spec/{spec_id}` to save.                                                                                                                         |
| `SpecEditor`               | `{ content, format, onChange, issues }` | The Monaco Editor instance, configured for YAML/JSON. Displays inline validation/linting markers based on the `issues` prop.                                  | Manages editor content in local state. `onChange` bubbles content up to parent.                                                                                                       |
| `SpecIssuesPanel`          | `{ issues }`                            | A list of syntax and governance rule violations found in the current spec. Clicking an issue should navigate the editor to the relevant line.                 | Consumes `issues` from parent component state.                                                                                                                                        |
| `SpecDiffViewer`           | `{ baseSpecId, compareSpecId }`         | A view that uses `jsondiffpatch` to render a structural comparison between two `ApiSpec` versions.                                                            | `GET /spec/{base_id}` and `GET /spec/{compare_id}`. Performs diff on the client side.                                                                                                 |
| `ContractTestReport`       | `{ specId, runId }`                     | Displays the results of a contract test run, showing which endpoints passed/failed validation against the spec's schemas.                                     | `GET /spec/{spec_id}/contract-test/{run_id}`.                                                                                                                                         |
| `ContinuousValidationIcon` | `{ nodeId, nodeType }`                  | An icon (e.g., an orange dot) displayed next to collections/requests in the main sidebar tree view.                                                           | This is a complex component. It requires a background process/service to continuously compare collection items to the linked spec and update a `validationStatus` in the Redux store. |

### 4.3. State Shape (Redux/Store)

```javascript
{
  "specs": {
    "byId": {
      "spec-abc-123": {
        "id": "spec-abc-123",
        "name": "Petstore API",
        "version": "1.0.2",
        "format": "openapi",
        "raw": "...",
        "parsed": { "...": "..." },
        "issues": [
          { "line": 5, "message": "Missing description for path /pets." }
        ],
        "versions": ["tag-v1.0.1", "tag-v1.0.2"] // New requirement: version tags
      }
    },
    "allIds": ["spec-abc-123"],
    "loading": false,
    "error": null
  },
  // Validation status for the "orange dot" feature
  "validationStatus": {
    "node-xyz-456": "invalid" // Key is collection/request/folder ID
  }
}
```

### 4.4. UX Decisions from Research

- **Single Source of Truth**: The UI must treat the API Specification as the primary artifact. Collections generated from it are secondary and should be clearly marked as "managed by spec".
- **Continuous Validation is Key**: The "orange dot" feature from Postman is a high-impact UX pattern. While complex to implement, it provides immediate feedback on API drift and should be a priority. This requires backend support to run validations in the background.
- **Import Flow**: The import modal must be clear about what will be created (a spec object AND a collection). It should also allow choosing the server URL to use for the generated collection's `baseUrl` variable.
- **Error Reporting**: Governance and syntax issues should be displayed in a dedicated, docked panel next to the editor, not in transient popups. Each issue must be clickable, navigating the user directly to the source line.

## Decision Table

| #   | Decision             | Choice                           | Reason                                      |
| --- | -------------------- | -------------------------------- | ------------------------------------------- |
| 1   | Parser               | pyyaml + hand-rolled path walker | No heavy dep; OpenAPI structure predictable |
| 2   | Import strategy      | Extend bulk_import atom          | DRY — reuse proven dedup + temp_id logic    |
| 3   | Export format        | OpenAPI 3.0.3 JSON               | Most compat with Postman/Insomnia           |
| 4   | cURL parser          | Regex + shlex.split              | stdlib only, handles quoted strings         |
| 5   | Contract persistence | Ephemeral at MVP                 | Don't add table until UX validated          |
| 6   | Diff algorithm       | Recursive dict walk              | Simple, no dep                              |
| 7   | Contract concurrency | semaphore=5                      | Avoid flooding target                       |

## Edge Cases

| #   | Trap                                 | Fix                             |
| --- | ------------------------------------ | ------------------------------- |
| 1   | External `$ref` URLs                 | Block — any http $ref → 400     |
| 2   | Circular `$ref`                      | Max-depth 10 + seen-refs set    |
| 3   | Swagger 2.0 `basePath`               | Normalize to 3.0 shape on parse |
| 4   | Contract: Api not found in workspace | Skip + add to `unmatched` list  |
| 5   | Contract: target endpoint down       | Mark `unreachable`; continue    |
| 6   | Diff: non-JSON body                  | Diff as raw string equality     |
