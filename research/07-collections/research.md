# Research — Collections

LAST_UPDATED: 2026-06-16

## Existing Code
| File | Purpose |
|---|---|
| `backend/src/models.py` | `Node` model: `id, workspace_id(FK), parent_id(self-ref nullable), name, type(folder/file), extra_meta(JSON)` |
| `backend/src/routers/node/create_node.py` | `POST /node` |
| `backend/src/routers/node/delete_node.py` | `DELETE /node/{id}` |
| `backend/src/routers/node/bulk_import.py` | `POST /node/bulk-import` — import tree with temp_id dedup |
| `backend/src/common_querys.py` | `get_workspace_tree_response`, `get_folder_path_to_root`, `verify_node_ownership` |

## Node Model Shape
```
Node
  id              int PK
  workspace_id    FK → workspaces CASCADE
  parent_id       FK → nodes SET NULL nullable  (self-ref)
  name            varchar(255)
  type            varchar(10)  "folder" | "file"
  extra_meta      JSON  (stores headers, auth, etc.)
  created_at      datetime
```

## Patterns
```python
# Tree walk (already exists in common_querys.py):
get_workspace_tree_response(db, workspace_id)  # BFS walk → nested dict

# Path to root (used for inheritance):
get_folder_path_to_root(db, file_id)  # returns [leaf, ..., root] ordered list
```
