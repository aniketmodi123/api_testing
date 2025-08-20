# ---------- VALIDATOR (LIGHT MODE, WITH PRECHECK) ----------
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple, Union

JSON = Union[dict, list, str, int, float, bool, None]
_MISSING = object()

# Allowed logical JSON types for `type` checks
_TYPE_MAP = {
    "string": (str,),
    "number": (int, float),
    "boolean": (bool,),
    "object": (dict,),
    "array": (list,),
    "null": (type(None),),
}

# =========================
# Helper utilities
# =========================

def _to_lower_headers(headers: Dict[str, str]) -> Dict[str, str]:
    return {str(k).lower(): v for k, v in headers.items()}

def _resolve_path(obj: JSON, path: str) -> Any:
    """
    Supports:
      - 'a.b.c'
      - 'a.b[0].c'
      - '$.a.b[0].c'
    Returns _MISSING sentinel if not found.
    """
    if not path:
        return obj
    if path.startswith("$"):
        path = path[1:]
        if path.startswith("."):
            path = path[1:]
    path = path.lstrip(".")
    if not path:
        return obj

    # Convert [idx] -> .#idx so we can split on dots
    path = re.sub(r"\[(\d+)\]", r".#\1", path)
    parts = [p for p in path.split(".") if p]

    cur: Any = obj
    for p in parts:
        if p.startswith("#"):
            if not isinstance(cur, list):
                return _MISSING
            idx = int(p[1:])
            if idx < 0 or idx >= len(cur):
                return _MISSING
            cur = cur[idx]
        else:
            if isinstance(cur, dict) and p in cur:
                cur = cur[p]
            else:
                return _MISSING
    return cur

def _subset(expected: Any, actual: Any) -> bool:
    """Dict subset / list multi-subset / equality otherwise."""
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
                if used[i]:
                    continue
                if _subset(e, a):
                    used[i] = True
                    ok = True
                    break
            if not ok:
                return False
        return True
    return expected == actual

def _contains(actual: Any, expected: Any) -> bool:
    if isinstance(actual, str) and isinstance(expected, str):
        return expected in actual
    if isinstance(actual, (dict, list)):
        return _subset(expected, actual)
    return False

def _type_ok(actual: Any, kinds: Union[str, List[str]]) -> bool:
    kinds = kinds if isinstance(kinds, list) else [kinds]
    pytypes = tuple(t for k in kinds for t in _TYPE_MAP.get(k, ()))
    return isinstance(actual, pytypes)

def _apply_check(body_json: JSON, chk: Dict[str, Any], failures: List[str], *, prefix: str = "json") -> None:
    path = chk.get("path")
    if not path or not isinstance(path, str):
        failures.append(f"{prefix}: missing/invalid 'path' in check {chk}")
        return

    val = _resolve_path(body_json, path)

    # present / absent (exclusive usage recommended)
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
            expected_types = chk["type"] if isinstance(chk["type"], list) else [chk["type"]]
            actual_type = type(val).__name__ if val is not _MISSING else "MISSING"
            failures.append(f"{path}: type {expected_types} expected, got {actual_type}")

    # regex
    if "regex" in chk:
        if not isinstance(val, str) or re.search(chk["regex"], val) is None:
            failures.append(f"{path}: regex '{chk['regex']}' did not match '{val}'")

    # contains (string substring, or dict/list subset)
    if "contains" in chk:
        if not _contains(val, chk["contains"]):
            failures.append(f"{path}: does not contain {repr(chk['contains'])}")

    # length
    if "length" in chk:
        try:
            L = len(val)  # type: ignore[arg-type]
        except Exception:
            failures.append(f"{path}: length check on non-sized value {repr(val)}")
        else:
            if L != chk["length"]:
                failures.append(f"{path}: expected length {chk['length']}, got {L}")

    # numeric ops
    for op in ("gt", "gte", "lt", "lte"):
        if op in chk:
            if not isinstance(val, (int, float)):
                failures.append(f"{path}: {op} requires number, got {type(val).__name__}")
            else:
                ref = chk[op]
                if   op == "gt"  and not (val >  ref): failures.append(f"{path}: expected > {ref}, got {val}")
                elif op == "gte" and not (val >= ref): failures.append(f"{path}: expected >= {ref}, got {val}")
                elif op == "lt"  and not (val <  ref): failures.append(f"{path}: expected < {ref}, got {val}")
                elif op == "lte" and not (val <= ref): failures.append(f"{path}: expected <= {ref}, got {val}")

# =========================
# Public: validate_expected_spec (pre-store schema check)
# =========================

def validate_expected_spec(expect: Any) -> Tuple[bool, List[str]]:
    """
    Validate the *shape* of an `expected` object (no HTTP call).
    Returns (ok, errors). Does NOT perform live response checks.

    Rules:
      - Must be a dict.
      - Use exactly one of: 'status' (int 100..599) OR 'status_in' (list[int 100..599]).
      - text_contains: str | [str,...]
      - text_regex: str (must compile)
      - headers / headers_regex: dict[str,str] (regex patterns must compile)
      - json.checks: list of check objects; each has 'path': str and at least one predicate
        among: equals, present, absent, regex, contains, length, type, gt, gte, lt, lte
      - json.either: list of branches, each with "checks": [...]
      - Optional flags: _mirror_http_status (bool), _require_content_for_error (bool)
    """
    errs: List[str] = []

    if not isinstance(expect, dict):
        return False, ["expected: must be an object"]

    # status / status_in exclusivity
    has_status = "status" in expect
    has_status_in = "status_in" in expect
    if has_status and has_status_in:
        errs.append("expected: use only one of 'status' or 'status_in'")

    if has_status:
        st = expect["status"]
        if not isinstance(st, int) or not (100 <= st <= 599):
            errs.append("expected.status: must be integer 100..599")

    if has_status_in:
        si = expect["status_in"]
        if not (isinstance(si, list) and si and all(isinstance(x, int) for x in si)):
            errs.append("expected.status_in: must be a non-empty list of integers")
        else:
            bad = [x for x in si if x < 100 or x > 599]
            if bad:
                errs.append(f"expected.status_in: invalid HTTP codes {bad}")

    # text_contains
    if "text_contains" in expect:
        tc = expect["text_contains"]
        if not (isinstance(tc, str) or (isinstance(tc, list) and all(isinstance(s, str) for s in tc))):
            errs.append("expected.text_contains: must be string or list of strings")

    # text_contains_any (optional helper)
    if "text_contains_any" in expect:
        tca = expect["text_contains_any"]
        if not (isinstance(tca, str) or (isinstance(tca, list) and all(isinstance(s, str) for s in tca))):
            errs.append("expected.text_contains_any: must be string or list of strings")

    # text_regex
    if "text_regex" in expect:
        tre = expect["text_regex"]
        if not isinstance(tre, str):
            errs.append("expected.text_regex: must be string (regex)")
        else:
            try:
                re.compile(tre)
            except re.error as e:
                errs.append(f"expected.text_regex: invalid regex: {e}")

    # headers (exact) and headers_regex
    for key in ("headers", "headers_regex"):
        if key in expect:
            hdrs = expect[key]
            if not (isinstance(hdrs, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in hdrs.items())):
                errs.append(f"expected.{key}: must be object of string keys to string values")
            if key == "headers_regex" and isinstance(hdrs, dict):
                for k, pat in hdrs.items():
                    try:
                        re.compile(pat)
                    except re.error as e:
                        errs.append(f"expected.headers_regex['{k}']: invalid regex: {e}")

    # json section
    if "json" in expect:
        j = expect["json"]
        if not isinstance(j, dict):
            errs.append("expected.json: must be object")
        else:
            # checks
            if "checks" in j:
                ch = j["checks"]
                if not isinstance(ch, list):
                    errs.append("expected.json.checks: must be list")
                else:
                    for i, chk in enumerate(ch):
                        _validate_one_check(chk, errs, f"expected.json.checks[{i}]")

            # either
            if "either" in j:
                et = j["either"]
                if not isinstance(et, list) or not et:
                    errs.append("expected.json.either: must be non-empty list")
                else:
                    for bi, br in enumerate(et):
                        if not isinstance(br, dict):
                            errs.append(f"expected.json.either[{bi}]: must be object")
                            continue
                        br_checks = br.get("checks")
                        if not isinstance(br_checks, list) or not br_checks:
                            errs.append(f"expected.json.either[{bi}].checks: must be non-empty list")
                            continue
                        for ci, chk in enumerate(br_checks):
                            _validate_one_check(chk, errs, f"expected.json.either[{bi}].checks[{ci}]")

    # optional flags
    for f in ("_mirror_http_status", "_require_content_for_error"):
        if f in expect and not isinstance(expect[f], bool):
            errs.append(f"expected.{f}: must be boolean")

    return (len(errs) == 0, errs)

def _validate_one_check(chk: Any, errs: List[str], where: str) -> None:
    if not isinstance(chk, dict):
        errs.append(f"{where}: must be object")
        return
    if "path" not in chk or not isinstance(chk["path"], str) or not chk["path"]:
        errs.append(f"{where}.path: required string")
    # must contain at least one predicate:
    predicates = ("equals", "present", "absent", "regex", "contains", "length", "type", "gt", "gte", "lt", "lte")
    if not any(p in chk for p in predicates):
        errs.append(f"{where}: must contain one of {predicates}")
    # refine a few types
    if "length" in chk and not (isinstance(chk["length"], int) and chk["length"] >= 0):
        errs.append(f"{where}.length: must be non-negative integer")
    if "regex" in chk:
        rg = chk["regex"]
        if not isinstance(rg, str):
            errs.append(f"{where}.regex: must be string")
        else:
            try:
                re.compile(rg)
            except re.error as e:
                errs.append(f"{where}.regex: invalid regex: {e}")
    if "type" in chk:
        t = chk["type"]
        allowed = set(_TYPE_MAP.keys())
        if isinstance(t, str):
            if t not in allowed:
                errs.append(f"{where}.type: invalid '{t}', allowed {sorted(allowed)}")
        elif isinstance(t, list):
            bad = [x for x in t if x not in allowed]
            if bad:
                errs.append(f"{where}.type: invalid {bad}, allowed {sorted(allowed)}")
        else:
            errs.append(f"{where}.type: must be string or list of strings")
    for op in ("gt", "gte", "lt", "lte"):
        if op in chk and not isinstance(chk[op], (int, float)):
            errs.append(f"{where}.{op}: must be number")

# =========================
# Public: evaluate_expect (live response check)
# =========================

def evaluate_expect(resp, expect: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validate an httpx/requests-like response against `expect`.

    Supported top-level keys:
      - status (int) OR status_in (list[int])
      - text_contains (str | list[str])
      - text_contains_any (str | list[str])  # optional helper
      - text_regex (str)
      - headers (dict[str,str])              # exact match (case-insensitive keys)
      - headers_regex (dict[str,str])        # regex match on header values
      - json: { checks: [...], either: [...] }

    Optional flags:
      - _mirror_http_status: True (default)
      - _require_content_for_error: True (default)
    """
    failures: List[str] = []

    # ----- Status checks -----
    if "status_in" in expect:
        allowed = expect["status_in"]
        if resp.status_code not in allowed:
            failures.append(f"status: expected one of {allowed}, got {resp.status_code}")
    elif "status" in expect:
        if resp.status_code != expect["status"]:
            failures.append(f"status: expected {expect['status']}, got {resp.status_code}")

    # ----- Text checks -----
    body_text = resp.text or ""
    if "text_contains" in expect:
        tc = expect["text_contains"]
        needles = tc if isinstance(tc, list) else [tc]
        for s in needles:
            if s not in body_text:
                failures.append(f"text_contains: '{s}' not found")
    if "text_contains_any" in expect:
        tca = expect["text_contains_any"]
        options = tca if isinstance(tca, list) else [tca]
        if not any(s in body_text for s in options):
            failures.append(f"text_contains_any: none matched {options!r}")
    if "text_regex" in expect:
        tre = expect["text_regex"]
        if re.search(tre, body_text) is None:
            failures.append(f"text_regex: pattern '{tre}' not found")

    # ----- Headers (exact) -----
    want_hdrs = expect.get("headers") or {}
    if want_hdrs:
        actual_hdrs = _to_lower_headers(getattr(resp, "headers", {}) or {})
        for hk, hv in want_hdrs.items():
            ak = hk.lower()
            av = actual_hdrs.get(ak)
            if av is None:
                failures.append(f"header '{hk}' missing")
            elif av != hv:
                failures.append(f"header '{hk}': expected '{hv}', got '{av}'")

    # ----- Headers (regex) -----
    want_hdrs_re = expect.get("headers_regex") or {}
    if want_hdrs_re:
        actual_hdrs = _to_lower_headers(getattr(resp, "headers", {}) or {})
        for hk, pat in want_hdrs_re.items():
            ak = hk.lower()
            av = actual_hdrs.get(ak)
            if av is None or re.search(pat, av) is None:
                failures.append(f"header '{hk}': pattern '{pat}' did not match '{av}'")

    # ----- JSON checks -----
    body_json: JSON = None
    if "json" in expect:
        try:
            body_json = resp.json()
        except Exception:
            body_json = None
            failures.append("json: response is not JSON")
        if body_json is not None:
            jexp = expect["json"] or {}
            for i, chk in enumerate(jexp.get("checks", []) or []):
                _apply_check(body_json, chk, failures)
            branches = jexp.get("either") or []
            if branches:
                any_ok = False
                reasons: List[List[str]] = []
                for bidx, br in enumerate(branches):
                    local: List[str] = []
                    for ci, chk in enumerate(br.get("checks", []) or []):
                        _apply_check(body_json, chk, local, prefix=f"json.either[{bidx}]")
                    if not local:
                        any_ok = True
                        break
                    reasons.append(local)
                if not any_ok:
                    failures.append(f"json.either: none matched. Reasons: {reasons}")

    # ----- Optional safeguards -----
    # 1) Auto-mirror HTTP status to JSON response_code if present and not already asserted.
    auto_mirror = expect.get("_mirror_http_status", True)
    if auto_mirror and body_json is not None and isinstance(body_json, dict) and "response_code" in body_json:
        if not _has_response_code_assert(expect):
            if body_json.get("response_code") != resp.status_code:
                failures.append(
                    f"json.response_code: expected mirror of HTTP {resp.status_code}, "
                    f"got {body_json.get('response_code')}"
                )

    # 2) Require at least one content assertion for 4xx/5xx (text or json)
    require_err_content = expect.get("_require_content_for_error", True)
    if require_err_content and 400 <= resp.status_code <= 599:
        has_text = any(k in expect for k in ("text_contains", "text_contains_any", "text_regex"))
        has_json = "json" in expect
        if not (has_text or has_json):
            failures.append("error response without any content assertion (add text_contains or json checks)")

    return (len(failures) == 0, failures)

def _has_response_code_assert(expect: Dict[str, Any]) -> bool:
    jexp = expect.get("json") or {}
    for chk in jexp.get("checks", []) or []:
        if chk.get("path") == "response_code" and "equals" in chk:
            return True
    for br in (jexp.get("either") or []):
        for chk in br.get("checks", []) or []:
            if chk.get("path") == "response_code" and "equals" in chk:
                return True
    return False


"""
**********************manual***************************
{
  here’s a compact, copy-pasteable **manual** for writing the `expected` JSON you’ll store with each test case.

---

# 1) What an `expected` looks like

Use **one** of `status` (exact) **or** `status_in` (any of).

```json
{
  "status": 201,                     // OR: "status_in": [400, 422]
  "text_contains": "optional text",  // or ["must appear", "all of these"]
  "text_contains_any": ["one", "of", "these"],  // optional
  "text_regex": "optional-regex",
  "headers": { "content-type": "application/json" },         // exact match
  "headers_regex": { "content-type": "^application/json" },  // regex match

  "json": {
    "checks": [
      { "path": "response_code", "equals": 201 },
      { "path": "errors", "absent": true },
      { "path": "data.id", "type": "number" },
      { "path": "data.items", "length": 3 },
      { "path": "data.items[0].rate", "gt": 0 },
      { "path": "data.meta", "contains": {"tariff_type": "SLAB"} }
    ],
    "either": [
      { "checks": [ { "path": "error_message", "present": true } ] },
      { "checks": [ { "path": "detail", "present": true } ] }
    ]
  },

  "_mirror_http_status": true,          // default true: auto-enforce response_code == HTTP status
  "_require_content_for_error": true    // default true: force content checks for 4xx/5xx
}
```

---

# 2) JSON path syntax (what goes in `"path"`)

* Dot path: `a.b.c`
* Arrays: `a.items[0].id`
* Root `$` optional: `$.a.b[1].c`
* Missing paths don’t crash—validator reports them.

---

# 3) Available predicates (per `checks[*]`)

* Presence: `"present": true` | `"absent": true`
* Equality: `"equals": <any JSON>`
* Type: `"type": "string" | "number" | "boolean" | "object" | "array" | "null"` (or a list)
* Regex (string only): `"regex": "^foo"`
* Contains (substring or structural subset):

  * strings → `"contains": "part"`
  * objects/lists → `"contains": { "k": "v" }` or an array subset
* Length (arrays/strings/objects): `"length": 3`
* Numbers: `"gt" | "gte" | "lt" | "lte": <number>`

---

# 4) Fast templates (paste and edit)

### A) Create/Update success (201)

```json
{
  "status": 201,
  "text_contains": "Tariff created successfully",
  "json": {
    "checks": [
      { "path": "response_code", "equals": 201 },
      { "path": "errors", "absent": true }
    ]
  }
}
```

### B) Validation error (400/422) with flexible envelope

```json
{
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

### C) GET list success (200)

```json
{
  "status": 200,
  "json": {
    "checks": [
      { "path": "response_code", "equals": 200 },
      { "path": "errors", "absent": true },
      { "path": "data", "present": true }
    ]
  }
}
```

### D) GET by id success (200, exactly one)

```json
{
  "status": 200,
  "json": {
    "checks": [
      { "path": "response_code", "equals": 200 },
      { "path": "errors", "absent": true },
      { "path": "data", "length": 1 },
      { "path": "data[0].id", "equals": 1 },
      { "path": "data[0].tariff_type", "equals": "SLAB" },
      { "path": "data[0].tariff[0].rate", "gt": 0 }
    ]
  }
}
```

### E) GET by id not found / empty (206)

```json
{
  "status": 206,
  "text_contains": "No Data Found.",
  "json": {
    "checks": [
      { "path": "response_code", "equals": 206 },
      { "path": "error_message", "equals": "No Data Found." },
      { "path": "data", "absent": true }
    ]
  }
}
```

### F) Invalid query schema (422)

```json
{
  "status": 422,
  "json": {
    "checks": [
      { "path": "response_code", "equals": 422 },
      { "path": "error_message", "regex": "(?i)^validation error$" },
      { "path": "errors", "present": true },
      { "path": "errors[0].field", "equals": "query.id" }
    ]
  }
}
```

---

# 5) Minimal workflow to write one `expected`

1. **Pick status**

   * happy path → `status: 200/201/...`
   * error path → `status_in: [400, 422]` (or similar)

2. **Add at least one content assertion**

   * text (`text_contains` or `text_regex`) **or** JSON checks

3. **For JSON bodies**

   * always assert `response_code` mirrors HTTP (or keep `_mirror_http_status: true`)
   * assert envelope shape (`errors` absent/present)
   * assert key fields (`type`, `equals`, `gt/gte/lt/lte`, `length`, `contains`)

4. **If errors vary**

   * add `json.either` branches for alternate shapes (`error_message` vs `detail`)

5. **(Optional) Headers**

   * `headers` for exact matches; `headers_regex` for flexible matches

6. **Self-check before saving**

   * run your API’s precheck using `validate_expected_spec(expected)`; fix any reported reasons

---

# 6) Common pitfalls (and fixes)

* **Only status, no content** → add `text_contains` or `json.checks` (keeps tests meaningful).
* **Wrong path** → confirm array indexes and names; use `data.items[0].id`, not `data.items.id`.
* **Content-Type varies** → use `headers_regex: { "content-type": "^application/json" }`.
* **Number vs string** → use `"type": "number"` and numeric operators to enforce.
* **Order-insensitive object/list checks** → use `"contains"` (subset), not `equals`.

---

that’s it—grab a template above, tweak the paths/values for your API, and you’ll have consistent, reliable `expected` blocks that your runner + validator can enforce.

}



This matches your validator’s capabilities and guards the common mistakes (e.g., both status and status_in).
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ExpectedSpec",
  "type": "object",
  "properties": {
    "status": { "type": "integer", "minimum": 100, "maximum": 599 },
    "status_in": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "integer", "minimum": 100, "maximum": 599 }
    },
    "text_contains": {
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ]
    },
    "text_contains_any": {
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ]
    },
    "text_regex": { "type": "string" },
    "headers": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    },
    "headers_regex": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    },
    "json": {
      "type": "object",
      "properties": {
        "checks": {
          "type": "array",
          "items": { "$ref": "#/$defs/check" }
        },
        "either": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "properties": {
              "checks": {
                "type": "array",
                "minItems": 1,
                "items": { "$ref": "#/$defs/check" }
              }
            },
            "required": ["checks"],
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "_mirror_http_status": { "type": "boolean" },
    "_require_content_for_error": { "type": "boolean" }
  },
  "allOf": [
    { "oneOf": [
      { "required": ["status"] },
      { "required": ["status_in"] }
    ]},
    { "not": { "required": ["status", "status_in"] } }
  ],
  "additionalProperties": false,
  "$defs": {
    "check": {
      "type": "object",
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "equals": {},
        "present": { "type": "boolean" },
        "absent": { "type": "boolean" },
        "regex": { "type": "string" },
        "contains": {},
        "length": { "type": "integer", "minimum": 0 },
        "type": {
          "oneOf": [
            { "type": "string", "enum": ["string","number","boolean","object","array","null"] },
            { "type": "array", "items": { "type": "string", "enum": ["string","number","boolean","object","array","null"] } }
          ]
        },
        "gt": { "type": "number" },
        "gte": { "type": "number" },
        "lt": { "type": "number" },
        "lte": { "type": "number" }
      },
      "required": ["path"],
      "anyOf": [
        { "required": ["equals"] },
        { "required": ["present"] },
        { "required": ["absent"] },
        { "required": ["regex"] },
        { "required": ["contains"] },
        { "required": ["length"] },
        { "required": ["type"] },
        { "required": ["gt"] },
        { "required": ["gte"] },
        { "required": ["lt"] },
        { "required": ["lte"] }
      ],
      "additionalProperties": true
    }
  }
}


"""