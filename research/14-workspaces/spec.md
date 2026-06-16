# Spec — Workspaces

STATUS: stable (existing feature)
LAST_CHANGED: 2026-06-16

## Current State
Workspaces, members, and invites work end-to-end. RBAC gate `can_access_workspace` is used by all features.

## Differentiator
X9 — unlimited collaborators, no per-seat tax (Postman: $14/seat/month)

## Pending (low priority)
Per-collection sharing: extend `WorkspaceMember` with optional `node_id` scope to allow sharing a sub-tree without full workspace access.
