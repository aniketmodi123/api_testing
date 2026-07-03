# Spec — Testing (Assertions + Validation)

STATUS: Partial
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_0_platform_hardening/spec.md, phases/phase_7_contract_testing/spec.md

## Goal

Validate the correctness of API responses by defining and running assertions against status codes, headers, and body content.

## Backend (shipped)

The backend has a robust declarative assertion engine that processes a JSON `expected` block against a response.

## Frontend (Partial)

The frontend displays test results but lacks a UI for creating or editing the assertions themselves.

---

## 4. Frontend Specification (Gap Fill)

This section specifies the UI for an `AssertionBuilder` to make the declarative model user-friendly.

### 4.1. Component Breakdown

| Component               | Props                                | Renders                                                                                                                                                                                                        | API Calls & State                               |
| :---------------------- | :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------- |
| `AssertionBuilderPanel` | `{ assertions, onAssertionsChange }` | The main UI for building a list of assertions. Contains a list of `AssertionRow` components.                                                                                                                   | Manages the array of assertion objects.         |
| `AssertionRow`          | `{ assertion, onChange, onDelete }`  | A single row representing one assertion. It contains dropdowns to select the source (Status, Body JSONPath, Header) and the assertion type (equals, contains, isGreaterThan, etc.) and an input for the value. | Manages the state of a single assertion object. |
| `AddAssertionButton`    | `{ onAdd }`                          | A button that adds a new, empty `AssertionRow` to the panel.                                                                                                                                                   | Triggers state change in the parent.            |

### 4.2. State Shape (Local Component State)

The state is the JSON object for the `expected` block, managed by the `AssertionBuilderPanel`.

```javascript
// State managed by the AssertionBuilderPanel
const [assertions, setAssertions] = useState({
  status: 200,
  json: {
    checks: [
      { path: 'data.id', present: true },
      { path: 'data.name', equals: 'Example' },
    ],
  },
});
```

### 4.4. UX Decisions from Research

- **Guided Creation:** The UI should guide the user. Selecting "Body JSONPath" as the source should reveal a text input for the path and then another dropdown for the comparison operator.
- **Declarative, Not Code:** The builder should output the assertion JSON, not JavaScript. This maintains APIPilot's core design choice while improving usability.
- **Inspiration from Postman Snippets:** While we are not using JS, the idea of Postman's test snippets is a good UX pattern. The `AddAssertionButton` could be a dropdown with common presets like "Assert status is 200" or "Assert response time is below 200ms".

## Gaps Found

- **FE:** The entire UI for building declarative assertions (`AssertionBuilderPanel`) is missing. Without it, users must write the assertion JSON by hand, which is a significant usability issue.
