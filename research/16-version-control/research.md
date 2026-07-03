# Research — Version Control (Node Snapshots)

LAST_UPDATED: 2026-06-16
SOURCE: phases/phase_11_collaboration/spec.md

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/routers/collab/` | Version snapshot + restore endpoints |
| `backend/src/models.py` | `NodeVersion` model |

## NodeVersion Model
```
NodeVersion
  id
  node_id           FK → nodes CASCADE
  snapshot          JSON  — full subtree blob
  author_username   varchar(255)
  message           text nullable
  created_at        datetime
```
Indexes: `(node_id, created_at)`.

## Snapshot JSON Shape
```json
{
  "node": {"id": 1, "name": "...", "type": "folder"},
  "children": [
    {
      "node": {"id": 2, "name": "...", "type": "file"},
      "apis": [
        {
          "api": {"id": 10, "method": "GET", "endpoint": "..."},
          "cases": [{"id": 100, "name": "...", "params": {}, "body": {}, "assertions": {}}]
        }
      ]
    }
  ]
}
```
Point-in-time blob — no live FKs within it.

## Restore Logic
1. Load snapshot JSON
2. Walk `children` BFS
3. For each Api: upsert by `(node_id + method + endpoint)` — update name/headers/auth; INSERT if not found
4. For each ApiCase: upsert by `(api_id + name)` — update body/params/assertions; INSERT if not found
5. Extras in live DB but not in snapshot → **LEFT ALONE** (additive restore — avoids accidental deletion)
6. Audit log: `node.version.restore`
