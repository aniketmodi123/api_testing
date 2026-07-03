# ApiPilot health-check prompt

Copy everything in the block below into any project's Claude session to verify the ApiPilot setup is
wired up (MCP connected, tools + prompt + resources present, skill imported, backend + auth alive).

---

```
Run an ApiPilot setup health check. Do NOT create, generate, or run any test cases — this is read-only
verification. Check each item, then print one PASS/FAIL table and a one-line verdict.

1. MCP CONNECTED
   - Confirm ApiPilot MCP tools are available (names start with `mcp__apipilot__`, or the older
     `mcp__api-testing-platform__` if the server hasn't been reconnected since rename).
   - FAIL if no such tools exist → tell me to connect/restart the ApiPilot MCP server.

2. AUTH + BACKEND ALIVE
   - Call the `login` tool. PASS if it returns a username/success; FAIL on error (report the message).

3. WORKSPACES REACHABLE
   - Call `list_workspaces`. PASS if it returns a list (even empty). Report how many workspaces.

4. SERVER PROMPT PRESENT
   - Confirm the server exposes the `test_pipeline` prompt (list MCP prompts).
   - FAIL if missing → server is outdated, needs the prompt/resource additions + restart.

5. SERVER RESOURCES PRESENT
   - Confirm both resources exist: `workflow://test-pipeline` and `prompt://case-generation`.
   - Fetch each; PASS if non-empty and not a "[... not found ...]" placeholder. Report char count.

6. LOCAL SKILL IMPORTED (only if running in Claude Code)
   - Confirm the `/apipilot-test` skill is listed in available skills.
   - This is convenience-only — mark N/A (not FAIL) if the client doesn't support skills.

Output format:
| # | Check | Result | Detail |
Then: overall verdict = READY only if checks 1-5 all PASS. Skill (6) is optional.
If anything failed, list the exact fix step for that item.
```

---

## Expected healthy result

- Checks 1-5 PASS, skill PASS (in Claude Code) → **READY**.
- Tools may appear as `mcp__api-testing-platform__*` until Claude Code is restarted after the rename —
  still PASS, just note the restart makes them `mcp__apipilot__*`.
