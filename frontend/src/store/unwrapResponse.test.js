import { describe, it, expect } from 'vitest';
import { unwrapBackendResponse } from './unwrapResponse';

describe('unwrapBackendResponse', () => {
  it('returns result unchanged when there is no .data', () => {
    const result = { error: { status: 500 } };
    expect(unwrapBackendResponse(result, '/anything')).toBe(result);
  });

  it('returns result unchanged when body is not enveloped (no response_code)', () => {
    const result = { data: { id: 1, name: 'plain' } };
    expect(unwrapBackendResponse(result, '/anything')).toBe(result);
  });

  it('normalizes 206 "No variables found" into an empty object, not an error', () => {
    const result = {
      data: {
        response_code: 206,
        data: null,
        error_message: 'No variables found for this environment',
      },
    };
    const out = unwrapBackendResponse(result, '/environments/1/variables');
    expect(out).toEqual({ ...result, data: {} });
    expect(out.error).toBeUndefined();
  });

  it('unwraps the inner data on a 200 success with plain data', () => {
    const inner = { id: 10, name: 'A' };
    const result = {
      data: { response_code: 200, data: inner, error_message: null },
    };
    const out = unwrapBackendResponse(result, '/file/1/api');
    expect(out.data).toEqual(inner);
  });

  it('unwraps the variables map for the variables LIST endpoint', () => {
    const variables = { FOO: 'bar', BAZ: 'qux' };
    const result = {
      data: { response_code: 200, data: { variables }, error_message: null },
    };
    const out = unwrapBackendResponse(result, '/environments/1/variables');
    expect(out.data).toEqual(variables);
  });

  it('does NOT unwrap variables for a single /variables/:id endpoint', () => {
    const inner = { variables: { FOO: 'bar' }, id: 123 };
    const result = {
      data: { response_code: 200, data: inner, error_message: null },
    };
    const out = unwrapBackendResponse(result, '/variables/123');
    expect(out.data).toEqual(inner);
  });

  it('unwraps the environments array for the environments LIST endpoint', () => {
    const environments = [{ id: 1 }, { id: 2 }];
    const result = {
      data: {
        response_code: 200,
        data: { environments },
        error_message: null,
      },
    };
    const out = unwrapBackendResponse(result, '/environments');
    expect(out.data).toEqual(environments);
  });

  it('returns an RTK error result when error_message is set with a non-2xx code', () => {
    const result = {
      data: {
        response_code: 404,
        data: null,
        error_message: 'Not found',
      },
    };
    const out = unwrapBackendResponse(result, '/file/1/api');
    expect(out.error).toEqual({ status: 404, data: result.data });
  });
});
