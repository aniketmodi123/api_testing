import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// Get API base URL from environment
const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://api-testing-2vjt.onrender.com';

// Base query with auth headers and response transformation
const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE,
  prepareHeaders: (headers, { getState }) => {
    // Always add accept header
    headers.set('accept', 'application/json');

    // Add ngrok warning bypass headers if using ngrok
    const requestUrl = headers.get('x-request-url') || API_BASE;
    if (requestUrl.includes('ngrok') || API_BASE.includes('ngrok')) {
      headers.set('ngrok-skip-browser-warning', 'true');
      headers.set('User-Agent', 'API-Testing-Tool/1.0');
    }

    // Get token from localStorage or Redux state
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    let userObj = null;
    try {
      if (user) {
        userObj = JSON.parse(user);
      }
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }

    // Add authorization header
    if (token) {
      const bearerToken = token.startsWith('Bearer ')
        ? token
        : `Bearer ${token}`;
      headers.set('authorization', bearerToken);
    }

    // Add username header
    if (userObj?.email) {
      headers.set('username', userObj.email);
    }

    // Add workspace ID header from localStorage if available
    const activeWorkspaceId = localStorage.getItem('activeWorkspaceId');
    if (activeWorkspaceId) {
      headers.set('workspace-id', activeWorkspaceId);
    }

    // Debug: log presence of auth info (do NOT log token contents)
    if (import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true') {
      try {
        const hasToken = !!token;
        const usernameHeader = user ? (() => { try { return JSON.parse(user).email } catch (e) { return null } })() : null;
        console.debug('[apiSlice.prepareHeaders] hasToken:', hasToken, 'username:', usernameHeader, 'workspaceId:', activeWorkspaceId);
      } catch (e) {
        console.debug('[apiSlice.prepareHeaders] debug parse error', e);
      }
    }

    // Add content-type for POST/PUT requests
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return headers;
  },
});

// Wrapper to handle standard backend response format
const baseQueryWithTransform = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);

  if (result.data) {
    console.log('API Response:', {
      url: args.url || args,
      response: result.data,
    });

    // Handle standard backend response format
    if (
      result.data &&
      typeof result.data === 'object' &&
      'response_code' in result.data
    ) {
      const { response_code, data, error_message } = result.data;

      // Handle special cases first
      if (
        response_code === 206 &&
        error_message === 'No variables found for this environment'
      ) {
        // Return empty object for "no variables" case
        return { ...result, data: {} };
      }

      // For successful responses, return the appropriate data
      if (response_code >= 200 && response_code < 300 && data !== undefined) {
        // Special handling for environment variables endpoint
        const url = args.url || args;
        if (
          typeof url === 'string' &&
          url.includes('/variables') &&
          !url.includes('/variables/')
        ) {
          // For environment variables list endpoint, extract the variables object
          if (data && typeof data === 'object' && 'variables' in data) {
            return { ...result, data: data.variables };
          }
        }

        // Special handling for environments list endpoint
        if (
          typeof url === 'string' &&
          url.includes('/environments') &&
          !url.includes('/environments/')
        ) {
          // For environments list endpoint, extract the environments array
          if (data && typeof data === 'object' && 'environments' in data) {
            return { ...result, data: data.environments };
          }
        }

        // For all other successful responses, return the data property
        return { ...result, data: data };
      }

      // For error responses, keep the full structure for error handling
      if (error_message) {
        return {
          ...result,
          error: { status: response_code, data: result.data },
        };
      }
    }
  }

  return result;
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

// Create the API slice
export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Workspace', 'User', 'Environment', 'Node', 'ApiCase', 'Header'],
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

    // Workspace endpoints
    getWorkspaces: builder.query({
      query: () => '/workspace/list',
      providesTags: ['Workspace'],
    }),

    getWorkspaceTree: builder.query({
      query: workspaceId => `/workspace/${workspaceId}`,
      providesTags: (result, error, workspaceId) => [
        { type: 'Workspace', id: workspaceId },
        'Node',
      ],
      transformResponse: response => {
        // Return the original structure to maintain compatibility with CollectionTree
        // The component expects file_tree with children, not collections with items
        console.log('getWorkspaceTree response:', response);
        return response;
      },
    }),

    createWorkspace: builder.mutation({
      query: workspaceData => ({
        url: '/workspace/create',
        method: 'POST',
        body: workspaceData,
      }),
      invalidatesTags: ['Workspace'],
    }),

    updateWorkspace: builder.mutation({
      query: ({ workspaceId, ...workspaceData }) => ({
        url: `/workspace/${workspaceId}`,
        method: 'PUT',
        body: workspaceData,
      }),
      invalidatesTags: (result, error, { workspaceId }) => [
        { type: 'Workspace', id: workspaceId },
        'Workspace',
      ],
    }),

    deleteWorkspace: builder.mutation({
      query: workspaceId => ({
        url: `/workspace/${workspaceId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Workspace'],
    }),

    getBulkTestingTree: builder.query({
      query: workspaceId => `/workspace/${workspaceId}?include_apis=true`,
      providesTags: (result, error, workspaceId) => [
        { type: 'Workspace', id: workspaceId },
        'ApiCase',
      ],
    }),

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
      providesTags: (result, error, workspaceId) => [
        { type: 'Environment', id: workspaceId },
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
      invalidatesTags: (result, error, { workspaceId }) => [
        { type: 'Environment', id: workspaceId },
      ],
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
      invalidatesTags: ['Environment'],
    }),

    deleteEnvironment: builder.mutation({
      query: ({ workspaceId, environmentId }) => ({
        url: `/environment/workspace/${workspaceId}/environments/${environmentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Environment'],
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
        { type: 'Environment', id: environmentId },
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
        { type: 'Environment', id: environmentId },
      ],
    }),

    deleteEnvironmentVariable: builder.mutation({
      query: ({ workspaceId, environmentId, variableId }) => ({
        url: `/environment/workspace/${workspaceId}/environments/${environmentId}/variables/${variableId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { environmentId }) => [
        { type: 'Environment', id: environmentId },
      ],
    }),

    // API Management endpoints
    listApis: builder.query({
      query: (filters = {}) => ({
        url: '/api/list',
        params: filters,
      }),
      providesTags: ['ApiCase'],
    }),

    getApi: builder.query({
      query: ({ fileId, includeCases = false }) => ({
        url: `/file/${fileId}/api`,
        params: { include_cases: includeCases },
      }),
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
      invalidatesTags: ['ApiCase'],
    }),

    saveApi: builder.mutation({
      query: ({ fileId, ...apiData }) => ({
        url: `/file/${fileId}/api/save`,
        method: 'POST',
        body: apiData,
      }),
      invalidatesTags: ['ApiCase'],
    }),

    updateApi: builder.mutation({
      query: ({ apiId, ...apiData }) => ({
        url: `/api/${apiId}`,
        method: 'PUT',
        body: apiData,
      }),
      invalidatesTags: ['ApiCase'],
    }),

    deleteApi: builder.mutation({
      query: apiId => ({
        url: `/api/${apiId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ApiCase'],
    }),

    // Test Case endpoints
    createTestCase: builder.mutation({
      query: ({ fileId, ...testCaseData }) => ({
        url: `/file/${fileId}/api/cases`,
        method: 'POST',
        body: testCaseData,
      }),
      invalidatesTags: ['ApiCase'],
    }),

    bulkCreateTestCases: builder.mutation({
      query: ({ fileId, testCases }) => ({
        url: `/file/${fileId}/api/cases/bulk`,
        method: 'POST',
        body: { test_cases: testCases },
      }),
      invalidatesTags: ['ApiCase'],
    }),

    saveTestCase: builder.mutation({
      query: ({ fileId, caseId, ...testCaseData }) => {
        const endpoint = caseId
          ? `/api/cases/${caseId}`
          : `/file/${fileId}/api/cases`;
        const method = caseId ? 'PUT' : 'POST';

        return {
          url: endpoint,
          method,
          body: testCaseData,
        };
      },
      invalidatesTags: ['ApiCase'],
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
      query: ({ caseId, ...testCaseData }) => ({
        url: `/api/cases/${caseId}`,
        method: 'PUT',
        body: testCaseData,
      }),
      invalidatesTags: ['ApiCase'],
    }),

    deleteTestCase: builder.mutation({
      query: caseId => ({
        url: `/case/${caseId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ApiCase'],
    }),

    // Test execution
    runTest: builder.mutation({
      query: ({ fileId, caseId = null }) => ({
        url: '/run',
        method: 'POST',
        body: {
          file_id: fileId,
          case_id: caseId,
        },
      }),
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

  // Workspace hooks
  useGetWorkspacesQuery,
  useGetWorkspaceTreeQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useGetBulkTestingTreeQuery,

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
} = apiSlice;
