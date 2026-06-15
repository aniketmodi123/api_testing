---
name: Rejected lib additions
description: Functionality the user explicitly rejected adding to reusable_code_lib
type: feedback
---

Do not suggest these for reusable_code_lib:
- `utils/masker.py` — PII/sensitive field redaction
- `observability/request_context.py` — correlation ID propagation
- `utils/env_config.py` — typed env var loading
- `database/pagination.py` — generic paginate() helper; rejected because queries vary too much for a generic wrapper to be useful

**Why:** User rejected. Do not re-propose.
**How to apply:** When suggesting new lib additions, exclude these two. Do not bring them back unless the user asks.
