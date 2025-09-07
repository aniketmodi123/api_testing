import { useEffect, useRef, useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { VariableResolver } from '../../utils/variableResolver';
import styles from './VariableInput.module.css';

export default function VariableInput({
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
  ...props
}) {
  const { variables, activeEnvironment } = useEnvironment();
  const [resolvedVariables, setResolvedVariables] = useState({});
  const [hoveredVariable, setHoveredVariable] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const inputRef = useRef(null);

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

    console.log('📋 Local variable resolution:', variableMap);
    setResolvedVariables(variableMap);
  }, [value, variables]);

  // Removed complex color highlighting to fix shadow-like appearance

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
    <div className={`${styles.variableInputContainer} ${className}`}>
      {/* Simple input field with tooltip functionality */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={styles.input}
        disabled={disabled}
        onMouseMove={handleInputMouseMove}
        onMouseLeave={handleInputMouseLeave}
        {...props}
      />

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
