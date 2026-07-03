## graphify (use for complex architecture questions only)

This project has a knowledge graph at graphify-out/.

Use graphify ONLY when you'd otherwise need to read 3+ files to understand structure:
- Broad architecture overview → read graphify-out/GRAPH_REPORT.md
- Complex cross-file tracing → `graphify query "how does X work"`
- Impact analysis across many callers → `graphify path "<A>" "<B>"`

For simple lookups (find a symbol, check a file, locate a function): use grep/Read directly — faster and cheaper.

After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
