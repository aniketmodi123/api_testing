import { useRef, useState } from 'react';
import styles from './VariableAwareInput.module.css';

/**
 * URL bar input that highlights {{VARIABLE}} tokens.
 * On hover over a token, shows a tooltip with the resolved value.
 *
 * Props:
 *   value        – controlled string value
 *   onChange     – (newValue: string) => void
 *   variables    – { [key: string]: string } resolved variable map
 *   placeholder  – string
 *   className    – extra class for the wrapper
 */
const VAR_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_-]*)\}\}/g;

export default function VariableAwareInput({ value = '', onChange, variables = {}, placeholder, className }) {
  const [tooltip, setTooltip] = useState(null); // { key, resolved }
  const inputRef = useRef(null);

  // Build highlighted spans for the overlay layer
  const buildHighlights = () => {
    const parts = [];
    let lastIndex = 0;
    let match;
    VAR_RE.lastIndex = 0;
    while ((match = VAR_RE.exec(value)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={lastIndex}>{value.slice(lastIndex, match.index)}</span>);
      }
      const key = match[1];
      parts.push(
        <span key={match.index} className={styles.token}>{match[0]}</span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      parts.push(<span key={lastIndex}>{value.slice(lastIndex)}</span>);
    }
    return parts;
  };

  const handleMouseMove = e => {
    // Find if cursor is over a {{VAR}} token region
    const input = inputRef.current;
    if (!input) return;
    const charW = 7.8; // approximate char width in mono 13px
    const paddingLeft = 10;
    const x = e.clientX - input.getBoundingClientRect().left - paddingLeft;
    const charIdx = Math.floor(x / charW);

    VAR_RE.lastIndex = 0;
    let found = null;
    let match;
    while ((match = VAR_RE.exec(value)) !== null) {
      if (charIdx >= match.index && charIdx < match.index + match[0].length) {
        const key = match[1];
        const resolved = variables[key];
        found = { key, resolved: resolved !== undefined ? resolved : '(not set)' };
        break;
      }
    }
    setTooltip(found);
  };

  return (
    <div className={`${styles.wrapper} ${className || ''}`}>
      <input
        ref={inputRef}
        className={styles.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        spellCheck={false}
        autoComplete="off"
      />
      <div className={styles.highlights} aria-hidden="true">
        {buildHighlights()}
      </div>
      {tooltip && (
        <div className={styles.tooltip}>
          <strong>{`{{${tooltip.key}}}`}</strong> = {tooltip.resolved}
        </div>
      )}
    </div>
  );
}
