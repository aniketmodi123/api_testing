/**
 * Import/Export utilities for Phase 3.
 * All functions are pure — no side effects, no API calls.
 */

// ─── cURL Parser ────────────────────────────────────────────────────────────

/**
 * Parse a cURL command string into { method, url, headers, body, params }.
 */
export function parseCurl(curlStr) {
  if (!curlStr) return null;

  // Normalise: strip backslash line continuations, collapse whitespace
  let str = curlStr.replace(/\\\n/g, ' ').trim();

  const result = {
    method: 'GET',
    url: '',
    headers: {},
    body: null,
    params: {},
  };

  // Remove leading "curl " and optional leading flags like -s, -i, -v
  str = str.replace(/^curl\s+/i, '');

  // Tokenise respecting single/double-quoted strings
  const tokens = tokenise(str);

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === '-X' || tok === '--request') {
      result.method = (tokens[++i] || 'GET').toUpperCase();
    } else if (tok === '-H' || tok === '--header') {
      const raw = tokens[++i] || '';
      const colon = raw.indexOf(':');
      if (colon > -1) {
        const key = raw.slice(0, colon).trim();
        const val = raw.slice(colon + 1).trim();
        result.headers[key] = val;
      }
    } else if (tok === '-d' || tok === '--data' || tok === '--data-raw') {
      const raw = tokens[++i] || '';
      try {
        result.body = JSON.parse(raw);
        result.method = result.method === 'GET' ? 'POST' : result.method;
      } catch {
        result.body = raw;
        result.method = result.method === 'GET' ? 'POST' : result.method;
      }
    } else if (tok === '--data-urlencode') {
      const raw = tokens[++i] || '';
      const eq = raw.indexOf('=');
      if (eq > -1) {
        const k = raw.slice(0, eq);
        const v = raw.slice(eq + 1);
        result.params[k] = v;
      }
    } else if (tok === '--user' || tok === '-u') {
      const creds = tokens[++i] || '';
      result.headers['Authorization'] = 'Basic ' + btoa(creds);
    } else if (tok === '-L' || tok === '--location') {
      // follow redirects — no-op for parsing
    } else if (!tok.startsWith('-')) {
      // Likely a URL
      const cleaned = tok.replace(/^["']|["']$/g, '');
      if (!result.url && (cleaned.startsWith('http') || cleaned.startsWith('/'))) {
        result.url = cleaned;
      }
    }
    i++;
  }

  return result;
}

/** Very simple shell-tokeniser: handles single/double quoted strings. */
function tokenise(str) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "'" && !inDouble) { inSingle = !inSingle; }
    else if (c === '"' && !inSingle) { inDouble = !inDouble; }
    else if (c === ' ' && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = ''; }
    } else {
      current += c;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}


// ─── Postman v2.1 Export ────────────────────────────────────────────────────

/**
 * Convert a workspace tree node (and its children) to Postman v2.1 collection JSON.
 *
 * workspaceTree: the file_tree array from the backend
 * collectionName: string label for the Postman collection info.name
 */
export function toPostmanCollection(workspaceTree, collectionName = 'Exported Collection') {
  return {
    info: {
      name: collectionName,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: (workspaceTree || []).map(nodeToPostmanItem),
  };
}

function nodeToPostmanItem(node) {
  if (node.type === 'folder') {
    return {
      name: node.name,
      item: (node.children || []).map(nodeToPostmanItem),
    };
  }

  // file node — use api data if available
  const api = node.api || {};
  return {
    name: node.name || api.name || 'Untitled',
    request: {
      method: (node.method || api.method || 'GET').toUpperCase(),
      url: { raw: api.endpoint || node.endpoint || '' },
      header: objectToPostmanHeaders(api.headers || {}),
      body: api.body
        ? { mode: 'raw', raw: JSON.stringify(api.body, null, 2), options: { raw: { language: 'json' } } }
        : undefined,
    },
    response: [],
  };
}

function objectToPostmanHeaders(obj) {
  return Object.entries(obj || {}).map(([key, value]) => ({ key, value, type: 'text' }));
}


// ─── Postman v2.1 Import ────────────────────────────────────────────────────

let _tempIdCounter = 0;
const newTempId = () => `tmp_${++_tempIdCounter}`;

/**
 * Convert a Postman v2.1 collection JSON object into BulkImportRequest items array.
 * Returns: { workspaceName: string, items: BulkImportItem[] }
 */
export function fromPostmanCollection(collection) {
  _tempIdCounter = 0;
  const workspaceName = collection?.info?.name || 'Imported Collection';
  const items = [];

  (collection?.item || []).forEach(postmanItem => {
    processPostmanItem(postmanItem, null, items);
  });

  return { workspaceName, items };
}

function processPostmanItem(postmanItem, parentTempId, items) {
  const isFolder = Array.isArray(postmanItem.item);
  const tempId = newTempId();

  if (isFolder) {
    items.push({
      temp_id: tempId,
      parent_temp_id: parentTempId,
      name: postmanItem.name || 'Folder',
      type: 'folder',
    });
    (postmanItem.item || []).forEach(child => processPostmanItem(child, tempId, items));
  } else {
    const req = postmanItem.request || {};
    const method = (typeof req.method === 'string' ? req.method : 'GET').toUpperCase();
    const rawUrl = req.url?.raw || req.url || '';
    const headersObj = postmanHeadersToObject(req.header || []);
    let body = null;
    if (req.body?.mode === 'raw' && req.body.raw) {
      try { body = JSON.parse(req.body.raw); } catch { body = null; }
    }

    items.push({
      temp_id: tempId,
      parent_temp_id: parentTempId,
      name: postmanItem.name || 'Request',
      type: 'file',
      api: {
        name: postmanItem.name || 'Request',
        method,
        endpoint: rawUrl,
        description: postmanItem.description || null,
      },
      cases: body || Object.keys(headersObj).length ? [
        {
          name: 'Default',
          headers: headersObj,
          params: postmanParamsToObject(req.url?.query || []),
          body,
          expected: { status: 200 },
        },
      ] : [],
    });
  }
}

function postmanHeadersToObject(headers) {
  const obj = {};
  (headers || []).forEach(h => { if (h.key) obj[h.key] = h.value; });
  return obj;
}

function postmanParamsToObject(params) {
  const obj = {};
  (params || []).forEach(p => { if (p.key) obj[p.key] = p.value; });
  return obj;
}


// ─── OpenAPI 3.0 Export (optional) ─────────────────────────────────────────

/**
 * Convert a workspace tree into an OpenAPI 3.0 YAML string.
 */
export function toOpenAPI(workspaceTree, info = {}) {
  const paths = {};

  const walkNodes = nodes => {
    (nodes || []).forEach(node => {
      if (node.type === 'folder') {
        walkNodes(node.children || []);
      } else {
        const api = node.api || {};
        const endpoint = api.endpoint || node.endpoint || '/unknown';
        const method = (api.method || node.method || 'GET').toLowerCase();
        if (!paths[endpoint]) paths[endpoint] = {};
        paths[endpoint][method] = {
          summary: api.name || node.name || 'Untitled',
          description: api.description || '',
          responses: {
            '200': { description: 'Success' },
          },
        };
      }
    });
  };

  walkNodes(workspaceTree);

  // Build YAML manually (no external dep needed for this simple structure)
  const doc = {
    openapi: '3.0.0',
    info: {
      title: info.title || 'API Collection',
      version: info.version || '1.0.0',
    },
    paths,
  };

  return jsonToYaml(doc, 0);
}

function jsonToYaml(obj, indent) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(obj)) {
    return obj.map(v => `${pad}- ${jsonToYaml(v, indent + 1).trimStart()}`).join('\n');
  }
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj)
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          return `${pad}${k}:\n${jsonToYaml(v, indent + 1)}`;
        }
        if (Array.isArray(v)) {
          return `${pad}${k}:\n${jsonToYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${JSON.stringify(v)}`;
      })
      .join('\n');
  }
  return String(obj);
}
