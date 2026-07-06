---
name: apipilot-test
description: "Convenience alias to run the ApiPilot test pipeline. The real pipeline ships inside the MCP server as the `test_pipeline` prompt — this skill just invokes it. Trigger: /apipilot-test, 'write test cases and store in apipilot', 'test cases in apipilot and check results'."
trigger: /apipilot-test
---

# /apipilot-test

Thin alias. The pipeline lives INSIDE the ApiPilot MCP server (so every user of the server gets it,
not just this machine) — this skill only invokes it.

## What to do

1. Load the server-native prompt **`test_pipeline`** from the ApiPilot MCP server
   (`mcp__apipilot__*`). It returns the current end-to-end workflow + case-generation rules, read live
   from the repo — always the latest edited version.
2. Follow that prompt exactly, using the server's MCP tools.

For multi-API scope, do NOT run a flat per-API loop. The pipeline's Step 1.5 first does a cheap census
(`list_apis`, names only), groups endpoints (GETs → one reads group; writes → one group per
resource/model), and — when the scope is large or has writes — STOPS to confirm the grouped plan
before any `get_api` or case-gen. Follow that gate; the workflow owns the detail.

Do NOT reproduce the workflow here. The server owns it. If the MCP prompt is unavailable (server not
connected), tell the user to connect/restart the ApiPilot MCP server rather than improvising.

The volatile sources the server serves live (edit these, not this skill):
- Workflow: `research/mcp/TEST_WORKFLOW.md`  (resource `workflow://test-pipeline`)
- Case rules: `backend/gpt_test_case_creatio_prompt.txt`  (resource `prompt://case-generation`)

## Usage
```
/apipilot-test                      # run the pipeline; asks which workspace/folder/APIs
/apipilot-test <workspace>          # target a workspace by name or id
/apipilot-test <workspace> <folder> # scope to one folder subtree
```
