# Spec — Architecture

STATUS: stable
LAST_CHANGED: 2026-06-07

## Goal
Document the full system architecture so any new feature is built consistently.

## DB Models

| Model | Key Fields | Notes |
|---|---|---|
| User | id, email (=username), password(bcrypt), god(bool) | email is used as username everywhere |
| Workspace | id, user_id, name, description, active | one active at a time |
| Node | id, workspace_id, name, type(folder/file), parent_id | self-referencing tree |
| Header | id, folder_id(unique), content(JSON) | one header set per folder |
| Api | id, file_id(unique), name, method, endpoint, description, extra_meta(JSON) | one api per file node |
| ApiCase | id, api_id, name, headers(JSON), params(JSON), body(JSON), expected(JSON) | test cases for an api |
| Environment | id, workspace_id, name, variables(JSON), is_active | one active per workspace |
| BulkTestSchedule | id, username, workspace_id, type, interval_count, next_run, payload(JSON) | cron scheduler |
| BulkTestExecution | id, schedule_id, status, started_at, total_cases, passed, failed | run history |
| BulkTestResult | id, execution_id, case_id, case_name, success, failures(JSON), request(JSON), response(JSON) | per-case result |

## Auth Pattern

| Step | Detail |
|---|---|
| Login | POST /sign_in → returns JWT access_token |
| Every request | `Authorization: Bearer <token>` + `username: <email>` headers |
| Backend lookup | `get_user_by_username(db, username)` — finds by email field |
| Ownership check | `verify_node_ownership(db, node_id, user.id)` |
| Token blacklist | `sso_cache` table, `black_list=True` on logout |

## Response Format (ALL endpoints)
```python
{
  "response_code": int,      # HTTP status code
  "data": any | None,        # payload on success
  "message": str | None,     # success message
  "error_message": str | None # on error
}
```
Non-standard: `206` used for "not found / partial" (not HTTP standard).

## Variable Resolution Pattern
```python
resolve_variables(data, variables, ts=None)
# data: str | dict | list | any
# variables: {key: value} dict
# replaces {{VAR_NAME}} with variables[VAR_NAME]
# replaces ${ts} with current timestamp ms
# used in: URL, headers, params, body, expected
```

## Header Inheritance Pattern
```
get_headers(db, file_id)
→ get_folder_path_to_root(db, file_id)      # walk to root
→ get_headers_for_folders(db, folder_ids)   # batch fetch
→ merge_headers_with_priority(path, map)    # root→leaf, child overrides parent
```

## Frontend State Pattern
| Store | Technology | Used for |
|---|---|---|
| API calls | RTK Query (apiSlice.js) | All server communication, caching, invalidation |
| UI state | Zustand (store/*.jsx) | workspace, node, environment, api local state |
| Auth | Redux slice (authSlice.js) | JWT token, user object, localStorage sync |

## Decision Table
| # | Decision | Choice | Reason |
|---|---|---|---|
| 1 | Username field | Use email column as username | Consistent lookup key |
| 2 | Response wrapper | Always wrap in {response_code, data} | Uniform frontend handling |
| 3 | 206 for not-found | Non-standard 206 | Distinguish from 404 HTTP errors |
| 4 | SSL verify=False | Disabled for outbound httpx | localhost-friendly dev setup |
| 5 | Scheduler as separate process | supervisord manages two processes | Avoids blocking main FastAPI event loop |
