# 07 — Collections

Status: Partial
Coverage: 70%

## Implemented
- `Node` model (folder/file self-referencing tree)
- Create / rename / move / copy / delete nodes
- Folder structure with nested folders
- Workspace-scoped collection trees
- Bulk import (`POST /node/bulk-import`)

## Missing
- Collection variables tab (see 04-variables)
- Per-collection sharing (currently workspace-level only)
- Collection documentation (see 11-documentation)
- Collection-level auth inheritance already done (see 06-authentication)

## Current Task
None — core model complete; gaps in dependent features

## Next Task
Per-collection sharing granularity (extend WorkspaceMember)

## Dependencies
- 14-workspaces (workspace member model for sharing)

## Priority
P2
