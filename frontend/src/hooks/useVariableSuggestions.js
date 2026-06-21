import { useMemo } from 'react';
import { useEnvironment } from '../store/environment';
import { useGetGlobalVariablesQuery } from '../store/apiSlice';

// What this file does: merges environment (local) and global variables into one
// suggestion list following the resolution hierarchy — a local key shadows the
// global key of the same name; global keys not present locally are appended.

/**
 * What it does: returns the merged, deduped variable list used for autocomplete.
 *
 * Returns:
 *   Array<{ key, value, source, is_secret }>: local variables first (source
 *   ``"local"``), then global variables whose key is not already defined locally
 *   (source ``"global"``). Secret values are not exposed — ``value`` is empty for them.
 */
export function useVariableSuggestions() {
  const { variables = [] } = useEnvironment();
  const { data: globalVars = [] } = useGetGlobalVariablesQuery();

  return useMemo(() => {
    const merged = [];
    const seen = new Set();

    for (const v of variables) {
      if (!v?.key || seen.has(v.key)) continue;
      seen.add(v.key);
      merged.push({
        key: v.key,
        value: v.is_secret ? '' : (v.value ?? ''),
        source: 'local',
        is_secret: !!v.is_secret,
      });
    }

    for (const v of globalVars) {
      if (!v?.key || seen.has(v.key)) continue;
      seen.add(v.key);
      merged.push({
        key: v.key,
        value: v.is_secret ? '' : (v.value ?? ''),
        source: 'global',
        is_secret: !!v.is_secret,
      });
    }

    return merged;
  }, [variables, globalVars]);
}
