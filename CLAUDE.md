## graphify (GRAPH-FIRST — use for every possible need)

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships. The graph is the DEFAULT first move for ANY codebase question — before grep/find, before reading raw files, before answering anything structural.

Use the graph for every possible need:
- Find a similar endpoint/function to copy → `graphify query "endpoints similar to X"`
- Trace request flow (router → service → repo → model) → `graphify query "how does X work"`
- Find an existing util/helper to reuse before writing new → `graphify query "utility for X"`
- Impact analysis / what calls this → `graphify path "<A>" "<B>"` or `graphify query "callers of X"`
- Which model/table, relationships → `graphify explain "<Model>"`
- Broad architecture → read graphify-out/GRAPH_REPORT.md
- Broad navigation → graphify-out/wiki/index.md if it exists

Rules:
- Always try the graph FIRST. Drop to raw file reads only when the graph lacks line-level detail.
- This is how Phase 1 "Understand Before Coding" gets done — find the pattern to reuse, trace the flow, locate models/utils, all without burning context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
