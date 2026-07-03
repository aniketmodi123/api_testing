# Research — API Request Builder

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `frontend/src/components/RequestPanel/RequestPanel.jsx` | Main request builder UI |
| `frontend/src/components/RequestPanel/RequestPanel.module.css` | Styles |
| `backend/src/models.py` | `Api`: `id, node_id(FK), method, endpoint, name, extra_meta(JSON)` |
| `backend/src/routers/runner/execute_direct.py` | Single request send |

## Api Model
```
Api
  id
  node_id       FK → nodes CASCADE
  method        varchar(10)  GET/POST/PUT/DELETE/PATCH
  endpoint      varchar(500)  e.g. /api/users/{id}
  name          varchar(255)
  extra_meta    JSON  {headers, auth, ...}
```

## Path Param Note
`{id}` style path params stored in `endpoint` string. No dedicated binding UI — values substituted via variable resolution or manual editing. Dedicated UI would parse `{param}` tokens from endpoint and offer a form to set each.

## cURL Round-Trip
`POST /curl/to-request` and `POST /request/to-curl` exist in `routers/spec/curl.py`. FE just needs to wire them.
