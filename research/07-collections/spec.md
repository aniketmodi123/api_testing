# Spec — Collections

STATUS: Partial
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_0_platform_hardening/spec.md

## Goal

Provide a hierarchical structure (folders and requests) for organizing, documenting, and sharing API requests.

## Backend (shipped)

The backend supports node creation (folders, requests), moving nodes, and bulk import. The `Node` model can support collection-level variables via a related table.

## Frontend (Partial)

The basic tree view for collections is implemented. The UI for managing collection-specific variables and granular sharing is missing.

---

## 4. Frontend Specification (Gap Fill)

This section specifies the UI for the missing collection features.

### 4.1. Component Breakdown

| Component                  | Props              | Renders                                                                                                                                                    | API Calls & State                                                     |
| :------------------------- | :----------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| `CollectionEditorTabs`     | `{ collectionId }` | A set of tabs within the collection view (e.g., "Authorization", "Variables", "Tests").                                                                    | Manages the active tab state.                                         |
| `CollectionVariablesPanel` | `{ collectionId }` | A key-value editor table for managing variables scoped to the collection. Identical in function to the Environment variables editor.                       | `GET /collections/{id}/variables`, `PUT /collections/{id}/variables`. |
| `ShareCollectionModal`     | `{ collectionId }` | A modal for sharing a single collection. It includes a field to invite users by email and a dropdown to assign a role (Viewer/Editor) for that collection. | `POST /collections/{id}/share`.                                       |

### 4.2. State Shape (Redux/Store)

```javascript
{
  "collections": {
    "byId": {
      "coll-1": {
        "variables": { "baseUrl": "https://api.example.com" },
        "permissions": [
          { "user": "bob@example.com", "role": "editor" }
        ]
      }
    }
  }
}
```

### 4.3. UX Decisions from Research

- **Consistent UI:** The `CollectionVariablesPanel` should look and feel identical to the existing Environment variables editor to reduce cognitive load.
- **Granular Permissions:** The `ShareCollectionModal` is the entry point to a significant backend feature. The backend will need a new permissions model that links `(user_id, collection_id, role)` to enable this.

## Gaps Found

- **FE:** A `CollectionVariablesPanel` UI is needed to expose the existing backend capability.
- **FE/BE:** The entire feature for sharing a single collection with specific users (granular permissions) is missing. This requires a new sharing UI and a significant backend permissions model update.
