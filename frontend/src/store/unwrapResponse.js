/**
 * What this file does: Unwraps the backend's standard response envelope
 * (`{ response_code, data, error_message }`) into the bare payload RTK Query consumers expect.
 */

/**
 * What it does: Turns a raw base-query result carrying the backend envelope into an
 * unwrapped success result or an RTK Query error result.
 * Args:
 *   result: Raw result from `fetchBaseQuery`. Returned unchanged when it has no `data`
 *           or its `data` is not an enveloped object (no ``response_code`` key).
 *   url: Request url string used to detect the list endpoints that nest their payload;
 *        a non-string is treated as "no special handling".
 * Returns:
 *   object: An RTK Query result — `{ ...result, data }` on success, or
 *           `{ ...result, error }` when the envelope carries an `error_message`.
 * Notes:
 *   - 206 + "No variables found for this environment" is normalized to an empty object,
 *     not an error, so callers render an empty variable set.
 */
export function unwrapBackendResponse(result, url) {
  if (!result.data) return result;

  const body = result.data;
  if (typeof body !== 'object' || !('response_code' in body)) return result;

  const { response_code, data, error_message } = body;

  // "No variables" is an empty state, not an error.
  if (
    response_code === 206 &&
    error_message === 'No variables found for this environment'
  ) {
    return { ...result, data: {} };
  }

  if (response_code >= 200 && response_code < 300 && data !== undefined) {
    const isString = typeof url === 'string';

    // Variables list endpoint nests the map under `variables`.
    if (isString && url.includes('/variables') && !url.includes('/variables/')) {
      if (data && typeof data === 'object' && 'variables' in data) {
        return { ...result, data: data.variables };
      }
    }

    // Environments list endpoint nests the array under `environments`.
    if (isString && url.includes('/environments') && !url.includes('/environments/')) {
      if (data && typeof data === 'object' && 'environments' in data) {
        return { ...result, data: data.environments };
      }
    }

    return { ...result, data };
  }

  if (error_message) {
    return { ...result, error: { status: response_code, data: result.data } };
  }

  return result;
}
