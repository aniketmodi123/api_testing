import { useEffect, useState } from 'react';
import { headerService } from '../../services/headerService';
import styles from './HeaderEditor.module.css';

/**
 * Component for editing folder-level headers
 */
const HeaderEditor = ({ folder, onClose, onSave }) => {
  const [headers, setHeaders] = useState({});
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inheritedHeaders, setInheritedHeaders] = useState(null);
  const [showInheritedHeaders, setShowInheritedHeaders] = useState(false);

  // Load existing headers when component mounts
  useEffect(() => {
    const loadHeaders = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Try to get headers for this folder
        const result = await headerService.getHeaders(folder.id);
        if (result && result.data && result.data.content) {
          setHeaders(result.data.content);
        } else {
          setHeaders({});
        }

        // Get inherited headers
        const inheritedResult = await headerService.getCompleteHeaders(
          folder.id,
          true
        );
        if (inheritedResult && inheritedResult.data) {
          setInheritedHeaders(inheritedResult.data);
        }
      } catch (err) {
        console.error('Error loading headers:', err);
        setError('Failed to load headers. Please try again.');
        setHeaders({});
      } finally {
        setIsLoading(false);
      }
    };

    if (folder && folder.id) {
      loadHeaders();
    }
  }, [folder]);

  // Add a new header
  const addHeader = () => {
    if (newHeaderKey.trim() !== '') {
      setHeaders(prevHeaders => ({
        ...prevHeaders,
        [newHeaderKey.trim()]: newHeaderValue,
      }));
      setNewHeaderKey('');
      setNewHeaderValue('');
    }
  };

  // Remove a header
  const removeHeader = key => {
    setHeaders(prevHeaders => {
      const updatedHeaders = { ...prevHeaders };
      delete updatedHeaders[key];
      return updatedHeaders;
    });
  };

  // Update header value
  const updateHeaderValue = (key, value) => {
    setHeaders(prevHeaders => ({
      ...prevHeaders,
      [key]: value,
    }));
  };

  // Save headers
  const saveHeaders = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let result;
      // If headers are empty, delete them
      if (Object.keys(headers).length === 0) {
        result = await headerService.deleteHeaders(folder.id);
      } else {
        // Check if headers already exist for this folder
        const existingHeaders = await headerService.getHeaders(folder.id);

        if (
          existingHeaders &&
          existingHeaders.data &&
          existingHeaders.data.id
        ) {
          // Update existing headers
          result = await headerService.updateHeaders(folder.id, headers);
        } else {
          // Create new headers
          result = await headerService.setHeaders(folder.id, headers);
        }
      }

      if (result && result.data) {
        onSave && onSave(result.data);
      }
    } catch (err) {
      console.error('Error saving headers:', err);
      setError('Failed to save headers. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle key press in the header key input
  const handleKeyPress = e => {
    if (e.key === 'Enter') {
      addHeader();
    }
  };

  return (
    <div className={styles.headerEditor}>
      <div className={styles.header}>
        <h2>Headers for {folder.name}</h2>
        <div className={styles.description}>
          Headers set here will be automatically applied to all requests in this
          folder and its subfolders.
        </div>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading headers...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          <div className={styles.editorSection}>
            <h3>Headers for this folder</h3>
            <div className={styles.headerList}>
              {Object.keys(headers).length === 0 ? (
                <div className={styles.emptyState}>
                  No headers defined for this folder.
                </div>
              ) : (
                Object.entries(headers).map(([key, value]) => (
                  <div key={key} className={styles.headerItem}>
                    <div className={styles.headerKey}>{key}</div>
                    <input
                      type="text"
                      className={styles.headerValue}
                      value={value}
                      onChange={e => updateHeaderValue(key, e.target.value)}
                      placeholder="Header value"
                    />
                    <button
                      className={styles.removeButton}
                      onClick={() => removeHeader(key)}
                      title="Remove header"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.addHeader}>
            <input
              type="text"
              className={styles.headerKeyInput}
              value={newHeaderKey}
              onChange={e => setNewHeaderKey(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Header name"
            />
            <input
              type="text"
              className={styles.headerValueInput}
              value={newHeaderValue}
              onChange={e => setNewHeaderValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Header value"
            />
            <button
              className={styles.addButton}
              onClick={addHeader}
              disabled={!newHeaderKey.trim()}
            >
              Add
            </button>
          </div>

          {inheritedHeaders && (
            <div className={styles.inheritance}>
              <button
                className={styles.inheritanceToggle}
                onClick={() => setShowInheritedHeaders(!showInheritedHeaders)}
              >
                {showInheritedHeaders ? 'Hide' : 'Show'} Complete Headers
                {inheritedHeaders.headers_count > 0 && (
                  <span className={styles.headerCount}>
                    ({inheritedHeaders.headers_count})
                  </span>
                )}
              </button>

              {showInheritedHeaders && inheritedHeaders.headers_count > 0 && (
                <div className={styles.inheritedHeadersList}>
                  <h3>All headers applied to this folder:</h3>
                  {inheritedHeaders.raw_headers_by_folder && (
                    <div className={styles.folderHeadersSection}>
                      <div className={styles.inheritanceInfo}>
                        {inheritedHeaders.inheritance_path?.length > 0 && (
                          <div className={styles.inheritancePath}>
                            <h4>Headers are inherited from:</h4>
                            <ul>
                              {inheritedHeaders.inheritance_path.map(
                                (folder, index) => (
                                  <li
                                    key={folder.id}
                                    className={
                                      folder.has_headers
                                        ? styles.hasHeaders
                                        : ''
                                    }
                                  >
                                    {folder.name}
                                    {index <
                                      inheritedHeaders.inheritance_path.length -
                                        1 && ' → '}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {Object.entries(inheritedHeaders.complete_headers).map(
                    ([key, value]) => {
                      const isInCurrentFolder =
                        Object.keys(headers).includes(key);

                      // Find which folder this header is coming from
                      let sourceFolder = null;
                      if (inheritedHeaders.inheritance_details) {
                        sourceFolder =
                          inheritedHeaders.inheritance_details[key]
                            ?.source_folder;
                      }

                      return (
                        <div
                          key={key}
                          className={`${styles.inheritedHeaderItem} ${isInCurrentFolder ? styles.overridden : ''}`}
                        >
                          <div className={styles.inheritedKey}>
                            {key}
                            {isInCurrentFolder && (
                              <span className={styles.overrideBadge}>
                                Overridden
                              </span>
                            )}
                            {sourceFolder && !isInCurrentFolder && (
                              <span className={styles.sourceBadge}>
                                From: {sourceFolder}
                              </span>
                            )}
                          </div>
                          <div className={styles.inheritedValue}>{value}</div>
                          {!isInCurrentFolder && (
                            <button
                              className={styles.overrideButton}
                              onClick={() => {
                                setNewHeaderKey(key);
                                setNewHeaderValue(value);
                              }}
                              title="Override this header in current folder"
                            >
                              Override
                            </button>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.saveButton}
              onClick={saveHeaders}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Headers'}
            </button>
            <button className={styles.cancelButton} onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default HeaderEditor;
