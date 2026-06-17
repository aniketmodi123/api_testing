# Spec — Authentication

STATUS: Complete
LAST_CHANGED: 2026-06-16
SOURCE: phases/phase_3_auth_helpers/spec.md

## Goal

Provide a comprehensive set of authentication helpers to simplify configuring and managing credentials for API requests.

## Backend (shipped)

The backend primarily resolves variables and passes auth data to the request engine. A key missing piece is an endpoint to facilitate the OAuth 2.0 redirect flow.

## Frontend (Partial)

The basic auth helpers (API Key, Bearer, Basic) are implemented. The interactive OAuth 2.0 helper is missing.

---

## 4. Frontend Specification (Gap Fill)

This section specifies the UI for the interactive OAuth 2.0 helper.

### 4.1. Component Breakdown

| Component            | Props                       | Renders                                                                                                                                  | API Calls & State                                                                                                      |
| :------------------- | :-------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| `AuthMethodSelector` | `{ onSelect, currentAuth }` | The main dropdown in the "Authorization" tab to select the auth type (Bearer, OAuth 2.0, etc.).                                          | Manages local state for the selected method.                                                                           |
| `OAuth2HelperPanel`  | `{ auth, onAuthChange }`    | A detailed form for configuring an OAuth 2.0 flow. It includes fields for Grant Type, Auth URL, Token URL, Client ID/Secret, Scope, etc. | Manages the form state.                                                                                                |
| `GetTokenButton`     | `{ config }`                | The button within the `OAuth2HelperPanel` that initiates the token acquisition flow.                                                     | This is a complex component. On click, it will open a new browser window pointing to the configured Authorization URL. |

### 4.2. State Shape (Redux/Store)

The tokens acquired through the helper should be stored as part of the environment or collection variables.

```javascript
{
  "environments": {
    "byId": {
      "env-1": {
        "variables": {
          "access_token": "ey...",
          "refresh_token": "def..."
        }
      }
    }
  }
}
```

### 4.3. UX Decisions from Research

- **Guided Flow:** The `OAuth2HelperPanel` must clearly label all the required fields for the selected grant type.
- **Token Management:** Once a token is fetched, the UI should show its details (and when it expires) and provide buttons to "Use Token" (which applies it to the request headers) and "Refresh Token".
- **Seamless Experience:** The process of opening a new window for authorization and automatically receiving the token back in the app is the core UX. This requires a backend endpoint to act as the `redirect_uri` and temporarily store the authorization code before the frontend retrieves it.

## Gaps Found

- **FE/BE:** The entire interactive OAuth 2.0 Authorization Code and Implicit grant flow helpers are missing. This requires a new `GET /oauth2/callback` endpoint on the backend and a complex `OAuth2HelperPanel` on the frontend.
