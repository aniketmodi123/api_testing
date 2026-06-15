import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json as jsonLang } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import styles from './AssertionBuilder.module.css';

/**
 * Visual assertion builder for the `expected` object.
 *
 * Props:
 *   value      – controlled JSON object (the expected spec)
 *   onChange   – (newValue: object) => void
 *   isDarkMode – boolean
 */

const TARGET_OPTIONS = [
  { value: 'status',        label: 'Status Code' },
  { value: 'status_in',     label: 'Status Code (one of)' },
  { value: 'text_contains', label: 'Body text contains' },
  { value: 'text_regex',    label: 'Body text regex' },
  { value: 'header',        label: 'Response header' },
  { value: 'json_check',   label: 'Body field (JSON path)' },
  { value: 'schema',        label: 'Body field schema (JSON Schema)' },
];

const JSON_CHECK_OPERATORS = [
  'equals', 'contains', 'regex', 'type', 'present', 'absent',
  'gt', 'gte', 'lt', 'lte', 'length',
];

const TYPE_OPTIONS = ['string', 'number', 'boolean', 'object', 'array', 'null'];

const EMPTY_ROW = () => ({
  id: Math.random().toString(36).slice(2),
  target: 'status',
  // status
  statusValue: '200',
  // status_in
  statusInValue: '200, 201',
  // text_contains
  textValue: '',
  // text_regex
  textRegexValue: '',
  // header
  headerKey: '',
  headerValue: '',
  headerOperator: 'equals', // equals | regex
  // json_check
  jsonPath: '',
  jsonOperator: 'equals',
  jsonValue: '',
  jsonTypeValue: 'string',
  // schema
  schemaPath: '',
  schemaValue: '{}',
});

// ── Serialise rows → expected object ──────────────────────────────────────────
function rowsToExpected(rows) {
  const out = {};
  const jsonChecks = [];

  for (const row of rows) {
    switch (row.target) {
      case 'status': {
        const n = parseInt(row.statusValue, 10);
        if (!isNaN(n)) out.status = n;
        break;
      }
      case 'status_in': {
        const codes = row.statusInValue
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n));
        if (codes.length) out.status_in = codes;
        break;
      }
      case 'text_contains':
        if (row.textValue) out.text_contains = row.textValue;
        break;
      case 'text_regex':
        if (row.textRegexValue) out.text_regex = row.textRegexValue;
        break;
      case 'header':
        if (row.headerKey) {
          if (row.headerOperator === 'regex') {
            out.headers_regex = { ...(out.headers_regex || {}), [row.headerKey]: row.headerValue };
          } else {
            out.headers = { ...(out.headers || {}), [row.headerKey]: row.headerValue };
          }
        }
        break;
      case 'json_check': {
        if (!row.jsonPath) break;
        const chk = { path: row.jsonPath };
        if (row.jsonOperator === 'present') { chk.present = true; }
        else if (row.jsonOperator === 'absent') { chk.absent = true; }
        else if (row.jsonOperator === 'type') { chk.type = row.jsonTypeValue; }
        else if (row.jsonOperator === 'length') { chk.length = parseInt(row.jsonValue, 10) || 0; }
        else if (['gt','gte','lt','lte'].includes(row.jsonOperator)) {
          chk[row.jsonOperator] = parseFloat(row.jsonValue) || 0;
        } else if (row.jsonOperator === 'equals') {
          try { chk.equals = JSON.parse(row.jsonValue); }
          catch { chk.equals = row.jsonValue; }
        } else {
          chk[row.jsonOperator] = row.jsonValue;
        }
        jsonChecks.push(chk);
        break;
      }
      case 'schema': {
        if (!row.schemaPath) break;
        try {
          const schema = JSON.parse(row.schemaValue);
          jsonChecks.push({ path: row.schemaPath, schema });
        } catch { /* skip malformed */ }
        break;
      }
      default: break;
    }
  }

  if (jsonChecks.length) {
    out.json = { checks: jsonChecks };
  }
  return out;
}

// ── Deserialise expected object → rows ─────────────────────────────────────────
function expectedToRows(expected) {
  if (!expected || typeof expected !== 'object') return [EMPTY_ROW()];
  const rows = [];

  if ('status' in expected) {
    rows.push({ ...EMPTY_ROW(), target: 'status', statusValue: String(expected.status) });
  }
  if ('status_in' in expected) {
    rows.push({ ...EMPTY_ROW(), target: 'status_in', statusInValue: (expected.status_in || []).join(', ') });
  }
  if ('text_contains' in expected) {
    const v = expected.text_contains;
    rows.push({ ...EMPTY_ROW(), target: 'text_contains', textValue: Array.isArray(v) ? v.join(', ') : v });
  }
  if ('text_regex' in expected) {
    rows.push({ ...EMPTY_ROW(), target: 'text_regex', textRegexValue: expected.text_regex });
  }
  if ('headers' in expected) {
    for (const [k, v] of Object.entries(expected.headers || {})) {
      rows.push({ ...EMPTY_ROW(), target: 'header', headerKey: k, headerValue: v, headerOperator: 'equals' });
    }
  }
  if ('headers_regex' in expected) {
    for (const [k, v] of Object.entries(expected.headers_regex || {})) {
      rows.push({ ...EMPTY_ROW(), target: 'header', headerKey: k, headerValue: v, headerOperator: 'regex' });
    }
  }
  const checks = expected?.json?.checks || [];
  for (const chk of checks) {
    if ('schema' in chk) {
      rows.push({ ...EMPTY_ROW(), target: 'schema', schemaPath: chk.path || '', schemaValue: JSON.stringify(chk.schema, null, 2) });
      continue;
    }
    const row = { ...EMPTY_ROW(), target: 'json_check', jsonPath: chk.path || '' };
    if (chk.present) { row.jsonOperator = 'present'; }
    else if (chk.absent) { row.jsonOperator = 'absent'; }
    else if ('type' in chk) { row.jsonOperator = 'type'; row.jsonTypeValue = Array.isArray(chk.type) ? chk.type[0] : chk.type; }
    else if ('length' in chk) { row.jsonOperator = 'length'; row.jsonValue = String(chk.length); }
    else if ('gt' in chk) { row.jsonOperator = 'gt'; row.jsonValue = String(chk.gt); }
    else if ('gte' in chk) { row.jsonOperator = 'gte'; row.jsonValue = String(chk.gte); }
    else if ('lt' in chk) { row.jsonOperator = 'lt'; row.jsonValue = String(chk.lt); }
    else if ('lte' in chk) { row.jsonOperator = 'lte'; row.jsonValue = String(chk.lte); }
    else if ('equals' in chk) { row.jsonOperator = 'equals'; row.jsonValue = JSON.stringify(chk.equals); }
    else if ('contains' in chk) { row.jsonOperator = 'contains'; row.jsonValue = typeof chk.contains === 'string' ? chk.contains : JSON.stringify(chk.contains); }
    else if ('regex' in chk) { row.jsonOperator = 'regex'; row.jsonValue = chk.regex; }
    rows.push(row);
  }

  return rows.length ? rows : [EMPTY_ROW()];
}

// ── AssertionRow ───────────────────────────────────────────────────────────────
function AssertionRow({ row, onChange, onRemove, isDarkMode }) {
  const update = (field, val) => onChange({ ...row, [field]: val });

  return (
    <div className={styles.row}>
      <select
        className={styles.select}
        value={row.target}
        onChange={e => onChange({ ...EMPTY_ROW(), id: row.id, target: e.target.value })}
      >
        {TARGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {row.target === 'status' && (
        <input className={styles.input} type="number" value={row.statusValue}
          onChange={e => update('statusValue', e.target.value)} placeholder="200" />
      )}

      {row.target === 'status_in' && (
        <input className={styles.input} value={row.statusInValue}
          onChange={e => update('statusInValue', e.target.value)} placeholder="200, 201, 204" />
      )}

      {row.target === 'text_contains' && (
        <input className={styles.input} value={row.textValue}
          onChange={e => update('textValue', e.target.value)} placeholder="string to find in body" />
      )}

      {row.target === 'text_regex' && (
        <input className={styles.input} value={row.textRegexValue}
          onChange={e => update('textRegexValue', e.target.value)} placeholder="regex pattern" />
      )}

      {row.target === 'header' && (
        <>
          <input className={styles.inputSm} value={row.headerKey}
            onChange={e => update('headerKey', e.target.value)} placeholder="Header-Name" />
          <select className={styles.selectSm} value={row.headerOperator}
            onChange={e => update('headerOperator', e.target.value)}>
            <option value="equals">equals</option>
            <option value="regex">regex</option>
          </select>
          <input className={styles.input} value={row.headerValue}
            onChange={e => update('headerValue', e.target.value)} placeholder="value or pattern" />
        </>
      )}

      {row.target === 'json_check' && (
        <>
          <input className={styles.inputSm} value={row.jsonPath}
            onChange={e => update('jsonPath', e.target.value)} placeholder="$.data.id" />
          <select className={styles.selectSm} value={row.jsonOperator}
            onChange={e => update('jsonOperator', e.target.value)}>
            {JSON_CHECK_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          {row.jsonOperator === 'type' ? (
            <select className={styles.selectSm} value={row.jsonTypeValue}
              onChange={e => update('jsonTypeValue', e.target.value)}>
              {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : !['present', 'absent'].includes(row.jsonOperator) ? (
            <input className={styles.input} value={row.jsonValue}
              onChange={e => update('jsonValue', e.target.value)} placeholder="value" />
          ) : null}
        </>
      )}

      {row.target === 'schema' && (
        <>
          <input className={styles.inputSm} value={row.schemaPath}
            onChange={e => update('schemaPath', e.target.value)} placeholder="$.data (or $ for root)" />
          <div className={styles.schemaEditor}>
            <CodeMirror
              value={row.schemaValue}
              height="80px"
              extensions={[jsonLang()]}
              theme={isDarkMode ? oneDark : undefined}
              onChange={val => update('schemaValue', val)}
              basicSetup={{ lineNumbers: false, foldGutter: false }}
            />
          </div>
        </>
      )}

      <button className={styles.removeBtn} onClick={onRemove} title="Remove">×</button>
    </div>
  );
}

// ── AssertionBuilder (main) ────────────────────────────────────────────────────
export default function AssertionBuilder({ value, onChange, isDarkMode }) {
  const [mode, setMode] = useState('visual'); // 'visual' | 'json'
  const [rows, setRows] = useState(() => expectedToRows(value));
  const [jsonText, setJsonText] = useState(() => JSON.stringify(value || {}, null, 2));
  const [jsonError, setJsonError] = useState(null);
  const [complexWarning, setComplexWarning] = useState(false);

  // Sync incoming value → rows when parent resets (e.g. loading a test case)
  useEffect(() => {
    if (mode === 'visual') {
      setRows(expectedToRows(value));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  const commitRows = updatedRows => {
    setRows(updatedRows);
    onChange(rowsToExpected(updatedRows));
  };

  const addRow = () => commitRows([...rows, EMPTY_ROW()]);
  const removeRow = id => commitRows(rows.filter(r => r.id !== id));
  const updateRow = (id, updated) => commitRows(rows.map(r => r.id === id ? updated : r));

  const switchToJson = () => {
    setJsonText(JSON.stringify(rowsToExpected(rows), null, 2));
    setJsonError(null);
    setMode('json');
  };

  const switchToVisual = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const converted = expectedToRows(parsed);
      // Detect complex assertion that can't round-trip cleanly (e.g. json.either)
      const hasEither = parsed?.json?.either;
      setComplexWarning(!!hasEither);
      setRows(converted);
      onChange(parsed);
      setMode('visual');
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON — fix before switching to visual mode.');
    }
  };

  const handleJsonChange = val => {
    setJsonText(val);
    setJsonError(null);
    try {
      const parsed = JSON.parse(val);
      onChange(parsed);
    } catch { /* allow partial edits */ }
  };

  return (
    <div className={styles.builder}>
      <div className={styles.toolbar}>
        <span className={styles.label}>Expected Response</span>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${mode === 'visual' ? styles.active : ''}`}
            onClick={() => mode === 'json' ? switchToVisual() : undefined}
          >Visual</button>
          <button
            className={`${styles.modeBtn} ${mode === 'json' ? styles.active : ''}`}
            onClick={() => mode === 'visual' ? switchToJson() : undefined}
          >JSON</button>
        </div>
      </div>

      {complexWarning && (
        <div className={styles.warning}>
          Complex assertion detected (json.either) — switch to JSON mode to edit it fully.
        </div>
      )}

      {mode === 'visual' && (
        <>
          <div className={styles.rows}>
            {rows.map(row => (
              <AssertionRow
                key={row.id}
                row={row}
                onChange={updated => updateRow(row.id, updated)}
                onRemove={() => removeRow(row.id)}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
          <button className={styles.addBtn} onClick={addRow}>+ Add assertion</button>
        </>
      )}

      {mode === 'json' && (
        <div className={styles.jsonMode}>
          {jsonError && <div className={styles.jsonError}>{jsonError}</div>}
          <CodeMirror
            value={jsonText}
            height="240px"
            extensions={[jsonLang()]}
            theme={isDarkMode ? oneDark : undefined}
            onChange={handleJsonChange}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
          />
        </div>
      )}
    </div>
  );
}
