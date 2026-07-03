// Smoke test for the Sprint 8a test infra: proves vitest + jsdom + Testing Library +
// jest-dom matchers + MSW all load and run. Real behavior tests land in Sprint 8b.
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from './setup.js';

function Hello() {
  return <h1>API Testing</h1>;
}

describe('test infra smoke', () => {
  it('renders a component and matches with jest-dom', () => {
    render(<Hello />);
    expect(
      screen.getByRole('heading', { name: /api testing/i })
    ).toBeInTheDocument();
  });

  it('MSW intercepts a mocked request', async () => {
    server.use(
      http.get('http://localhost/ping', () =>
        HttpResponse.json({ ok: true })
      )
    );
    const res = await fetch('http://localhost/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
