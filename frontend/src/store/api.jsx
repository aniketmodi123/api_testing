/**
 * What this file does: Provides the legacy ApiProvider wrapper kept only for main.jsx;
 * all API/test-case server state now lives in RTK Query (store/apiSlice.js).
 */

// Server state (api records, test cases, run results) moved to RTK Query — see
// store/apiSlice.js. The old Zustand `useApi` store and its apiCache/testCaseCache
// were removed in the store-consolidation refactor; components now use the generated
// RTK hooks (useGetApiQuery, useSaveApiMutation, useRunTestMutation, …) directly.

/**
 * What it does: Renders children unchanged; retained so main.jsx's existing
 * <ApiProvider> wrapper keeps working after the store consolidation.
 */
export const ApiProvider = ({ children }) => children;

export default ApiProvider;
