import { useEffect, useRef, useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { VariableResolver } from '../../utils/variableResolver';
import styles from './VariableTextarea.module.css';

export default function VariableTextarea({
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
  rows = 4,
  ...props
}) {
  const { variables, activeEnvironment } = useEnvironment();
  const [resolvedVariables, setResolvedVariables] = useState({});
  const [hoveredVariable, setHoveredVariable] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const highlightRef = useRef(null);
  const textareaRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

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

  // Generate highlighted HTML
  const getHighlightedHTML = () => {
    if (!value) return '';

    return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const trimmedName = varName.trim();
      const isResolved = resolvedVariables.hasOwnProperty(trimmedName);
      const className = isResolved ? 'variable-found' : 'variable-missing';

      return `<span class="${className}" data-variable="${trimmedName}">${match}</span>`;
    });
  };

  // Handle textarea scroll sync
  const handleTextareaScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      const scrollTop = textareaRef.current.scrollTop;
      const scrollLeft = textareaRef.current.scrollLeft;
      setScrollTop(scrollTop);
      setScrollLeft(scrollLeft);
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
  };

  // Handle mouse move for tooltip positioning
  const handleMouseMove = e => {
    const target = e.target;
    if (target.dataset.variable) {
      const rect = target.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
      setHoveredVariable(target.dataset.variable);
    } else {
      setHoveredVariable(null);
    }
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setHoveredVariable(null);
  };

  return (
    <div className={`${styles.variableTextareaContainer} ${className}`}>
      {/* Background layer for highlighting */}
      <div
        ref={highlightRef}
        className={styles.highlightLayer}
        style={{
          transform: `translate(-${scrollLeft}px, -${scrollTop}px)`,
          minHeight: `${rows * 1.5}em`,
        }}
        dangerouslySetInnerHTML={{ __html: getHighlightedHTML() }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      {/* Actual textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={styles.textarea}
        disabled={disabled}
        rows={rows}
        onScroll={handleTextareaScroll}
        {...props}
      />

      {/* Tooltip */}
      {hoveredVariable && (
        <div
          className={styles.tooltip}
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y,
          }}
        >
          <div className={styles.tooltipContent}>
            <div className={styles.tooltipVariable}>
              <strong>{{ hoveredVariable }}</strong>
            </div>
            <div className={styles.tooltipValue}>
              {resolvedVariables[hoveredVariable] || '(not defined)'}
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
