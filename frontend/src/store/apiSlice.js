import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { unwrapBackendResponse } from './unwrapResponse';
import { API_BASE, getAuthHeaders } from '../api';

// Base query with auth headers and response transformation
const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE,
  prepareHeaders: headers => {
    // Always add accept header
    headers.set('accept', 'application/json');

    // Add ngrok warning bypass headers if using ngrok
    const requestUrl = headers.get('x-request-url') || API_BASE;
    if (requestUrl.includes('ngrok') || API_BASE.includes('ngrok')) {
      headers.set('ngrok-skip-browser-warning', 'true');
      headers.set('User-Agent', 'API-Testing-Tool/1.0');
    }

    // Apply the shared auth headers (single source — see getAuthHeaders in api.js).
    const { Authorization, username } = getAuthHeaders();
    if (Authorization) headers.set('authorization', Authorization);
    if (username) headers.set('username', username);

    // Add workspace ID header from localStorage if available
    const activeWorkspaceId = localStorage.getItem('activeWorkspaceId');
    if (activeWorkspaceId) {
      headers.set('workspace-id', activeWorkspaceId);
    }

    // Add content-type for POST/PUT requests
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return headers;
  },
});

// Wrapper to unwrap the standard backend response envelope.
const baseQueryWithTransform = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);
  return unwrapBackendResponse(result, args.url || args);
};

// Base query with auth handling and error processing
const baseQueryWithAuth = async (args, api, extraOptions) => {
  let result = await baseQueryWithTransform(args, api, extraOptions);

  // Handle 401 errors - clear localStorage and force logout
  if (result.error && result.error.status === 401) {
    // Skip auth refresh handling for specific requests
    const skipAuthRefresh = args._skipAuthRefresh === true;
    const alreadyOnSignIn = window.location.pathname === '/sign-in';

    if (!skipAuthRefresh && !alreadyOnSignIn) {
      console.log('🔒 401 Unauthorized - clearing auth state');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.clear();
      sessionStorage.clear();

      // Redirect to sign-in
      window.location.href = '/sign-in';
    }
  }

  return result;
};

// Shape a raw api record the way editor consumers expect.
// Mirrors store/api.jsx normalizeApi so the migrated cache matches the old one.
const normalizeApi = api =>
  api && typeof api === 'object'
    ? {
        ...api,
        method: api.method || 'GET',
        url: api.url || api.endpoint || '',
        description: api.description || '',
        headers: api.headers || {},
      }
    : api;

// Editor reads a file's api record AND its test cases from ONE getApi cache entry.
// Test-case mutations patch this same entry — no separate test-case cache to reconcile.
const apiArg = fileId => ({ fileId, includeCases: true });

// Map one raw case-result shape (backends differ) into the unified row the runner UI reads.
const mapRunCase = (tc, index = 0) => ({
  id: tc?.id ?? tc?.case_id ?? index,
  name: tc?.name ?? tc?.case ?? `Test Case ${index + 1}`,
  passed: Boolean(tc?.passed ?? tc?.ok ?? tc?.success ?? false),
  failures: Array.isArray(tc?.failures)
    ? tc.failures
    : tc?.error
      ? [tc.error]
      : [],
  status_code:
    tc?.status_code ?? tc?.status ?? tc?.response?.status_code ?? null,
  duration_ms: tc?.duration_ms ?? tc?.duration ?? tc?.execution_time ?? null,
  request: tc?.request ?? null,
  response: tc?.response ?? (tc?.json ? { json: tc.json } : null),
  raw: tc,
});

// Normalize the /run payload (array, { test_cases }, or single object) into
// { test_cases: [...] } — the shape RequestPanel/TestRunner consume.
const normalizeRunResult = data => {
  if (!data) return data;
  if (Array.isArray(data)) {
    return { test_cases: data.map((tc, idx) => mapRunCase(tc, idx)) };
  }
  if (data.test_cases) {
    return {
      ...data,
      test_cases: (data.test_cases || []).map((tc, idx) => mapRunCase(tc, idx)),
    };
  }
  const single = mapRunCase(
    {
      case_id: data.case_id,
      name: data.name || data.case || 'Single Test Execution',
      response: data.response || data.body,
      passed: data.passed,
      error: data.error,
      status_code: data.status_code,
      duration: data.execution_time || data.duration,
    },
    0
  );
  return { test_cases: [single] };
};

// Patch the cached file view's test_cases list in place. No-op if the file is not
// cached yet (the mutation's invalidatesTag then covers the refetch).
const patchCases = (dispatch, fileId, recipe) =>
  dispatch(
    apiSlice.util.updateQueryData('getApi', apiArg(fileId), draft => {
      if (!draft) return;
      if (!Array.isArray(draft.test_cases)) draft.test_cases = [];
      recipe(draft.test_cases);
    })
  );

// Create the API slice
export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Workspace', 'User', 'Environment', 'Variable', 'Node', 'ApiCase', 'Header', 'GlobalVariable', 'BulkTestSchedule', 'BulkTestExecution', 'ScheduleAlert', 'WorkspaceMember', 'CollectionVariable'],
  endpoints: builder => ({
    // Authentication endpoints
    signIn: builder.mutation({
      query: ({ email, password }) => ({
        url: '/sign_in',
        method: 'POST',
        body: { email, password },
      }),
      invalidatesTags: ['User'],
    }),

    signUp: builder.mutation({
      query: ({ email, password }) => ({
        url: '/sign_up',
        method: 'POST',
        body: { email, password },
      }),
    }),

    logout: builder.mutation({
      query: () => ({
        url: '/logout',
        method: 'DELETE',
        _skipAuthRefresh: true,
      }),
      invalidatesTags: ['User'],
    }),

    getUserProfile: builder.query({
      query: () => '/me',
      providesTags: ['User'],
    }),

    updateUserProfile: builder.mutation({
      query: userData => ({
        url: '/update_user',
        method: 'PUT',
        body: userData,
      }),
      invalidatesTags: ['User'],
    }),

    deleteUser: builder.mutation({
      query: () => ({
        url: '/delete_user',
        method: 'DELETE',
      }),
      invalidatesTags: ['User'],
    }),

    changePassword: builder.mutation({
      query: ({ oldPassword, newPassword, confirmPassword }) => ({
        url: '/change-password',
        method: 'POST',
        body: {
          old_password: oldPassword,
          new_password: newPassword,
          new_password_again: confirmPassword,
        },
      }),
      invalidatesTags: ['User'],
    }),

    requestPasswordReset: builder.mutation({
      query: ({ email }) => ({
        url: '/send-otp',
        method: 'POST',
        body: { email },
      }),
    }),

    resetPassword: builder.mutation({
      query: ({ email, otp, newPassword, confirmPassword }) => ({
        url: '/forgot-password',
        method: 'POST',
        body: {
          email,
          otp: Number(otp),
          new_password: newPassword,
          new_password_again: confirmPassword,
        },
      }),
    }),

    // Workspace CRUD lives in workspaceService + store/workspace.jsx (single source).
    // RTK-Query workspace endpoints were removed — they had no callers.

    // Node operations
    moveNode: builder.mutation({
      query: ({ nodeId, targetWorkspaceId, targetFolderId, newName }) => ({
        url: `/node/${nodeId}/move`,
        method: 'POST',
        body: {
          target_workspace_id: targetWorkspaceId,
          target_folder_id: targetFolderId,
          new_name: newName,
        },
      }),
      invalidatesTags: ['Workspace', 'Node'],
    }),

    copyNode: builder.mutation({
      query: ({ nodeId, targetWorkspaceId, targetFolderId, newName }) => ({
        url: `/node/${nodeId}/copy`,
        method: 'POST',
        body: {
          target_workspace_id: targetWorkspaceId,
          target_folder_id: targetFolderId,
          new_name: newName,
        },
      }),
      invalidatesTags: ['Workspace', 'Node'],
    }),

    // Environment endpoints
    getEnvironments: builder.query({
      query: workspaceId =>
        `/environment/workspace/${workspaceId}/environments`,
      transformResponse: response => {
        console.log('getEnvironments raw response:', response);
        // Handle the specific structure: { response_code: 200, data: { environments: [...] } }
        if (response && typeof response === 'object' && 'data' in response) {
          const data = response.data;
          // If data has environments array, return it
          if (data && typeof data === 'object' && 'environments' in data) {
            return data.environments;
          }
          // Otherwise return data as is
          return data;
        }
        // If response is already an array or direct data, return as is
        return response;
      },
      providesTags: result => [
        { type: 'Environment', id: 'LIST' },
        ...(Array.isArray(result)
          ? result
              .filter(env => env && env.id != null)
              .map(env => ({ type: 'Environment', id: env.id }))
          : []),
      ],
    }),

    createEnvironment: builder.mutation({
      query: ({ workspaceId, ...environmentData }) => ({
        url: `/environment/workspace/${workspaceId}/environments`,
        method: 'POST',
        body: environmentData,
      }),
      transformResponse: response => {
        console.log('createEnvironment raw response:', response);
        // If response is wrapped in a data property, unwrap it
        if (response && typeof response === 'object' && 'data' in response) {
          return response.data;
        }
        return response;
      },
      invalidatesTags: () => [{ type: 'Environment', id: 'LIST' }],
    }),

    updateEnvironment: builder.mutation({
      query: ({ workspaceId, environmentId, ...environmentData }) => ({
        url: `/environment/workspace/${workspaceId}/environments/${environmentId}`,
        method: 'PUT',
        body: environmentData,
      }),
      transformResponse: response => {
        console.log('updateEnvironment raw response:', response);
        // If response is wrapped in a data property, unwrap it
        if (response && typeof response === 'object' && 'data' in response) {
          return response.data;
        }
        return response;
      },
      invalidatesTags: (result, error, { environmentId }) => [
        { type: 'Environment', id: environmentId },
      ],
    }),

    deleteEnvironment: builder.mutation({
      query: ({ workspaceId, environmentId }) => ({
        url: `/environment/workspace/${workspaceId}/environments/${environmentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { environmentId }) => [
        { type: 'Environment', id: environmentId },
        { type: 'Environment', id: 'LIST' },
      ],
    }),

    getEnvironmentVariables: builder.query({
      query: ({ workspaceId, environmentId }) =>
        `/environment/workspace/${workspaceId}/environments/${environmentId}/variables`,
      transformResponse: response => {
        console.log('getEnvironmentVariables raw response:', response);

        // Handle "no variables found" case (response_code: 206)
        if (
          response &&
          response.response_code === 206 &&
          response.error_message === 'No variables found for this environment'
        ) {
          console.log(
            'getEnvironmentVariables: No variables found, returning empty object'
          );
          return {};
        }

        // Handle the specific structure: { response_code: 200, data: { variables: {...} } }
        if (response && typeof response === 'object' && 'data' in response) {
          const data = response.data;
          console.log('getEnvironmentVariables unwrapped data:', data);
          // If data has variables object, return it
          if (data && typeof data === 'object' && 'variables' in data) {
            console.log(
              'getEnvironmentVariables extracted variables:',
              data.variables
            );
            return data.variables;
          }
          // Otherwise return data as is
          return data;
        }
        // If response is already data, return as is
        console.log('getEnvironmentVariables direct response:', response);
        return response;
      },
      providesTags: (result, error, { environmentId }) => [
        { type: 'Variable', id: environmentId },
      ],
    }),

    saveEnvironmentVariables: builder.mutation({
      query: ({ workspaceId, environmentId, variables }) => ({
        url: `/environment/workspace/${workspaceId}/environments/${environmentId}/variables`,
        method: 'POST',
        body: { variables },
      }),
      transformResponse: response => {
        console.log('saveEnvironmentVariables raw response:', response);
        // If response is wrapped in a data property, unwrap it
        if (response && typeof response === 'object' && 'data' in response) {
          return response.data;
        }
        return response;
      },
      invalidatesTags: (result, error, { environmentId }) => [
        { type: 'Variable', id: environmentId },
      ],
    }),

    deleteEnvironmentVariable: builder.mutation({
      query: ({ workspaceId, environmentId, variableId }) => ({
        url: `/environment/workspace/${workspaceId}/environments/${environmentId}/variables/${variableId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { environmentId }) => [
        { type: 'Variable', id: environmentId },
      ],
    }),

    // API Management endpoints
    listApis: builder.query({
      query: (filters = {}) => ({
        url: '/api/list',
        params: filters,
      }),
      providesTags: result => {
        const items = Array.isArray(result)
          ? result
          : Array.isArray(result?.items)
            ? result.items
            : Array.isArray(result?.data)
              ? result.data
              : [];
        return [
          { type: 'ApiCase', id: 'LIST' },
          ...items
            .filter(item => item && item.id != null)
            .map(item => ({ type: 'ApiCase', id: item.id })),
        ];
      },
    }),

    getApi: builder.query({
      query: ({ fileId, includeCases = false }) => ({
        url: `/file/${fileId}/api`,
        params: { include_cases: includeCases },
      }),
      // Normalize the api record (method/url/headers defaults) while keeping
      // the test_cases list spread in — matches the old Zustand cache shape.
      transformResponse: data => normalizeApi(data),
      providesTags: (result, error, { fileId }) => [
        { type: 'ApiCase', id: fileId },
      ],
    }),

    createApi: builder.mutation({
      query: ({ fileId, ...apiData }) => ({
        url: `/file/${fileId}/api`,
        method: 'POST',
        body: apiData,
      }),
      // Cache-from-response: seed the file view from the created entity, no follow-up GET.
      async onQueryStarted({ fileId }, { dispatch, queryFulfilled }) {
        try {
          const { data: saved } = await queryFulfilled;
          if (!saved) return;
          dispatch(
            apiSlice.util.updateQueryData('getApi', apiArg(fileId), draft => {
              Object.assign(draft, normalizeApi(saved));
            })
          );
        } catch {
          /* invalidatesTags refetch covers the failure path */
        }
      },
      invalidatesTags: (result, error, { fileId }) => [
        { type: 'ApiCase', id: fileId },
        { type: 'ApiCase', id: 'LIST' },
      ],
    }),

    saveApi: builder.mutation({
      query: ({ fileId, ...apiData }) => ({
        url: `/file/${fileId}/api/save`,
        method: 'POST',
        body: apiData,
      }),
      // Cache-from-response: patch the file view from the saved entity. Object.assign
      // preserves draft.test_cases (saveApi does not change test cases).
      async onQueryStarted({ fileId }, { dispatch, queryFulfilled }) {
        try {
          const { data: saved } = await queryFulfilled;
          if (!saved) return;
          dispatch(
            apiSlice.util.updateQueryData('getApi', apiArg(fileId), draft => {
              Object.assign(draft, normalizeApi(saved));
            })
          );
        } catch {
          /* invalidatesTags refetch covers the failure path */
        }
      },
      invalidatesTags: (result, error, { fileId }) => [
        { type: 'ApiCase', id: fileId },
      ],
    }),

    updateApi: builder.mutation({
      query: ({ apiId, ...apiData }) => ({
        url: `/api/${apiId}`,
        method: 'PUT',
        body: apiData,
      }),
      // Cache-from-response when the caller passes fileId (knows the cache entry to patch).
      async onQueryStarted({ fileId }, { dispatch, queryFulfilled }) {
        if (fileId == null) return;
        try {
          const { data: saved } = await queryFulfilled;
          if (!saved) return;
          dispatch(
            apiSlice.util.updateQueryData('getApi', apiArg(fileId), draft => {
              Object.assign(draft, normalizeApi(saved));
            })
          );
        } catch {
          /* invalidatesTags refetch covers the failure path */
        }
      },
      // fileId is optional; when callers pass it we invalidate the parent
      // file view (getApi id:fileId), else fall back to the api record id.
      invalidatesTags: (result, error, { apiId, fileId }) => [
        { type: 'ApiCase', id: fileId ?? apiId },
      ],
    }),

    deleteApi: builder.mutation({
      query: apiId => ({
        url: `/api/${apiId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, apiId) => [
        { type: 'ApiCase', id: apiId },
        { type: 'ApiCase', id: 'LIST' },
      ],
    }),

    // Test Case endpoints
    createTestCase: builder.mutation({
      query: ({ fileId, ...testCaseData }) => ({
        url: `/file/${fileId}/api/cases`,
        method: 'POST',
        body: testCaseData,
      }),
      // Optimistic insert under a temp id; reconcile with the saved row on success.
      async onQueryStarted(
        { fileId, ...testCaseData },
        { dispatch, queryFulfilled }
      ) {
        const tempId = `optimistic-${Date.now()}`;
        const patch = patchCases(dispatch, fileId, cases =>
          cases.push({ ...testCaseData, id: tempId })
        );
        try {
          const { data: saved } = await queryFulfilled;
          if (saved) {
            patchCases(dispatch, fileId, cases => {
              const i = cases.findIndex(tc => tc.id === tempId);
              if (i >= 0) cases[i] = saved;
            });
          } else {
            patch.undo();
          }
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (result, error, { fileId }) => [
        { type: 'ApiCase', id: fileId },
        { type: 'ApiCase', id: 'LIST' },
      ],
    }),

    bulkCreateTestCases: builder.mutation({
      query: ({ fileId, testCases }) => ({
        url: `/file/${fileId}/api/cases/bulk`,
        method: 'POST',
        body: { test_cases: testCases },
      }),
      // Optimistic insert of the whole batch under temp ids; on success drop the
      // temp rows and append the server-created rows.
      async onQueryStarted(
        { fileId, testCases },
        { dispatch, queryFulfilled }
      ) {
        const optimistic = testCases.map((tc, idx) => ({
          ...tc,
          id: `optimistic-${Date.now()}-${idx}`,
        }));
        const tempIds = new Set(optimistic.map(tc => tc.id));
        const patch = patchCases(dispatch, fileId, cases =>
          cases.push(...optimistic)
        );
        try {
          const { data: saved } = await queryFulfilled;
          const created = saved?.created;
          if (Array.isArray(created)) {
            patchCases(dispatch, fileId, cases => {
              const kept = cases.filter(tc => !tempIds.has(tc.id));
              cases.length = 0;
              cases.push(...kept, ...created);
            });
          } else {
            patch.undo();
          }
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (result, error, { fileId }) => [
        { type: 'ApiCase', id: fileId },
        { type: 'ApiCase', id: 'LIST' },
      ],
    }),

    saveTestCase: builder.mutation({
      query: ({ fileId, caseId, ...testCaseData }) => {
        const url = caseId
          ? `/file/${fileId}/api/cases/save?case_id=${caseId}`
          : `/file/${fileId}/api/cases/save`;

        return {
          url,
          method: 'POST',
          body: testCaseData,
        };
      },
      // Optimistic: edit merges into the matched row, create inserts a temp row;
      // both reconcile with the saved entity by id on success.
      async onQueryStarted(
        { fileId, caseId, ...testCaseData },
        { dispatch, queryFulfilled }
      ) {
        const tempId = `optimistic-${Date.now()}`;
        const patch = patchCases(dispatch, fileId, cases => {
          if (caseId) {
            const i = cases.findIndex(tc => tc.id === caseId);
            if (i >= 0) cases[i] = { ...cases[i], ...testCaseData };
          } else {
            cases.push({ ...testCaseData, id: tempId });
          }
        });
        try {
          const { data: saved } = await queryFulfilled;
          if (saved) {
            const matchId = caseId ?? tempId;
            patchCases(dispatch, fileId, cases => {
              const i = cases.findIndex(tc => tc.id === matchId);
              if (i >= 0) cases[i] = saved;
            });
          } else {
            patch.undo();
          }
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (result, error, { fileId, caseId }) =>
        caseId
          ? [
              { type: 'ApiCase', id: fileId },
              { type: 'ApiCase', id: caseId },
            ]
          : [
              { type: 'ApiCase', id: fileId },
              { type: 'ApiCase', id: 'LIST' },
            ],
    }),

    getTestCase: builder.query({
      query: caseId => `/case/${caseId}`,
      providesTags: (result, error, caseId) => [
        { type: 'ApiCase', id: caseId },
      ],
    }),

    getTestCaseDetails: builder.query({
      query: caseId => `/case/${caseId}`,
      providesTags: (result, error, caseId) => [
        { type: 'ApiCase', id: caseId },
      ],
    }),

    updateTestCase: builder.mutation({
      // fileId is a cache-targeting arg only — strip it from the request body.
      // eslint-disable-next-line no-unused-vars
      query: ({ caseId, fileId, ...testCaseData }) => ({
        url: `/api/cases/${caseId}`,
        method: 'PUT',
        body: testCaseData,
      }),
      // Optimistic merge into the matched row; reconcile with the saved entity.
      // Requires fileId to locate the cache entry (caller passes the active file).
      async onQueryStarted(
        { caseId, fileId, ...testCaseData },
        { dispatch, queryFulfilled }
      ) {
        if (fileId == null) return;
        const patch = patchCases(dispatch, fileId, cases => {
          const i = cases.findIndex(tc => tc.id === caseId);
          if (i >= 0) cases[i] = { ...cases[i], ...testCaseData };
        });
        try {
          const { data: saved } = await queryFulfilled;
          if (saved) {
            patchCases(dispatch, fileId, cases => {
              const i = cases.findIndex(tc => tc.id === caseId);
              if (i >= 0) cases[i] = saved;
            });
          } else {
            patch.undo();
          }
        } catch {
          patch.undo();
        }
      },
      // fileId is optional; when passed we also refresh the parent file view.
      invalidatesTags: (result, error, { caseId, fileId }) =>
        fileId
          ? [
              { type: 'ApiCase', id: fileId },
              { type: 'ApiCase', id: caseId },
            ]
          : [{ type: 'ApiCase', id: caseId }],
    }),

    deleteTestCase: builder.mutation({
      query: ({ caseId }) => ({
        url: `/case/${caseId}`,
        method: 'DELETE',
      }),
      // Optimistic removal; restore the row if the server rejects. Requires fileId
      // to locate the cache entry (caller passes the active file).
      async onQueryStarted({ caseId, fileId }, { dispatch, queryFulfilled }) {
        if (fileId == null) return;
        const patch = patchCases(dispatch, fileId, cases => {
          const i = cases.findIndex(tc => tc.id === caseId);
          if (i >= 0) cases.splice(i, 1);
        });
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (result, error, { caseId, fileId }) =>
        fileId
          ? [
              { type: 'ApiCase', id: fileId },
              { type: 'ApiCase', id: caseId },
              { type: 'ApiCase', id: 'LIST' },
            ]
          : [
              { type: 'ApiCase', id: caseId },
              { type: 'ApiCase', id: 'LIST' },
            ],
    }),

    bulkDeleteTestCases: builder.mutation({
      query: ({ caseIds }) => ({
        url: '/cases/bulk',
        method: 'DELETE',
        body: caseIds,
      }),
      // Optimistic removal of the batch; restore all rows if the server rejects.
      // Requires fileId to locate the cache entry (caller passes the active file).
      async onQueryStarted({ caseIds, fileId }, { dispatch, queryFulfilled }) {
        if (fileId == null) return;
        const ids = new Set(caseIds);
        const patch = patchCases(dispatch, fileId, cases => {
          const kept = cases.filter(tc => !ids.has(tc.id));
          cases.length = 0;
          cases.push(...kept);
        });
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (result, error, { fileId }) =>
        fileId
          ? [
              { type: 'ApiCase', id: fileId },
              { type: 'ApiCase', id: 'LIST' },
            ]
          : [{ type: 'ApiCase', id: 'LIST' }],
    }),

    // Test execution
    runTest: builder.mutation({
      query: ({ fileId, caseId = null }) => {
        // Backend expects case_id as Optional[list[int]]; coerce any scalar
        // caller (e.g. per-card Run button) into a list, null runs all cases.
        let case_id = null;
        if (Array.isArray(caseId)) {
          case_id = caseId;
        } else if (caseId != null) {
          case_id = [caseId];
        }
        return {
          url: '/run',
          method: 'POST',
          body: {
            file_id: fileId,
            case_id,
          },
        };
      },
      // Unify the differing backend shapes into { test_cases: [...] } here so every
      // caller reads one normalized result (was store/api.jsx runTest mapCase).
      transformResponse: normalizeRunResult,
    }),

    // Bulk test management
    createBulkTestSchedule: builder.mutation({
      query: ({ scheduleData, username, workspaceId }) => ({
        url: '/schedules',
        method: 'POST',
        body: scheduleData,
        headers: {
          'Content-Type': 'application/json',
          username: username,
          'workspace-id': workspaceId,
        },
      }),
      invalidatesTags: ['BulkTestSchedule'],
    }),

    getBulkTestSchedules: builder.query({
      query: ({ username, workspaceId }) => ({
        url: '/schedules',
        headers: {
          username: username,
          'workspace-id': workspaceId,
        },
      }),
      transformResponse: response => {
        console.log('getBulkTestSchedules raw response:', response);
        // If response is wrapped in a data property, unwrap it
        if (response && typeof response === 'object' && 'data' in response) {
          return response.data;
        }
        // If response is already an array or direct data, return as is
        return response;
      },
      providesTags: ['BulkTestSchedule'],
    }),

    updateBulkTestSchedule: builder.mutation({
      query: ({ scheduleId, scheduleData, username, workspaceId }) => ({
        url: `/schedules/${scheduleId}`,
        method: 'PUT',
        body: scheduleData,
        headers: {
          'Content-Type': 'application/json',
          username: username,
          'workspace-id': workspaceId,
        },
      }),
      invalidatesTags: ['BulkTestSchedule'],
    }),

    deleteBulkTestSchedule: builder.mutation({
      query: ({ scheduleId, username }) => ({
        url: `/schedules/${scheduleId}`,
        method: 'DELETE',
        headers: {
          username: username,
        },
      }),
      invalidatesTags: ['BulkTestSchedule'],
    }),

    getBulkTestExecutions: builder.query({
      query: ({ scheduleId, username }) => ({
        url: `/schedules/${scheduleId}/executions`,
        headers: {
          username: username,
        },
      }),
      transformResponse: response => {
        console.log('getBulkTestExecutions raw response:', response);
        // If response is wrapped in a data property, unwrap it
        if (response && typeof response === 'object' && 'data' in response) {
          return response.data;
        }
        // If response is already an array or direct data, return as is
        return response;
      },
      providesTags: (result, error, { scheduleId }) => [
        { type: 'BulkTestExecution', id: scheduleId },
      ],
    }),

    getRunningBulkTestExecutions: builder.query({
      query: ({ username, workspaceId }) => ({
        url: '/schedules/executions/running',
        headers: {
          username: username,
          'workspace-id': workspaceId,
        },
      }),
      transformResponse: response => {
        console.log('getRunningBulkTestExecutions raw response:', response);
        // If response is wrapped in a data property, unwrap it
        if (response && typeof response === 'object' && 'data' in response) {
          return response.data;
        }
        // If response is already an array or direct data, return as is
        return response;
      },
      providesTags: ['BulkTestExecution'],
    }),

    deleteBulkTestExecution: builder.mutation({
      query: ({ scheduleId, executionId, username }) => ({
        url: `/schedules/${scheduleId}/executions/${executionId}`,
        method: 'DELETE',
        headers: {
          username: username,
        },
      }),
      invalidatesTags: ['BulkTestExecution'],
    }),

    bulkRunCases: builder.mutation({
      query: ({ type, apis, username }) => ({
        url: '/bulk_run_cases',
        method: 'POST',
        body: {
          type,
          apis,
        },
        headers: {
          'Content-Type': 'application/json',
          username: username,
        },
      }),
    }),

    // Global Variables (Phase 2)
    getGlobalVariables: builder.query({
      query: () => '/variables/global',
      transformResponse: response => Array.isArray(response) ? response : (response?.data ?? []),
      providesTags: ['GlobalVariable'],
    }),

    upsertGlobalVariables: builder.mutation({
      query: (variables) => ({
        url: '/variables/global',
        method: 'POST',
        body: { variables },
      }),
      invalidatesTags: ['GlobalVariable'],
    }),

    deleteGlobalVariable: builder.mutation({
      query: (key) => ({
        url: `/variables/global/${encodeURIComponent(key)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['GlobalVariable'],
    }),

    // Collection Variables
    getCollectionVariables: builder.query({
      query: nodeId => `/node/${nodeId}/variables`,
      transformResponse: response => Array.isArray(response) ? response : (response?.data ?? []),
      providesTags: (result, error, nodeId) => [{ type: 'CollectionVariable', id: nodeId }],
    }),

    upsertCollectionVariables: builder.mutation({
      query: ({ nodeId, variables }) => ({
        url: `/node/${nodeId}/variables`,
        method: 'PUT',
        body: { variables },
      }),
      invalidatesTags: (result, error, { nodeId }) => [{ type: 'CollectionVariable', id: nodeId }],
    }),

    deleteCollectionVariable: builder.mutation({
      query: ({ nodeId, key }) => ({
        url: `/node/${nodeId}/variables/${encodeURIComponent(key)}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { nodeId }) => [{ type: 'CollectionVariable', id: nodeId }],
    }),

    revealCollectionVariable: builder.mutation({
      query: ({ nodeId, key }) => ({
        url: `/node/${nodeId}/variables/${encodeURIComponent(key)}/reveal`,
        method: 'GET',
      }),
    }),

    revealGlobalVariable: builder.mutation({
      query: key => ({
        url: `/variables/global/${encodeURIComponent(key)}/reveal`,
        method: 'GET',
      }),
    }),

    resolvePreview: builder.mutation({
      query: ({ text, file_id, local_context }) => ({
        url: '/resolve/preview',
        method: 'POST',
        body: { text, file_id, local_context: local_context || null },
      }),
    }),

    // Schedule Alerts (Phase 5)
    getScheduleAlerts: builder.query({
      query: ({ scheduleId, username }) => ({
        url: `/schedules/${scheduleId}/alerts`,
        headers: { username },
      }),
      providesTags: (result, error, { scheduleId }) => [{ type: 'ScheduleAlert', id: scheduleId }],
    }),
    createScheduleAlert: builder.mutation({
      query: ({ scheduleId, username, ...body }) => ({
        url: `/schedules/${scheduleId}/alerts`,
        method: 'POST',
        body,
        headers: { username },
      }),
      invalidatesTags: (result, error, { scheduleId }) => [{ type: 'ScheduleAlert', id: scheduleId }],
    }),
    updateScheduleAlert: builder.mutation({
      query: ({ scheduleId, alertId, username, ...body }) => ({
        url: `/schedules/${scheduleId}/alerts/${alertId}`,
        method: 'PUT',
        body,
        headers: { username },
      }),
      invalidatesTags: (result, error, { scheduleId }) => [{ type: 'ScheduleAlert', id: scheduleId }],
    }),
    deleteScheduleAlert: builder.mutation({
      query: ({ scheduleId, alertId, username }) => ({
        url: `/schedules/${scheduleId}/alerts/${alertId}`,
        method: 'DELETE',
        headers: { username },
      }),
      invalidatesTags: (result, error, { scheduleId }) => [{ type: 'ScheduleAlert', id: scheduleId }],
    }),

    // Bulk Import (Phase 3)
    bulkImportNodes: builder.mutation({
      query: ({ workspaceId, items }) => ({
        url: '/node/bulk-import',
        method: 'POST',
        body: { workspace_id: workspaceId, items },
      }),
      invalidatesTags: ['Node', 'Workspace'],
    }),

    // Workspace Collaboration (Phase 6)
    getWorkspaceMembers: builder.query({
      query: workspaceId => `/workspace/${workspaceId}/members`,
      providesTags: (result, error, workspaceId) => [{ type: 'WorkspaceMember', id: workspaceId }],
    }),

    inviteWorkspaceMember: builder.mutation({
      query: ({ workspaceId, email, role }) => ({
        url: `/workspace/${workspaceId}/invite`,
        method: 'POST',
        body: { email, role },
      }),
      invalidatesTags: (result, error, { workspaceId }) => [{ type: 'WorkspaceMember', id: workspaceId }],
    }),

    updateMemberRole: builder.mutation({
      query: ({ workspaceId, userId, role }) => ({
        url: `/workspace/${workspaceId}/members/${userId}`,
        method: 'PUT',
        body: { role },
      }),
      invalidatesTags: (result, error, { workspaceId }) => [{ type: 'WorkspaceMember', id: workspaceId }],
    }),

    removeWorkspaceMember: builder.mutation({
      query: ({ workspaceId, userId }) => ({
        url: `/workspace/${workspaceId}/members/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { workspaceId }) => [{ type: 'WorkspaceMember', id: workspaceId }],
    }),
  }),
});

// Helper function to transform tree structure (moved from workspaceService)
// Export hooks for usage in components
export const {
  // Auth hooks
  useSignInMutation,
  useSignUpMutation,
  useLogoutMutation,
  useGetUserProfileQuery,
  useUpdateUserProfileMutation,
  useDeleteUserMutation,
  useChangePasswordMutation,
  useRequestPasswordResetMutation,
  useResetPasswordMutation,

  // Node hooks
  useMoveNodeMutation,
  useCopyNodeMutation,

  // Environment hooks
  useGetEnvironmentsQuery,
  useCreateEnvironmentMutation,
  useUpdateEnvironmentMutation,
  useDeleteEnvironmentMutation,
  useGetEnvironmentVariablesQuery,
  useSaveEnvironmentVariablesMutation,
  useDeleteEnvironmentVariableMutation,

  // API Management hooks
  useListApisQuery,
  useGetApiQuery,
  useCreateApiMutation,
  useSaveApiMutation,
  useUpdateApiMutation,
  useDeleteApiMutation,

  // Test Case hooks
  useCreateTestCaseMutation,
  useBulkCreateTestCasesMutation,
  useSaveTestCaseMutation,
  useGetTestCaseQuery,
  useGetTestCaseDetailsQuery,
  useUpdateTestCaseMutation,
  useDeleteTestCaseMutation,
  useBulkDeleteTestCasesMutation,
  useRunTestMutation,

  // Bulk Test hooks
  useCreateBulkTestScheduleMutation,
  useGetBulkTestSchedulesQuery,
  useUpdateBulkTestScheduleMutation,
  useDeleteBulkTestScheduleMutation,
  useGetBulkTestExecutionsQuery,
  useLazyGetBulkTestExecutionsQuery,
  useGetRunningBulkTestExecutionsQuery,
  useDeleteBulkTestExecutionMutation,
  useBulkRunCasesMutation,

  // Global Variable hooks (Phase 2)
  useGetGlobalVariablesQuery,
  useUpsertGlobalVariablesMutation,
  useDeleteGlobalVariableMutation,
  useRevealGlobalVariableMutation,

  // Collection Variable hooks
  useGetCollectionVariablesQuery,
  useUpsertCollectionVariablesMutation,
  useDeleteCollectionVariableMutation,
  useRevealCollectionVariableMutation,

  // Resolve preview
  useResolvePreviewMutation,

  // Bulk Import hook (Phase 3)
  useBulkImportNodesMutation,

  // Schedule Alert hooks (Phase 5)
  useGetScheduleAlertsQuery,
  useCreateScheduleAlertMutation,
  useUpdateScheduleAlertMutation,
  useDeleteScheduleAlertMutation,

  // Collaboration hooks (Phase 6)
  useGetWorkspaceMembersQuery,
  useInviteWorkspaceMemberMutation,
  useUpdateMemberRoleMutation,
  useRemoveWorkspaceMemberMutation,
} = apiSlice;
