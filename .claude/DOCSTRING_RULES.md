# Docstring Rules — ApiPilot Backend

## Which format to use

- **FastAPI route handlers** (`@router.get/post/put/delete/patch/websocket`) → Route Handler section
- **Utility / logic / helper functions** → Function section
- **Pydantic BaseModel / dataclasses** → Class / Data Model section
- **Private (`_name`) functions** → single line only

---

## Route Handler Docstring (`@router.*` endpoints)

```
"""<one sentence — imperative verb, what the endpoint does for the caller>"""
```

With Steps (only when 4+ distinct stages):

```
"""<one sentence summary>

Steps:
    - Step 1: <active verb — e.g. Verify user identity>
    - Step 2: <active verb — e.g. Check role against min_role>
    - Step N: ...
Notes:
    - <only for non-obvious contract — e.g. fire-and-forget side effect, role bypass>
"""
```

Rules:

- Summary always — one line, imperative verb, caller-facing
- No Args block — path/query params in signature; body schema self-documents
- No Returns block — response shape in `create_response()` + Pydantic schema
- No Example block — never
- Steps only when handler has 4+ logically distinct stages
- Notes only when contract cannot be inferred from route path + summary

---

## Module Docstring

- One sentence — state the module's **public purpose**, not capabilities or accepted types
- Never enumerate input types, internal mechanisms, or type-handling options
- Format: `What this file does: <one sentence>`

---

## Class / Data Model Docstring

For public Pydantic `BaseModel` subclasses and dataclasses exposed as return types:

```
Summary line
Attributes:   ← required when the class is a structured return type
```

### Summary Line

- Imperative verb, one sentence, no trailing period

### Attributes

- **All fields must appear** — obvious fields get one phrase; non-obvious get full detail
- For `Literal` fields: list every value with its meaning inline, on one line
- For nullable fields: state when `None` is returned vs a value — public contract, always document
- Keep behavioral invariants short (one clause); no prose paragraphs

---

## Function / Method Docstring (utilities, helpers, business logic)

### Section Order

```
Summary line
Args:
Returns:
Raises:
Steps:       ← only when 4+ logically distinct stages
Note:        ← only when genuinely needed
See Also:    ← only when returning a custom type
```

### Summary Line

- Imperative verb, one sentence, no trailing period
- States what the **function does** — not what it accepts or what the return type contains
- Never enumerate accepted input types in the summary
- Never use implementation terms: "resolved", "recursive", "dispatched", "decision tree", "primitive"
- Never mention internal paths, execution strategy, or return model fields

### Args

- No type annotation — it lives in the signature
- Double backticks for inline values: `None`, `"strict"`
- Describe constraints, accepted values, and what `None` means behaviourally
- **Omit entirely when all params are self-explanatory** (e.g. `db`, `username`, `id`)
- **Literal / mode params** — compact arrow notation on one line:
  `"value"` (default) does X; `"name"` → does Y; `"keep"` → passes through
  Never wrap across 3+ lines
- **8+ parameters** — keep each entry to one line; prefer arrow notation over prose

### Returns

- One line — name the return type, then a **caller-value phrase**
- **Never describe how the value was produced** — no "resolved", "recursed", "serialized"
- **Never list the return type's own fields** — that belongs in the class docstring
- Pattern for custom types: `A :class:`ReturnType` describing <one-phrase caller outcome>.`
- Pattern for built-ins: `A plain Python ``dict``/``list``/``str`` <one-phrase caller outcome>.`
- If returning a custom type → add `See Also:` pointing to that class

### Raises

- Public-contract exceptions only — ones the caller must handle
- Never document internal failures or exceptions callers cannot act on
- Format: `ExceptionType: When <condition in caller's terms>.`

### Steps

- Only when function has **4+ logically distinct stages** — skip for simple functions
- Active verb first: Normalize / Check / Fetch / Build / Store / Return / Catch
- Follow actual execution order in code
- Group logically related lines into one step — not one step per line
- try/except MAY split into two steps if they serve clearly distinct purposes
- Do NOT invent steps not in the code
- Do NOT write pseudocode
- For TTL/cache checks: explain condition in plain English
  e.g. "expires_at <= now → entry has lived past its TTL, treat as missing"
- For async thread offload: state what is offloaded and WHY
- For exception handling: state what is caught and what is returned/raised

### Note

- Only when the contract cannot be inferred from Returns + Raises combined
- If the Note restates either section → omit
- One sentence maximum

### See Also

- Delegate return-type schema documentation here via cross-references
- Pattern: `:class:`ReturnType`: Field schema and status values.`

---

## Private Functions and Classes

For any item whose name starts with `_`:

- **Functions**: single-line only — `"""What it does: <one sentence>"""`
- **Classes / dataclasses**: single-line only — `"""What it does: <one sentence>"""`
- No Args / Returns / Attributes / Steps / Notes block needed

---

## The One Rule Behind All Others

Every section documents **this function/class**.
Anything that documents the return type, the execution path, or internal state belongs somewhere else.

---

## What Triggers a Deduction

| Mistake                                                      | Root Cause                                             |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| Returns listing internal fields                              | Documenting the return type inside the function        |
| Summary enumerating accepted input types                     | Input catalog instead of purpose statement             |
| Summary using implementation terms ("resolved", "recursive") | Implementation language in caller-facing summary       |
| Returns describing how value was produced                    | Execution narrative instead of caller-value outcome    |
| Note saying "X path / Y path"                                | Exposing internal execution architecture               |
| Note restating Returns + Raises                              | Duplication with no added contract                     |
| Module docstring listing capabilities                        | Implementation catalog instead of public purpose       |
| Class docstring missing Literal field values                 | Caller cannot know the contract without reading source |
| Literal param wrapped across 3+ lines                        | Violates compact arrow-notation rule                   |
| Attributes block skipping any field                          | Incomplete schema; all fields must appear              |
| Steps on a ≤3-stage function                                 | Over-documentation; omit Steps                         |
| Args block documenting db / username / id                    | Obvious params; omit Args block                        |
| Example block added anywhere                                 | Not used in these rules — remove                       |
