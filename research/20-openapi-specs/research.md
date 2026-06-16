# Research — OpenAPI & Schema Management + Contract Testing + Regression Diff

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_6_openapi_specs/research.md + phases/phase_7_contract_testing/research.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/spec/import_spec.py` | `POST /spec/import` |
| `backend/src/routers/spec/crud.py` | GET list/detail/delete + export |
| `backend/src/routers/spec/curl.py` | cURL ↔ request |
| `backend/src/routers/spec/contract.py` | `POST /spec/{id}/contract-test` |
| `backend/src/routers/runner/diff.py` | `GET /run/{exec_id}/diff` |
| `backend/src/models.py` | `ApiSpec` model |
| `backend/src/routers/node/bulk_import.py` | Reused for spec import (node/api/case creation atom) |
| `backend/src/common_querys.py` | `get_workspace_tree_response` — for export |
| `backend/src/ssrf.py` | SSRF guard for external $ref URLs |
| `backend/src/routers/runner/validator.py` | jsonschema validation reused in contract test |

## ApiSpec Model
```
ApiSpec
  id
  workspace_id    FK → workspaces CASCADE
  name            varchar(255)
  version         varchar(50)
  format          varchar(20)  "openapi" | "swagger"
  raw             JSON  (original)
  parsed          JSON  (normalized to 3.0 shape)
  created_at      datetime
```

## OpenAPI → APIPilot Model Mapping
```
/users/{id}:
  get:
    summary: Get user
    parameters: [{in: query, name: x}]
    requestBody: {content: {application/json: {schema: ...}}}

→ Node(type="file", name="GET /users/{id}")
   Api(method="GET", endpoint="/users/{id}", name="Get user")
   ApiCase(name="default", params={x: ""}, body={})
```

## cURL Parse Pattern
```python
# shlex.split handles quoted strings
# -X / --request → method (default GET unless body → POST)
# -H "Key: Val" → headers dict
# -d '{body}' / --data / --data-raw / --data-binary → body string
# -u user:pass → Authorization: Basic base64
# --compressed → ignore
```

## Contract Test Algorithm
```python
# For each path in ApiSpec.parsed (up to limit=50):
#   find matching Api in workspace by (method, endpoint)
#   send live request via send_request()
#   validate response vs operation's response schema (jsonschema.Draft7Validator)
#   collect violations: [{path, message}]
```

## Regression Diff Algorithm
```python
# Align BulkTestResult rows by case_id across two executions
# For each matched pair:
#   walk response.body recursively — added/removed/changed fields
#   diff status_code, success flag
# Unmatched → "removed" (in base not compare) or "added" (in compare not base)
```

## Gotchas
| # | Thing | Fix |
|---|---|---|
| 1 | External `$ref` URLs | Block at parse — any $ref starting http → 400 |
| 2 | Circular `$ref` | Max-depth guard (10 levels) + seen-refs set |
| 3 | 1000+ path spec | Cap at 500 paths per import; 400 if exceeded |
| 4 | Swagger 2.0 `basePath` | Detect by `swagger: "2.0"` key; convert to 3.0 shape internally |
| 5 | Contract test: `send_request` is async | asyncio.gather with semaphore=5 |
| 6 | Diff: response.body not JSON | Diff as raw string equality |

---

## Live Postman Research (June 2026)
SOURCES:
- https://learning.postman.com/docs/design-apis/specifications/import-a-specification
- https://learning.postman.com/docs/design-apis/specifications/overview
- https://learning.postman.com/docs/design-apis/collections/generate-specifications
- https://blog.postman.com/request-and-response-validation-in-postman/
- https://blog.postman.com/november-2025-product-updates/
- https://blog.postman.com/december-2025-product-updates/
- https://blog.postman.com/new-in-the-postman-api-v1-39-api-catalog-and-spec-hub-endpoints/
- https://blog.postman.com/api-contract-testing-4-things-to-validate/
- https://releasebot.io/updates/postman

### Postman Spec Hub — Current State (2025-2026)

#### Import Formats
Postman Spec Hub accepts: OpenAPI 2.0, 3.0, 3.1; AsyncAPI 2.0, 3.0; protobuf 2 & 3; GraphQL; Smithy 2.0.
Non-OpenAPI formats import as specifications only (no collection generated).

#### Import Methods (5 pathways)
1. File upload (single file)
2. Folder upload (multi-file — OpenAPI and protobuf only)
3. URL (remote link)
4. Raw text paste
5. Git repo sync (GitHub, Bitbucket, GitLab, Azure DevOps — OAuth required)

#### Import Strategy Options (OpenAPI only — user must choose)
- **Collection only**: Generates collection with folders/requests/examples; no Spec Hub artifact, no future sync.
- **Specification + Collection**: Creates both; enables downstream bidirectional sync.

#### Bidirectional Sync (Nov 2025)
- Edit spec → one-click push updates linked collection.
- Edit collection → push changes back to spec.
- **Gotcha**: Postman does NOT delete elements from collection on sync. Renaming a path in spec creates a NEW path — old one must be manually deleted.
- Multi-file specs: syncing FROM collection TO multi-file spec is NOT supported.
- AsyncAPI-generated collections cannot be synced.

#### Multi-File OpenAPI Support (Dec 2025)
- Split large OpenAPI files into modular components with cross-file `$ref`.
- Intelligent autocomplete works across file boundaries.
- Prevents merge conflicts on large-team specs.
- APIPilot does NOT have this — single-file only at import.

#### Version Tags / Snapshotting (Postman API v1.39)
- `GET /specs/{specId}/version-tags` — list version tags (id, name, createdAt, createdBy)
- `GET /specs/{specId}/version-tags/{tagId}/files` — snapshot of spec at tag point (path + content per file)
- `POST /specs/{specId}/version-tags` — create immutable tag (name only; immutable after creation)
- Tags are Git-tag-style snapshots: freeze state at release, compare across versions programmatically.
- APIPilot has NO spec versioning / tagging at all.

#### Spec Forking (June 2026 — v12.13.6)
- Fork a spec to edit without affecting the original.
- Pull parent updates via fast-forward merge into fork.
- APIPilot has NO forking.

#### Spec Duplication (June 2026 — v12.14.2)
- Duplicate a spec as a starting point for a new version.
- APIPilot has NO duplication.

#### Move Spec Between Workspaces (May 2026 — v12.12.3)
- Move specs across workspaces preserving metadata.
- APIPilot has NO cross-workspace spec move.

#### Governance + Issues Tab (May 2026 — v12.11.3)
- Unified Issues tab below spec editor: consolidates syntax errors + governance rule violations.
- Inline fix links — navigate directly from issue to the offending line.
- Governance reports: dashboard of which specs violate organizational policies.
- Enterprise-only: reusable component libraries for standardization.
- APIPilot has NO governance rules or issues tab.

#### Collection Validation (Schema-to-Collection — Postman)
- Orange dot in sidebar: marks any collection/folder/request/example with a schema mismatch.
- Warning icon in tab: shows count of issues; click to see issue list with details.
- Triggers: on request open, on request/example change, on API definition change, on send (response becomes saved example).
- Only works for collections that are linked to an API definition (not standalone collections).
- OpenAPI 3.0 and 3.1 only (not 2.0/Swagger).
- Auto-sync: "Update collection" button pushes spec changes to collection in one click.
- APIPilot has NO continuous collection-vs-schema validation; contract test is ephemeral/on-demand only.

#### Postman's 4-Layer Contract Testing Model
1. **API Definition Validation** — example responses match spec (linter).
2. **Industry Standards Validation** — spec conforms to OpenAPI rules (syntax + semantic).
3. **End-User Schema Validation** — live responses match spec using Ajv/JSON Schema.
4. **Governance Validation** — spec meets organizational standards (v10+ governance rules).
APIPilot currently implements layer 3 only (live response vs JSON Schema).

#### Export: Collection → Spec
- Generates OpenAPI 2.0, 3.0, or 3.1 as YAML or JSON.
- One spec per collection (must delete existing spec before generating a new one).
- Paths, components, parameters, headers, body types auto-extracted from collection.
- APIPilot exports OpenAPI 3.0.3 JSON only (no YAML, no 3.1, no 2.0 target).

#### Collection Status Tags (Dec 2025)
- Lifecycle tags on collections: `in-development`, `ready-to-use`, `deprecated`.
- APIPilot has no status tagging on collections/nodes.

### Gaps Found vs APIPilot Spec

| # | Postman Feature | APIPilot | Gap Severity |
|---|---|---|---|
| G1 | Bidirectional sync with no-delete gotcha | Not implemented | HIGH — spec says FE only, but sync logic also missing |
| G2 | Multi-file OpenAPI import (modular) | Single-file only | MEDIUM — complex APIs need this |
| G3 | Version tags / spec snapshots | Not implemented | HIGH — critical for diff-over-time |
| G4 | Spec forking | Not implemented | LOW — nice-to-have |
| G5 | Spec duplication | Not implemented | LOW — nice-to-have |
| G6 | Governance rules / issues tab | Not implemented | MEDIUM — enterprise differentiator |
| G7 | Continuous collection validation (orange dot) | Ephemeral on-demand only | HIGH — Postman's killer UX for day-to-day drift detection |
| G8 | Export: YAML format + OpenAPI 3.1 target | JSON 3.0.3 only | MEDIUM — some tools require YAML |
| G9 | Git repo sync (OAuth) | Not implemented | LOW — MVP can skip |
| G10 | Collection status tags (lifecycle) | Not implemented | LOW — nice-to-have |
| G11 | Import settings preview (tree of what will be created) | FE missing | HIGH — listed in README as missing FE |
| G12 | Contract test: layers 1, 2, 4 (definition linting, standards, governance) | Only layer 3 | MEDIUM — layer 1 (example vs spec) is achievable without infra |

---

## Deep Research — FE Library Decisions

### Schema Editor: Monaco Editor (chosen)

**Options evaluated:**
- Monaco Editor (`@monaco-editor/react` + `monaco-yaml`)
- CodeMirror 6 (`@codemirror/lang-yaml` + `@codemirror/lint`)

**Monaco wins because:**
- Built-in YAML + JSON language services (tokenization, formatting, folding)
- `monaco-yaml` package registers the OpenAPI JSON Schema → inline validation markers appear automatically with no custom linter code
- Postman itself uses Monaco for its schema editor — engineers expect VS Code key bindings
- Better large-file performance (virtual buffer, lazy rendering)
- Mature React wrapper (`@monaco-editor/react`) handles lifecycle correctly

**CodeMirror 6 trade-offs (not chosen):**
- Smaller bundle (~100 KB vs ~400 KB for Monaco)
- Better mobile / touch support
- YAML linting requires writing a custom lint extension (no OpenAPI-aware autocomplete out of the box)
- Reasonable choice for a lightweight editor; not the right choice when OpenAPI-aware validation is required

**Required npm packages:**
```
monaco-editor            # core
@monaco-editor/react     # React wrapper (handles worker setup)
monaco-yaml              # YAML language service + OpenAPI schema registration
js-yaml                  # YAML ↔ JSON conversion for format toggle
```

**OpenAPI schema registration (pseudocode):**
```javascript
import { configureMonacoYaml } from 'monaco-yaml';
configureMonacoYaml(monaco, {
  validate: true,
  schemas: [{
    uri: 'https://spec.openapis.org/oas/3.0/schema/2021-09-28',
    fileMatch: ['*.yaml', '*.yml', '*.json'],
    schema: openApiSchema,  // import from openapi-schema-validator package
  }],
});
```

---

### Diff Display: jsdiff + Custom JSON Diff (chosen)

**Options evaluated:**
- `diff` (npm) — character-level and line-level text diffing; the `jsdiff` library
- `deep-diff` — structural JSON diff (reports path + change type)
- `jsondiffpatch` — full-featured JSON diff + HTML visualization
- Custom recursive object diff (replicate backend Python algorithm in JS)

**Decision: `jsondiffpatch` for JSON bodies; `diff` for raw text bodies**

**Reasoning:**
- `jsondiffpatch` provides: diff computation + annotated HTML renderer + delta format compatible with the backend's recursive walk output
- It handles: added (green), removed (red), modified (yellow), unchanged (collapsed) — out of the box
- Renders nested objects correctly — does not flatten to line-based diff
- `diff` (jsdiff) is better for raw text / non-JSON response bodies
- Combining both: detect if body is JSON → use jsondiffpatch; else use diff

**Required npm packages:**
```
jsondiffpatch            # JSON structural diff + renderer
diff                     # fallback for non-JSON text bodies
```

---

## Deep Research — Backend Gaps

### Spec-to-Spec Diff (Not Built)

Endpoint needed: `GET /spec/{id}/diff?compare_id={other_id}`

**Algorithm:**
```python
def diff_specs(base: dict, compare: dict) -> dict:
    # base / compare are ApiSpec.parsed (normalized OAS 3.0 shape)
    changes = []
    base_paths = set(base.get("paths", {}).keys())
    compare_paths = set(compare.get("paths", {}).keys())

    # Removed paths → breaking
    for path in base_paths - compare_paths:
        changes.append({"path": path, "change": "path_removed", "breaking": True})

    # Added paths → non-breaking
    for path in compare_paths - base_paths:
        changes.append({"path": path, "change": "path_added", "breaking": False})

    # Existing paths — diff operations
    for path in base_paths & compare_paths:
        _diff_path(base["paths"][path], compare["paths"][path], path, changes)

    return {
        "breaking_count": sum(1 for c in changes if c["breaking"]),
        "non_breaking_count": sum(1 for c in changes if not c["breaking"]),
        "changes": changes,
    }
```

**Breaking change rules:**
| Change | Breaking | Reason |
|---|---|---|
| Path removed | Yes | Callers of that endpoint will get 404 |
| Method on existing path removed | Yes | Same reason |
| Required request param removed or renamed | Yes | No — client still sends it; server drops it → usually safe. Actually NON-breaking for removals from param list. **Correction:** removing a required param is non-breaking for callers (they can stop sending it) — only breaking if server now rejects it. Flag as WARNING, not breaking. |
| Required request body field added | Yes | Existing callers missing the new required field will get 400 |
| Response field type changed | Yes | Consumers reading the field will get wrong type |
| Required response field removed | Yes | Consumers expecting the field get undefined |
| Auth scheme changed | Yes | Clients using old auth will get 401 |
| Status code removed from documented responses | Warning | Client may not handle the now-undocumented code |
| Path added | No | Additive |
| Optional param added | No | Additive |
| Optional response field added | No | Additive |
| Description / example changed | No | Documentation only |

---

## Deep Research — OpenAPI 3.1 vs 3.0 Impact on APIPilot

### Key Parsing Differences
```
OAS 3.0:  nullable: true (non-standard extension)
OAS 3.1:  type: ["string", "null"]  (JSON Schema 2020-12)

OAS 3.0:  exclusiveMinimum: true (boolean modifier)
OAS 3.1:  exclusiveMinimum: 5 (the actual limit value)

OAS 3.0:  no webhooks
OAS 3.1:  webhooks: {} at top level (treat like paths, skip or flag)

OAS 3.0:  $ref siblings ignored
OAS 3.1:  $ref siblings merged (per JSON Schema)
```

### Validator Selection
- `jsonschema` Python library:
  - `Draft7Validator` → correct for OAS 3.0 schemas (OAS 3.0 uses Draft 07 subset)
  - `Draft202012Validator` → correct for OAS 3.1 schemas (uses 2020-12)
- APIPilot uses `Draft7Validator` → correct for OAS 3.0 but **incorrect for OAS 3.1 specs**
- Fix: detect spec version from `openapi: "3.1.x"` and select validator accordingly

[UNVERIFIED — `jsonschema` library's `Draft202012Validator` availability depends on installed version; requires `jsonschema >= 4.0.0`]

---

## Deep Research — allOf / oneOf / anyOf + Discriminator

### Generation Strategy for Complex Schemas

**allOf (intersection):**
- Merge all sub-schema properties into one object
- De-duplicate: if same property name appears in multiple sub-schemas, last definition wins
- Mark all sub-schema `required` arrays as required in merged output

**oneOf (exclusive OR):**
- Cannot generate one "correct" example — must pick a branch
- Strategy: generate one ApiCase per branch (each named after the branch discriminator value if available)
- Without discriminator: generate one case per oneOf entry, named `case_1`, `case_2`, etc.
- Postman picks first branch only — APIPilot can do better

**anyOf (OR):**
- Generate one case using first branch (same as Postman)
- Document in case name that it's the first anyOf variant

**discriminator resolution:**
```python
def resolve_discriminator(schema: dict, value: str, components: dict) -> dict:
    # schema has discriminator.propertyName + discriminator.mapping
    mapping = schema.get("discriminator", {}).get("mapping", {})
    if value in mapping:
        ref = mapping[value]  # '#/components/schemas/Dog'
        return resolve_ref(ref, components)
    # No mapping: try to find schema by name = value in components.schemas
    return components.get("schemas", {}).get(value, {})
```

**Impact on ApiCase generation:**
- Current: one ApiCase per operation named "default"
- Needed: one ApiCase per discriminator value (or per oneOf branch if no discriminator)
- Example: `petType: dog → Dog schema body`, `petType: cat → Cat schema body`

---

## Deep Research — cURL Edge Cases

### Flags APIPilot Must Handle
| cURL flag | Meaning | APIPilot handling |
|---|---|---|
| `-X GET` | Method override | Parsed |
| `-H "..."` | Header | Parsed |
| `-d '...'` | Body (string) | Parsed |
| `--data-raw '...'` | Body (unescaped) | Parsed |
| `--data-binary '...'` | Binary body | Parsed as string |
| `-d @filename` | Body from file | 400 — not supported |
| `-u user:pass` | Basic auth | → Authorization: Basic |
| `--user user:pass` | Same | → Authorization: Basic |
| `--oauth2-bearer TOKEN` | Bearer auth | → Authorization: Bearer TOKEN |
| `-F field=value` | Form data | NOT HANDLED — stores as body JSON |
| `--form field=value` | Same | NOT HANDLED |
| `-b 'cookie=val'` | Cookie header | → Cookie header |
| `--cookie-jar file` | Write cookies to file | 400 — file system |
| `--compressed` | Accept gzip | Ignored (correct) |
| `-k` / `--insecure` | Skip TLS verify | Ignored (should be flagged) |
| `-L` | Follow redirects | Ignored |
| `-o filename` | Write output to file | 400 or ignore |
| `--proxy url` | HTTP proxy | Ignored |

**Unhandled gaps:** `-F` / `--form` (multipart form data). Should parse into `content_type: multipart/form-data` + `body: {field: value}` dict.

---

## Deep Research — Export Gaps

### Current APIPilot Export (OpenAPI 3.0.3 JSON)
- Exports from `get_workspace_tree_response` → collection tree → OpenAPI paths
- Output: JSON only, 3.0.3 only

### Postman Export Options
- Format: OpenAPI 2.0, 3.0, or 3.1 as YAML or JSON (user picks)
- APIPilot gaps:
  - No YAML export target (`js-yaml.dump()` equivalent in Python: `yaml.dump()`)
  - No OpenAPI 3.1 export target
  - No OpenAPI 2.0 export target (Swagger — needed for teams on older tooling)

### YAML Export Fix
Adding YAML export is trivial:
```python
import yaml
# existing export returns dict
openapi_dict = build_openapi_dict(...)
if fmt == "yaml":
    return Response(content=yaml.dump(openapi_dict), media_type="text/yaml")
else:
    return Response(content=json.dumps(openapi_dict), media_type="application/json")
```
`GET /spec/{id}/export?format=json|yaml` — additive, backward-compatible.

---

## Deep Research — Multi-Server Support

### Problem
```yaml
servers:
  - url: https://prod.api.com/v1
  - url: https://staging.api.com/v1
  - url: http://localhost:8000/v1
```
- APIPilot uses `servers[0].url` only
- Engineers working in staging/dev need to switch base URL

### Postman Solution
- Generates `{{baseUrl}}` variable in each request URL
- Creates an environment with `baseUrl` set to each server URL
- User switches environment to switch server

### APIPilot Fix
- Store all server URLs from spec at import time in `ApiSpec.parsed`
- Expose via `GET /spec/{id}` → `servers: [{url, description}]`
- FE SpecImportModal: let user pick which server URL to use as the base for generated requests
- Alternative: always use `{{baseUrl}}` as path prefix, generate one env var per server

---

## Deep Research — Form Data Import Gap

### Problem
```yaml
requestBody:
  content:
    application/x-www-form-urlencoded:
      schema:
        properties:
          grant_type: {type: string, enum: [client_credentials]}
          client_id: {type: string}
```
- APIPilot stores `body` as a JSON dict
- `content_type` field on ApiCase determines how body is sent
- If body is `application/x-www-form-urlencoded`, body dict should be sent as form-encoded, not JSON

### Fix
- Import: detect `requestBody.content` key
  - `application/json` → `content_type = "application/json"`, body = schema mock
  - `application/x-www-form-urlencoded` → `content_type = "application/x-www-form-urlencoded"`, body = schema property dict
  - `multipart/form-data` → `content_type = "multipart/form-data"`, body = schema property dict
- `send_request()` must already handle these content types (verify in `runner.py`)

[UNVERIFIED — need to check `runner.py`/`execute_direct.py` to confirm form-encoded bodies are handled in `send_request()`]

---

## Deep Research — Contract Test Persistence (Post-MVP)

### Current State (Ephemeral)
- `POST /spec/{id}/contract-test` runs live requests and returns violations immediately
- Nothing stored — run again to re-check

### Postman's Approach
- Contract test runs are stored as "test runs" in the API tab history
- Each run: timestamp, pass/fail per endpoint, violation details
- Trend: can compare run N vs run N-1 (did we fix violations? did new ones appear?)

### APIPilot Post-MVP Option
- New model: `ContractTestRun` (spec_id, workspace_id, run_at, results JSON)
- `GET /spec/{id}/contract-test/history` → list past runs
- `GET /spec/{id}/contract-test/{run_id}` → detail of one run
- Trend analysis: compare two runs → delta (new violations, fixed violations)

---

## UNVERIFIED Items Summary
| # | Item | Why Unverified |
|---|---|---|
| U1 | OpenAPI 3.1 full feature parity in Postman | Postman 3.1 support was in-progress through 2024-2025 |
| U2 | WSDL import still supported | Postman deprecated SOAP tooling direction unclear |
| U3 | Postman changelog feature plan gating | May be Team or Enterprise only |
| U4 | Postman `Draft202012Validator` in jsonschema lib | Depends on installed version (>=4.0.0 required) |
| U5 | `send_request()` form-encoded body support | Need to read `runner.py` / `execute_direct.py` |
| U6 | Contract test persistence plan gating in Postman | May require API catalog / paid feature |
| U7 | VS Code extension feature parity with Postman app | Extension evolves independently |
| U8 | Postman API rate limits (current) | Rate limits change with plan pricing updates |
