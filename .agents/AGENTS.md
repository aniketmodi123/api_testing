# Workspace Agent Rules

## ApiPilot Testing Boundaries & Constraints

### 1. Direct Database Access Prohibition (Strict Boundary)
*   **Prohibition:** The agent is strictly prohibited from executing raw database queries, writing SQL scripts, or attempting direct database access/inspection (such as writing Python scripts to connect to PostgreSQL/Aiven/local DB).
*   **API Boundary Only:** The agent must operate entirely at the API layer. It is only allowed to read API handler code, FastAPI schemas, routers, request bodies, query parameters, and response models.
*   **Failed Assertions / Access Errors:** If a test case fails due to a database-state error (e.g., `409` user has no access, or `206` record not found), the agent must not try to modify the DB. Instead, it must report the mismatch to the user and request updated mock/sample data or configuration.

### 2. Strict Sample Data Collection & Verification
*   **Read Sample File First:** At the start of any testing session, the agent must check for the existence of `apipilot.sample_data.json` at the target project root.
*   **Batched Value Collection Form:** For any unguessable database identifiers (such as `project_id`, `feeder_id`, `site_id`, `sc_no`), the agent must compile a single, consolidated list of needed keys.
*   **Do Not Guess or Use Placeholders:** The agent is strictly forbidden from guessing IDs, hardcoding mock IDs (like `123`, `test-id`), or using arbitrary values for unguessable parameters.
*   **Strict User Confirmation:** The agent must present the consolidated form to the user and ask for valid, live database identifiers before writing or running any test cases.
*   **Persistence:** The user's input must be written immediately to `apipilot.sample_data.json` under the active project/scope key so it persists across runs, sessions, and systems.
