# ---------- VALIDATOR (LIGHT MODE) ----------
import re
import json

_MISSING = object()
_TYPE_MAP = {
    "string": (str,),
    "number": (int, float),
    "boolean": (bool,),
    "object": (dict,),
    "array": (list,),
    "null": (type(None),),
}

def _to_lower_headers(headers):
    return {k.lower(): v for k, v in headers.items()}

def _resolve_path(obj, path):
    # Supports '$.a.b[0].c' or 'a.b[0].c' or 'a.b.c'
    if not path:
        return obj
    if path.startswith("$"):
        path = path[1:]
        if path.startswith("."): path = path[1:]
    path = path.lstrip(".")
    if not path:
        return obj
    path = re.sub(r"\[(\d+)\]", r".#\1", path)
    parts = [p for p in path.split(".") if p]
    cur = obj
    for p in parts:
        if p.startswith("#"):
            if not isinstance(cur, list): return _MISSING
            idx = int(p[1:])
            if idx < 0 or idx >= len(cur): return _MISSING
            cur = cur[idx]
        else:
            if isinstance(cur, dict) and p in cur:
                cur = cur[p]
            else:
                return _MISSING
    return cur

def _subset(expected, actual):
    # dict subset / list multi-subset / exact otherwise
    if isinstance(expected, dict) and isinstance(actual, dict):
        for k, v in expected.items():
            if k not in actual or not _subset(v, actual[k]):
                return False
        return True
    if isinstance(expected, list) and isinstance(actual, list):
        used = [False] * len(actual)
        for e in expected:
            ok = False
            for i, a in enumerate(actual):
                if used[i]: continue
                if _subset(e, a):
                    used[i] = True
                    ok = True
                    break
            if not ok: return False
        return True
    return expected == actual

def _contains(actual, expected):
    if isinstance(actual, str) and isinstance(expected, str):
        return expected in actual
    if isinstance(actual, (dict, list)):
        return _subset(expected, actual)
    return False

def _type_ok(actual, kinds):
    kinds = kinds if isinstance(kinds, list) else [kinds]
    pytypes = tuple(t for k in kinds for t in _TYPE_MAP.get(k, ()))
    return isinstance(actual, pytypes)

def _apply_check(body_json, chk, failures, prefix="json"):
    path = chk.get("path")
    if not path:
        failures.append(f"{prefix}: missing 'path' in check {chk}")
        return
    val = _resolve_path(body_json, path)

    # present/absent
    if chk.get("absent"):
        if val is not _MISSING:
            failures.append(f"{path}: expected absent, got {repr(val)}")
        return
    if chk.get("present"):
        if val is _MISSING:
            failures.append(f"{path}: expected present")
        return  # 'present' alone is enough

    # equals
    if "equals" in chk:
        if val is _MISSING or val != chk["equals"]:
            failures.append(f"{path}: expected {repr(chk['equals'])}, got {repr(val)}")

    # type
    if "type" in chk:
        if val is _MISSING or not _type_ok(val, chk["type"]):
            expected = chk["type"] if isinstance(chk["type"], list) else [chk["type"]]
            actual = type(val).__name__ if val is not _MISSING else "MISSING"
            failures.append(f"{path}: type {expected} expected, got {actual}")

    # regex
    if "regex" in chk:
        if not isinstance(val, str) or re.search(chk["regex"], val) is None:
            failures.append(f"{path}: regex '{chk['regex']}' did not match '{val}'")

    # contains
    if "contains" in chk:
        if not _contains(val, chk["contains"]):
            failures.append(f"{path}: does not contain {repr(chk['contains'])}")

    # length
    if "length" in chk:
        try:
            L = len(val)
        except Exception:
            failures.append(f"{path}: length check on non-sized value {repr(val)}")
        else:
            if L != chk["length"]:
                failures.append(f"{path}: expected length {chk['length']}, got {L}")

    # numeric ops
    for op in ("gt","gte","lt","lte"):
        if op in chk:
            if not isinstance(val, (int,float)):
                failures.append(f"{path}: {op} requires number, got {type(val).__name__}")
            else:
                ref = chk[op]
                if   op=="gt"  and not (val> ref): failures.append(f"{path}: expected > {ref}, got {val}")
                elif op=="gte" and not (val>=ref): failures.append(f"{path}: expected >= {ref}, got {val}")
                elif op=="lt"  and not (val< ref): failures.append(f"{path}: expected < {ref}, got {val}")
                elif op=="lte" and not (val<=ref): failures.append(f"{path}: expected <= {ref}, got {val}")

def evaluate_expect(resp, expect):
    """
    Minimal validator:
      - status / status_in
      - text_contains / text_regex
      - headers (exact)
      - json.checks (equals/present/absent/regex/contains/length/type/gt/gte/lt/lte)
      - json.either (list of branches with 'checks'; any passing branch -> pass)
    """
    failures = []

    # status
    if "status_in" in expect:
        if resp.status_code not in expect["status_in"]:
            failures.append(f"status: expected one of {expect['status_in']}, got {resp.status_code}")
    elif "status" in expect:
        if resp.status_code != expect["status"]:
            failures.append(f"status: expected {expect['status']}, got {resp.status_code}")

    # text
    body_text = resp.text or ""
    tc = expect.get("text_contains")
    if tc is not None:
        if isinstance(tc, list):
            for s in tc:
                if s not in body_text:
                    failures.append(f"text_contains: '{s}' not found")
        else:
            if tc not in body_text:
                failures.append(f"text_contains: '{tc}' not found")
    tre = expect.get("text_regex")
    if tre and re.search(tre, body_text) is None:
        failures.append(f"text_regex: pattern '{tre}' not found")

    # headers (exact match)
    want_hdrs = expect.get("headers") or {}
    if want_hdrs:
        actual_hdrs = _to_lower_headers(resp.headers)
        for hk, hv in want_hdrs.items():
            ak = hk.lower()
            av = actual_hdrs.get(ak)
            if av is None:
                failures.append(f"header '{hk}' missing")
            elif av != hv:
                failures.append(f"header '{hk}': expected '{hv}', got '{av}'")

    # json
    jexp = expect.get("json")
    if jexp:
        try:
            body_json = resp.json()
        except Exception:
            body_json = None
            failures.append("json: response is not JSON")
        if body_json is not None:
            for chk in jexp.get("checks", []):
                _apply_check(body_json, chk, failures)

            # either: list of branches; pass if any branch has no failures
            branches = jexp.get("either") or []
            if branches:
                any_ok = False
                reasons = []
                for i, br in enumerate(branches):
                    local = []
                    for chk in br.get("checks", []):
                        _apply_check(body_json, chk, local, prefix=f"json.either[{i}]")
                    if not local:
                        any_ok = True
                        break
                    reasons.append(local)
                if not any_ok:
                    failures.append(f"json.either: none matched. Reasons: {reasons}")

    return (len(failures) == 0, failures)


'''
 Begin Patch
 Add File: docs/API_Test_Expect_CheatSheet.md
# API Test `expect` Cheat Sheet (Light Mode)

## Top-Level Expect Keys
- `status` / `status_in`
- `text_contains` (string or list)
- `text_regex`
- `headers` (exact match, optional)

## JSON Section
```json
"json": {
  "checks": [
    { "path": "a.b", "equals": 1 },
    { "path": "x", "present": true },
    { "path": "y", "absent": true },
    { "path": "s", "regex": "^foo" },
    { "path": "arr", "length": 3 },
    { "path": "rate", "gt": 0 },
    { "path": "data", "contains": { "tariff_type": "SLAB" } }
  ],
  "either": [
    { "checks": [ { "path": "error_message", "present": true } ] },
    { "checks": [ { "path": "detail", "present": true } ] }
  ]
}
```

## Common Examples
**Success**
```json
"expect": {
  "status": 201,
  "text_contains": "Tariff created successfully",
  "json": {
    "checks": [
      { "path": "response_code", "equals": 201 },
      { "path": "errors", "absent": true },
      { "path": "data.tariff_type", "equals": "SLAB" },
      { "path": "data.tariff", "length": 3 },
      { "path": "data.tariff[0].rate", "gt": 0 }
    ]
  }
}
```

**Error with two possible envelopes**
```json
"expect": {
  "status_in": [400, 422],
  "text_contains": "first row 'start' must be 0",
  "json": {
    "either": [
      { "checks": [ { "path": "error_message", "present": true } ] },
      { "checks": [ { "path": "detail", "present": true } ] }
    ]
  }
}
```

 End Patch
'''