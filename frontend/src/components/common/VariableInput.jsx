import { useEffect, useRef, useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { VariableResolver } from '../../utils/variableResolver';
import { useInlineVariableComplete } from '../../hooks/useInlineVariableComplete';
import VariableSuggest from './VariableSuggest/VariableSuggest';
import styles from './VariableInput.module.css';

export default function VariableInput({
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
  variant = 'default',
  ...props
}) {
  const { variables, activeEnvironment } = useEnvironment();
  const [resolvedVariables, setResolvedVariables] = useState({});
  const [hoveredVariable, setHoveredVariable] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  // {{variable}} autocomplete. applyValue emits a synthetic change so existing
  // onChange handlers (which read e.target.value/name) keep working, then restores caret.
  const applyValue = (newText, newCaret) => {
    onChange?.({ target: { value: newText, name: props.name } });
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(newCaret, newCaret);
      }
    });
  };
  const complete = useInlineVariableComplete({ elRef: inputRef, value, applyValue });

  // Resolve variables locally when value or environment changes
  useEffect(() => {
    if (!value || !variables) {
      setResolvedVariables({});
      return;
    }

    // Use local variable resolution - no API calls needed!
    const variableInfo = VariableResolver.getVariableInfo(value, variables);
    const variableMap = {};

    variableInfo.forEach(varInfo => {
      if (varInfo.found && varInfo.value !== null) {
        variableMap[varInfo.name] = varInfo.value;
      }
    });

    setResolvedVariables(variableMap);
  }, [value, variables]);

  // Build the colored overlay: {{token}} spans colored by resolved/missing, rest plain.
  const buildHighlights = () => {
    const text = value ?? '';
    const parts = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
      }
      const resolved = resolvedVariables.hasOwnProperty(match[1].trim());
      parts.push(
        <span key={`v-${match.index}`} className={resolved ? styles.token : styles.tokenMissing}>
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }
    return parts;
  };

  // Keep the overlay aligned with the input when text scrolls horizontally.
  const handleScroll = () => {
    if (inputRef.current && overlayRef.current) {
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  // Handle mouse move on input to detect variable hover
  const handleInputMouseMove = e => {
    const input = e.target;
    const rect = input.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Get the selection range to determine cursor position
    const cursorPosition = input.selectionStart;

    // Find which variable is at the mouse position
    const text = input.value;
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    let hoveredVar = null;

    // Create a temporary element to measure text width
    const measurer = document.createElement('span');
    measurer.style.font = window.getComputedStyle(input).font;
    measurer.style.visibility = 'hidden';
    measurer.style.position = 'absolute';
    measurer.style.whiteSpace = 'pre';
    document.body.appendChild(measurer);

    while ((match = regex.exec(text)) !== null) {
      const varStart = match.index;
      const varEnd = match.index + match[0].length;

      // Measure text width up to variable start and end
      measurer.textContent = text.substring(0, varStart);
      const startX = measurer.offsetWidth;

      measurer.textContent = text.substring(0, varEnd);
      const endX = measurer.offsetWidth;

      // Check if mouse is over this variable (accounting for padding)
      if (x >= startX + 12 && x <= endX + 12) {
        // 12px is left padding
        hoveredVar = match[1].trim();
        setTooltipPosition({
          x: rect.left + (startX + endX) / 2 + 12,
          y: rect.bottom + 10,
        });
        break;
      }
    }

    document.body.removeChild(measurer);
    setHoveredVariable(hoveredVar);
    setShowTooltip(hoveredVar !== null);
  };

  // Handle mouse leave
  const handleInputMouseLeave = () => {
    setShowTooltip(false);
    setHoveredVariable(null);
  };

  return (
    <div className={`${styles.variableInputContainer} ${variant === 'inline' ? styles.inline : ''} ${className}`}>
      {/* Simple input field with tooltip functionality */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange?.(e); complete.refresh(); }}
        placeholder={placeholder}
        className={styles.input}
        disabled={disabled}
        onMouseMove={handleInputMouseMove}
        onMouseLeave={handleInputMouseLeave}
        onScroll={handleScroll}
        onKeyDown={complete.handleKeyDown}
        onKeyUp={complete.refresh}
        onClick={complete.refresh}
        onBlur={complete.close}
        spellCheck={false}
        autoComplete="off"
        {...props}
      />
      <VariableSuggest
        open={complete.open}
        items={complete.items}
        activeIndex={complete.activeIndex}
        onHover={complete.setActiveIndex}
        onPick={complete.selectItem}
      />
      <div ref={overlayRef} className={styles.highlights} aria-hidden="true">
        {buildHighlights()}
      </div>

      {/* Tooltip for variable hover */}
      {showTooltip && hoveredVariable && (
        <div
          className={styles.tooltip}
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y,
          }}
        >
          <div className={styles.tooltipContent}>
            <div className={styles.tooltipVariable}>
              <strong>{hoveredVariable}</strong>
            </div>
            <div className={styles.tooltipValue}>
              {(() => {
                // First try resolved variables
                if (resolvedVariables[hoveredVariable] !== undefined) {
                  return resolvedVariables[hoveredVariable];
                }

                // Fallback to environment variables
                const envVar = variables?.find(v => v.key === hoveredVariable);
                if (envVar) {
                  return envVar.value;
                }

                return '(not defined)';
              })()}
            </div>
            {activeEnvironment && (
              <div className={styles.tooltipEnvironment}>
                Environment: {activeEnvironment.name}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
