import { useRef, useState } from 'react';
import { fromPostmanCollection } from '../../utils/importExport';
import { useBulkImportNodesMutation } from '../../store/apiSlice';
import styles from './ImportFileModal.module.css';

/**
 * Modal for importing a Postman v2.1 collection JSON file into a workspace.
 *
 * Props:
 *   workspaceId  – number
 *   onClose      – () => void
 *   onSuccess    – () => void  — called after successful import (to refresh tree)
 */
export default function ImportFileModal({ workspaceId, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const [bulkImport] = useBulkImportNodesMutation();

  const handleFile = selectedFile => {
    if (!selectedFile) return;
    if (!selectedFile.name.endsWith('.json')) {
      setError('Only .json files are supported (Postman v2.1 format).');
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const handleDrop = e => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!file || !workspaceId) return;
    setImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const collection = JSON.parse(text);
      const { items } = fromPostmanCollection(collection);

      await bulkImport({ workspaceId, items }).unwrap();
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e?.data?.error_message || e?.message || 'Import failed. Check the file format and try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Import Postman Collection</h2>

        <div
          className={`${styles.dropzone} ${file ? styles.active : ''}`}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={e => handleFile(e.target.files?.[0])}
          />
          <div className={styles.dropLabel}>
            {file ? '✓ File selected' : 'Click or drop a Postman v2.1 .json file here'}
          </div>
          {file && <div className={styles.fileName}>{file.name}</div>}
        </div>

        <div className={styles.info}>
          Supports Postman Collection v2.1 format. Nested folders, requests, headers, and body are imported. Responses are skipped.
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={importing}>Cancel</button>
          <button
            className={styles.importBtn}
            onClick={handleImport}
            disabled={!file || importing}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
