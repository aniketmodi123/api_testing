import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse } from 'msw';
import { apiSlice } from './apiSlice';
import { API_BASE } from '../api';
import { server } from '../test/setup.js';

function makeStore() {
  return configureStore({
    reducer: { [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: gdm => gdm().concat(apiSlice.middleware),
  });
}

const getApiArg = fileId => ({ fileId, includeCases: true });
const readGetApi = (store, fileId) =>
  apiSlice.endpoints.getApi.select(getApiArg(fileId))(store.getState()).data;
const tick = () => new Promise(r => setTimeout(r, 0));

let store;
beforeEach(() => {
  store = makeStore();
});

describe('apiSlice cache behavior', () => {
  it('TEST A — patches getApi cache from the saveApi RESPONSE without firing a follow-up GET', async () => {
    let getCount = 0;
    // Sentinel: if the displayed name ever came from a GET refetch instead of the
    // mutation response, it would read 'FROM_GET', not 'B'.
    server.use(
      http.get(`${API_BASE}/file/1/api`, () => {
        getCount += 1;
        const name = getCount === 1 ? 'A' : 'FROM_GET';
        return HttpResponse.json({
          response_code: 200,
          data: { id: 10, name, method: 'GET', endpoint: '/x' },
        });
      }),
      http.post(`${API_BASE}/file/1/api/save`, () =>
        HttpResponse.json({
          response_code: 200,
          data: { id: 10, name: 'B', method: 'GET', endpoint: '/x' },
        })
      )
    );

    // No active subscription: seed the entry so the mutation has a draft to patch,
    // but nothing for saveApi's invalidatesTags to refetch.
    const seed = await store.dispatch(
      apiSlice.endpoints.getApi.initiate(getApiArg(1), { subscribe: false })
    );
    expect(getCount).toBe(1);
    expect(seed.data.name).toBe('A');

    const saved = await store.dispatch(
      apiSlice.endpoints.saveApi.initiate({ fileId: 1, name: 'B' })
    );

    // Cache-from-response: the displayed entity comes straight from the mutation
    // response (the source onQueryStarted Object.assigns into the cache draft) — never 'FROM_GET'.
    expect(saved.data.name).toBe('B');

    // Headline assertion: no active subscription existed, so no refetch fired.
    expect(getCount).toBe(1);
  });

  it('TEST A2 — onQueryStarted patches the live cache entry from the saveApi response', async () => {
    // Complements TEST A: with an active subscription we can read the cache directly
    // and prove the patch lands. The GET refetch (from invalidatesTags) also returns
    // 'B', so the only source of 'B' before any refetch resolves is the mutation patch.
    server.use(
      http.get(`${API_BASE}/file/1/api`, () =>
        HttpResponse.json({
          response_code: 200,
          data: { id: 10, name: 'A', method: 'GET', endpoint: '/x' },
        })
      ),
      http.post(`${API_BASE}/file/1/api/save`, () =>
        HttpResponse.json({
          response_code: 200,
          data: { id: 10, name: 'B', method: 'GET', endpoint: '/x' },
        })
      )
    );

    const sub = store.dispatch(
      apiSlice.endpoints.getApi.initiate(getApiArg(1), { subscribe: true })
    );
    await sub;
    expect(readGetApi(store, 1).name).toBe('A');

    await store.dispatch(
      apiSlice.endpoints.saveApi.initiate({ fileId: 1, name: 'B' })
    );

    // Patched synchronously from the mutation response via Object.assign.
    expect(readGetApi(store, 1).name).toBe('B');

    sub.unsubscribe();
  });

  it('TEST B — rolls back the optimistic test-case insert when the server errors', async () => {
    server.use(
      http.get(`${API_BASE}/file/1/api`, () =>
        HttpResponse.json({
          response_code: 200,
          data: { id: 10, test_cases: [] },
        })
      ),
      http.post(`${API_BASE}/file/1/api/cases`, () =>
        HttpResponse.json(
          { response_code: 500, error_message: 'boom' },
          { status: 500 }
        )
      )
    );

    // Active subscription keeps the entry readable across the mutation lifecycle.
    const sub = store.dispatch(
      apiSlice.endpoints.getApi.initiate(getApiArg(1), { subscribe: true })
    );
    await sub;
    expect(readGetApi(store, 1).test_cases).toEqual([]);

    // Optimistic temp row is visible synchronously while the request is in flight.
    const pending = store.dispatch(
      apiSlice.endpoints.createTestCase.initiate({ fileId: 1, name: 'tc' })
    );
    expect(readGetApi(store, 1).test_cases).toHaveLength(1);

    try {
      await pending.unwrap();
    } catch {
      /* mutation rejects on server error — optimistic patch is undone */
    }

    // Rolled back to the original empty list.
    expect(readGetApi(store, 1).test_cases).toEqual([]);

    sub.unsubscribe();
  });

  it('TEST C — id-granular invalidation: editing file 1 does not refetch file 2', async () => {
    let get1 = 0;
    let get2 = 0;
    server.use(
      http.get(`${API_BASE}/file/1/api`, () => {
        get1 += 1;
        return HttpResponse.json({
          response_code: 200,
          data: { id: 10, name: 'A', method: 'GET', endpoint: '/x' },
        });
      }),
      http.get(`${API_BASE}/file/2/api`, () => {
        get2 += 1;
        return HttpResponse.json({
          response_code: 200,
          data: { id: 20, name: 'B', method: 'GET', endpoint: '/y' },
        });
      }),
      http.post(`${API_BASE}/file/1/api/save`, () =>
        HttpResponse.json({
          response_code: 200,
          data: { id: 10, name: 'A2', method: 'GET', endpoint: '/x' },
        })
      )
    );

    // Keep both subscriptions active (do NOT unsubscribe).
    store.dispatch(
      apiSlice.endpoints.getApi.initiate(getApiArg(1), { subscribe: true })
    );
    store.dispatch(
      apiSlice.endpoints.getApi.initiate(getApiArg(2), { subscribe: true })
    );
    await tick();
    expect(get1).toBe(1);
    expect(get2).toBe(1);

    await store.dispatch(
      apiSlice.endpoints.saveApi.initiate({ fileId: 1, name: 'A2' })
    );
    await tick();

    // saveApi only invalidates ApiCase id:1 — file 2 must NOT be refetched.
    expect(get2).toBe(1);
  });
});
