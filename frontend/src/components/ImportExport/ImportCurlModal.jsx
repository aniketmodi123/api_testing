import { useState } from 'react';
import { parseCurl } from '../../utils/importExport';
import styles from './ImportCurlModal.module.css';

/**
 * Modal for pasting a cURL command and opening it in the request editor.
 *
 * Props:
 *   onClose   – () => void
 *   onImport  – (parsed: { method, url, headers, body, params }) => void
 */
export default function ImportCurlModal({ onClose, onImport }) {
  const [curlText, setCurlText] = useState('');
  const [error, setError] = useState(null);

  const parsed = (() => {
    if (!curlText.trim()) return null;
    try {
      return parseCurl(curlText);
    } catch {
      return null;
    }
  })();

  const handleImport = () => {
    if (!parsed || !parsed.url) {
      setError('Could not parse a valid URL from the cURL command.');
      return;
    }
    onImport(parsed);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Import cURL</h2>

        <div>
          <label className={styles.label}>Paste your cURL command:</label>
          <textarea
            className={styles.textarea}
            value={curlText}
            onChange={e => { setCurlText(e.target.value); setError(null); }}
            placeholder={'curl -X POST "https://api.example.com/login" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"email":"a@b.com","password":"secret"}\''}
            spellCheck={false}
            autoFocus
          />
        </div>

        {parsed && parsed.url && (
          <div>
            <label className={styles.label}>Preview:</label>
            <div className={styles.preview}>
              {`${parsed.method} ${parsed.url}`}
              {Object.keys(parsed.headers).length > 0 &&
                '\n\nHeaders:\n' + Object.entries(parsed.headers).map(([k, v]) => `  ${k}: ${v}`).join('\n')}
              {parsed.body != null &&
                '\n\nBody:\n' + JSON.stringify(parsed.body, null, 2)}
            </div>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.importBtn}
            onClick={handleImport}
            disabled={!curlText.trim()}
          >
            Open in Editor
          </button>
        </div>
      </div>
    </div>
  );
}
