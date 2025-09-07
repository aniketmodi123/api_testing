import { useEffect, useState } from 'react';
import { useEnvironment } from '../../store/environment';
import { Button } from '../common';
import styles from './VariableResolutionPanel.module.css';

export default function VariableResolutionPanel({ environment, variables }) {
  const { resolveVariables, extractVariables } = useEnvironment();

  const [inputText, setInputText] = useState('');
  const [resolvedText, setResolvedText] = useState('');
  const [foundVariables, setFoundVariables] = useState([]);
  const [missingVariables, setMissingVariables] = useState([]);
  const [isResolving, setIsResolving] = useState(false);
  const [lastResolution, setLastResolution] = useState(null);

  // Sample templates for common API requests
  const sampleTemplates = [
    {
      name: 'GET Request',
      template:
        'GET {{BASE_URL}}/api/users\nAuthorization: Bearer {{API_TOKEN}}\nContent-Type: application/json',
    },
    {
      name: 'POST Request',
      template:
        'POST {{BASE_URL}}/api/users\nAuthorization: Bearer {{API_TOKEN}}\nContent-Type: application/json\n\n{\n  "name": "{{USER_NAME}}",\n  "email": "{{USER_EMAIL}}"\n}',
    },
    {
      name: 'URL with Params',
      template:
        '{{BASE_URL}}/api/search?q={{SEARCH_TERM}}&limit={{PAGE_SIZE}}&api_key={{API_KEY}}',
    },
  ];

  // Auto-resolve when input changes
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (inputText.trim()) {
        handleResolve();
      } else {
        setResolvedText('');
        setFoundVariables([]);
        setMissingVariables([]);
        setLastResolution(null);
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [inputText, environment.id]);

  const handleResolve = async () => {
    if (!inputText.trim()) return;

    setIsResolving(true);

    try {
      const result = await resolveVariables(inputText, environment.id);

      if (result) {
        setResolvedText(result.resolved_text);
        setFoundVariables(result.variables_found || []);
        setMissingVariables(result.variables_missing || []);
        setLastResolution(result);
      }
    } catch (error) {
      console.error('Error resolving variables:', error);
      setResolvedText('Error resolving variables');
      setFoundVariables([]);
      setMissingVariables([]);
      setLastResolution(null);
    } finally {
      setIsResolving(false);
    }
  };

  const handleTemplateSelect = template => {
    setInputText(template);
  };

  const copyToClipboard = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy text:', err);
      return false;
    }
  };

  const handleCopyResolved = async () => {
    const success = await copyToClipboard(resolvedText);
    if (success) {
      // You can add a toast notification here
      console.log('✅ Copied to clipboard');
    }
  };

  const highlightVariables = text => {
    if (!text) return text;

    // Replace {{variable}} with highlighted spans
    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const trimmedName = varName.trim();
      const isMissing = missingVariables.includes(trimmedName);
      const className = isMissing ? 'variableMissing' : 'variableFound';

      return `<span class="${className}">${match}</span>`;
    });
  };

  return (
    <div className={styles.resolutionPanel}>
      <div className={styles.header}>
        <h3>Variable Resolution Preview</h3>
        <p className={styles.description}>
          Test how variables will be resolved in your API requests. Use{' '}
          <code>{'{{VARIABLE_NAME}}'}</code> syntax to reference variables.
        </p>
      </div>

      <div className={styles.content}>
        {/* Templates */}
        <div className={styles.section}>
          <h4>Quick Templates</h4>
          <div className={styles.templateButtons}>
            {sampleTemplates.map(template => (
              <Button
                key={template.name}
                variant="secondary"
                size="small"
                onClick={() => handleTemplateSelect(template.template)}
              >
                {template.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Input Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4>Input Text</h4>
            <div className={styles.sectionActions}>
              <Button
                variant="secondary"
                size="small"
                onClick={() => setInputText('')}
                disabled={!inputText}
              >
                Clear
              </Button>
            </div>
          </div>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            className={styles.inputTextarea}
            placeholder={`Enter your API request text here. Use {{VARIABLE_NAME}} to reference variables.\n\nExample:\nGET {{BASE_URL}}/api/users\nAuthorization: Bearer {{API_TOKEN}}`}
            rows={8}
          />
        </div>

        {/* Variables Status */}
        {(foundVariables.length > 0 || missingVariables.length > 0) && (
          <div className={styles.section}>
            <h4>Variables Found</h4>
            <div className={styles.variableStatus}>
              {foundVariables.length > 0 && (
                <div className={styles.foundVariables}>
                  <h5>✅ Available ({foundVariables.length})</h5>
                  <div className={styles.variableList}>
                    {foundVariables.map(varName => {
                      const variable = variables.find(v => v.key === varName);
                      return (
                        <div key={varName} className={styles.variableItem}>
                          <span className={styles.variableName}>{varName}</span>
                          {variable && (
                            <span className={styles.variableValue}>
                              {variable.value || '(empty)'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {missingVariables.length > 0 && (
                <div className={styles.missingVariables}>
                  <h5>❌ Missing ({missingVariables.length})</h5>
                  <div className={styles.variableList}>
                    {missingVariables.map(varName => (
                      <div key={varName} className={styles.variableItem}>
                        <span className={styles.variableName}>{varName}</span>
                        <span className={styles.missingText}>Not defined</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Output Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4>Resolved Output</h4>
            <div className={styles.sectionActions}>
              {resolvedText && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={handleCopyResolved}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"
                      fill="currentColor"
                    />
                  </svg>
                  Copy
                </Button>
              )}
            </div>
          </div>

          {isResolving ? (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <span>Resolving variables...</span>
            </div>
          ) : resolvedText ? (
            <div className={styles.outputContainer}>
              <pre className={styles.outputText}>{resolvedText}</pre>
            </div>
          ) : (
            <div className={styles.emptyOutput}>
              <span>Enter text above to see resolved output</span>
            </div>
          )}
        </div>

        {/* Resolution Stats */}
        {lastResolution && (
          <div className={styles.section}>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Environment:</span>
                <span className={styles.statValue}>{environment.name}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Variables Found:</span>
                <span className={styles.statValue}>
                  {foundVariables.length}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Variables Resolved:</span>
                <span className={styles.statValue}>
                  {lastResolution.variables_resolved?.length || 0}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Missing:</span>
                <span
                  className={`${styles.statValue} ${missingVariables.length > 0 ? styles.warning : ''}`}
                >
                  {missingVariables.length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
