# Phase 5 — Database Design

LAST_UPDATED: 2026-06-15
DB: PostgreSQL (async). **Precondition: adopt Alembic before creating any new table.**

> Existing tables documented in `project-overview.md §6` + `models.py`. This file specifies
> the **new** tables, their columns/indexes/FKs, and migration requirements.

---

## Migration Strategy (mandatory first)
| Step | Action |
|---|---|
| M0 | Introduce Alembic; baseline-stamp current `create_all` schema as revision 0 |
| M1 | All new tables = forward migrations (expand) |
| M2 | Secret encryption = expand→migrate→contract (add ciphertext col → backfill → drop plaintext) |
| Rule | Never destructive-first; never deploy code needing an unapplied migration |

---

## New Tables (DDL-level spec)

### collection_variables
| Column | Type | Constraint |
|---|---|---|
| id | int | PK |
| node_id | int | FK nodes(id) ON DELETE CASCADE, NOT NULL |
| key | varchar(255) | NOT NULL |
| value | text | NOT NULL default '' (ciphertext if secret) |
| is_secret | bool | default false |
| created_at | timestamp | default now |
Indexes: `unique(node_id, key)`.

### oauth_tokens
| Column | Type | Constraint |
|---|---|---|
| id | int | PK |
| owner_username | varchar(255) | NOT NULL, index |
| auth_ref | varchar(128) | NOT NULL (hash of client_id+scope+token_url) |
| access_token | text | NOT NULL (encrypted) |
| refresh_token | text | nullable (encrypted) |
| token_type | varchar(20) | default 'Bearer' |
| expires_at | timestamp | NOT NULL |
| created_at | timestamp | default now |
Indexes: `unique(owner_username, auth_ref)`, index(expires_at).

### flows
| id PK · workspace_id FK→workspaces CASCADE · name varchar(255) · description text · graph JSON · enabled bool · created_at · updated_at |
Index: index(workspace_id).

### flow_steps
| id PK · flow_id FK→flows CASCADE · step_order int · type varchar(20) [request/condition/delay/set_var] · api_id FK→apis SET NULL nullable · config JSON · extract JSON (jsonpath→var map) · condition JSON |
Indexes: index(flow_id, step_order). Check: `type IN (...)`.

### flow_runs
| id PK · flow_id FK CASCADE · status varchar(20) [queued/running/completed/failed] · context JSON · started_at · finished_at · error_message text |
Indexes: index(flow_id, status).

### flow_step_results
| id PK · flow_run_id FK CASCADE · step_id int · success bool · request JSON · response JSON · duration_ms int · created_at |
Indexes: index(flow_run_id).

### mock_servers
| id PK · workspace_id FK CASCADE · name · public_token varchar(64) unique · enabled bool · created_at |

### mock_routes
| id PK · mock_server_id FK CASCADE · method varchar(10) · path_pattern varchar(500) · matcher JSON · response_status int · response_headers JSON · response_body text · delay_ms int default 0 |
Indexes: index(mock_server_id, method).

### api_specs
| id PK · workspace_id FK CASCADE · name · version varchar(50) · format varchar(20) [openapi/swagger/graphql/asyncapi] · raw JSON · parsed JSON · created_at |
Indexes: index(workspace_id).

### comments
| id PK · workspace_id FK CASCADE · entity_type varchar(20) · entity_id int · author_username varchar(255) · body text · parent_id FK→comments SET NULL · created_at |
Indexes: index(entity_type, entity_id), index(workspace_id).

### node_versions
| id PK · node_id FK→nodes CASCADE · snapshot JSON · author_username · message text · created_at |
Indexes: index(node_id, created_at).

### published_docs
| id PK · node_id FK CASCADE · rendered JSON · public_token varchar(64) unique nullable · published_at · updated_at |

### audit_logs
| id PK · username varchar(255) index · workspace_id int index nullable · action varchar(50) · entity_type varchar(30) · entity_id int · metadata JSON · ip varchar(45) · created_at index |
Indexes: index(workspace_id, created_at), index(username, created_at). **Retention/partition by month.**

### monitors
| id PK · workspace_id FK CASCADE · name · schedule_id FK→bulk_test_schedules CASCADE · uptime_pct numeric(5,2) · p95_latency_ms int · last_status varchar(20) · updated_at |

---

## Modifications to Existing Tables
| Table | Change | Migration class |
|---|---|---|
| environments | secret values → store ciphertext (keep JSON shape, encrypt secret entries) | expand→migrate→contract |
| global_variables | `value` → ciphertext when `is_secret` | expand→migrate→contract |
| apis | use `extra_meta.auth` for declarative auth (no schema change) OR add `auth JSON` column | additive |
| request_history / bulk_test_results | add retention job (no column) | ops |
| workspaces ref columns (schedules/history `workspace_id` Integer) | optionally promote to real FK | additive, low priority |

---

## ER Diagram (text)
```
workspaces 1─< flows 1─< flow_steps
flows 1─< flow_runs 1─< flow_step_results
workspaces 1─< mock_servers 1─< mock_routes
workspaces 1─< api_specs
workspaces 1─< comments      (polymorphic entity_type/entity_id)
nodes 1─< collection_variables
nodes 1─< node_versions
nodes 1─< published_docs
workspaces 1─< monitors 1─1 bulk_test_schedules
workspaces 1─< audit_logs
users 1─< oauth_tokens
```

---

## Index / Cost Notes
- Hot polling already indexed: `bulk_test_schedules(enabled, next_run)`. New `flow_runs(status)` similar.
- JSON columns (graph/config/snapshot/response) are write-light, read-by-PK → no GIN needed at MVP.
- audit_logs + history are append-heavy → **partition by month**, add retention (90d default).

---

## Validation Checklist — Phase 5
- [x] Every new entity → concrete table + columns + types
- [x] FKs + cascade rules specified
- [x] Indexes + unique constraints specified
- [x] Migration class per change (expand/additive/destructive)
- [x] Alembic adoption flagged as precondition
- [x] Retention/partition for append-heavy tables
- [x] ER diagram
