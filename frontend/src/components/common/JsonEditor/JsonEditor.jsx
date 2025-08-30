import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './JsonEditor.module.css';

// Copy to clipboard utility function
const copyToClipboard = async text => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
};

// Copy button component
const CopyButton = ({ textToCopy, className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      className={`${styles.copyButton} ${className || ''}`}
      onClick={handleCopy}
      title="Copy to clipboard"
      type="button"
    >
      {copied ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
};

export const JsonEditor = ({
  value = '',
  onChange,
  placeholder = 'Enter JSON data',
  language = 'json',
  showCopyButton = true,
  editorId,
  minHeight = 150,
  maxHeight = 600,
  resizable = true,
  className = '',
  disabled = false,
  rows = 10,
}) => {
  const [height, setHeight] = useState(minHeight);
  const [isResizing, setIsResizing] = useState(false);

  // Undo/Redo functionality
  const [history, setHistory] = useState([value]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isUndoRedo, setIsUndoRedo] = useState(false);
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const resizeHandleRef = useRef(null);

  const isJson = language === 'json';

  // Update history when value changes from outside
  useEffect(() => {
    if (!isUndoRedo && value !== history[historyIndex]) {
      setHistory(prev => [...prev, value]);
      setHistoryIndex(prev => prev + 1);
    }
  }, [value, isUndoRedo, history, historyIndex]);

  // Auto-resize functionality
  const autoResize = useCallback(() => {
    if (textareaRef.current && resizable) {
      const textarea = textareaRef.current;

      // Reset height to recalculate
      textarea.style.height = 'auto';

      // Calculate new height based on content
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.max(
        minHeight,
        Math.min(maxHeight, scrollHeight + 10)
      );

      setHeight(newHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [minHeight, maxHeight, resizable]);

  // Handle content change
  const handleChange = e => {
    const newValue = e.target.value;

    if (!isUndoRedo) {
      // Add to history only if it's not an undo/redo operation
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newValue);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }

    setIsUndoRedo(false);

    if (onChange) {
      onChange(newValue);
    }
    autoResize();
  };

  // Handle keyboard shortcuts
  const handleKeyDown = e => {
    // Handle Ctrl+Z (undo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setIsUndoRedo(true);
        if (onChange) {
          onChange(history[newIndex]);
        }
      }
      return;
    }

    // Handle Ctrl+Shift+Z or Ctrl+Y (redo)
    if (
      ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
      ((e.ctrlKey || e.metaKey) && e.key === 'y')
    ) {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setIsUndoRedo(true);
        if (onChange) {
          onChange(history[newIndex]);
        }
      }
      return;
    }

    // Allow other useful shortcuts
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'f')) {
      return;
    }
  };

  // Format JSON
  const formatJson = () => {
    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      if (onChange) {
        onChange(formatted);
      }
    } catch (error) {
      console.warn('Invalid JSON, cannot format');
    }
  };

  // Minify JSON
  const minifyJson = () => {
    try {
      const parsed = JSON.parse(value);
      const minified = JSON.stringify(parsed);
      if (onChange) {
        onChange(minified);
      }
    } catch (error) {
      console.warn('Invalid JSON, cannot minify');
    }
  };

  // Validate JSON
  const isValidJson = () => {
    if (!value.trim()) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  };

  // Manual resize functionality
  const startResize = useCallback(
    e => {
      if (!resizable) return;

      e.preventDefault();
      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = height;

      const handleMouseMove = e => {
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(
          minHeight,
          Math.min(maxHeight, startHeight + deltaY)
        );
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [height, minHeight, maxHeight, resizable]
  );

  // Initial auto-resize
  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const validJson = isValidJson();

  return (
    <div
      ref={containerRef}
      className={`${styles.jsonEditorContainer} ${className}`}
      style={{ height: `${height}px` }}
    >
      <div className={styles.editorHeader}>
        <div className={styles.editorControls}>
          {isJson && (
            <>
              <button
                type="button"
                className={styles.formatButton}
                onClick={formatJson}
                disabled={disabled || !value.trim() || !validJson}
                title="Format JSON"
              >
                Format
              </button>
              <button
                type="button"
                className={styles.minifyButton}
                onClick={minifyJson}
                disabled={disabled || !value.trim() || !validJson}
                title="Minify JSON"
              >
                Minify
              </button>
            </>
          )}
          {isJson && value.trim() && (
            <span
              className={validJson ? styles.validIcon : styles.errorIndicator}
            >
              {validJson ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Valid JSON
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Invalid JSON
                </>
              )}
            </span>
          )}
        </div>

        {showCopyButton && value && <CopyButton textToCopy={value} />}
      </div>

      <div className={styles.editorContent}>
        <textarea
          ref={textareaRef}
          id={editorId}
          className={`${styles.textarea} ${!validJson && isJson ? styles.error : ''}`}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          spellCheck={false}
          style={{ height: `${height - 40}px` }}
        />
      </div>

      {resizable && (
        <div
          ref={resizeHandleRef}
          className={`${styles.resizeHandle} ${isResizing ? styles.resizing : ''}`}
          onMouseDown={startResize}
          title="Drag to resize"
        >
          <div className={styles.resizeIndicator} />
        </div>
      )}
    </div>
  );
};

export default JsonEditor;
