// Global test setup: runs once before every test file (wired via vitest.config setupFiles).
// Provides jest-dom matchers + a shared MSW server that mocks the HTTP boundary so store/
// component tests never hit a real backend.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Shared MSW server. Sprint 8b registers per-test handlers via `server.use(...)`.
// Starts with no handlers — `onUnhandledRequest: 'error'` makes any un-mocked request a
// loud test failure instead of a silent network call.
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  cleanup(); // unmount React trees between tests
  server.resetHandlers(); // drop per-test handlers so they can't leak across tests
});

afterAll(() => server.close());
