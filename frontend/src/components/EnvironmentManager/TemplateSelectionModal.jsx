import { useEnvironment } from '../../store/environment';
import { Button } from '../common';
import styles from './TemplateSelectionModal.module.css';

export default function TemplateSelectionModal({ onClose, onSelectTemplate }) {
  const { getAvailableTemplates } = useEnvironment();
  const templates = getAvailableTemplates();

  const handleTemplateSelect = templateName => {
    onSelectTemplate(templateName);
  };

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Create from Template</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.description}>
            Choose a template to quickly set up an environment with
            pre-configured variables for common use cases.
          </p>

          <div className={styles.templateGrid}>
            {templates.map(template => (
              <div
                key={template.name}
                className={styles.templateCard}
                onClick={() => handleTemplateSelect(template.name)}
              >
                <div className={styles.templateHeader}>
                  <h3 className={styles.templateName}>
                    {template.displayName}
                  </h3>
                  <div className={styles.variableCount}>
                    {template.variables.length} variables
                  </div>
                </div>

                <p className={styles.templateDescription}>
                  {template.description}
                </p>

                <div className={styles.variablePreview}>
                  <h4>Included variables:</h4>
                  <ul className={styles.variableList}>
                    {template.variables.slice(0, 3).map(variable => (
                      <li key={variable.key} className={styles.variableItem}>
                        <span className={styles.variableKey}>
                          {variable.key}
                        </span>
                        {variable.is_secret && (
                          <span className={styles.secretBadge}>🔒 Secret</span>
                        )}
                      </li>
                    ))}
                    {template.variables.length > 3 && (
                      <li className={styles.moreVariables}>
                        +{template.variables.length - 3} more...
                      </li>
                    )}
                  </ul>
                </div>

                <div className={styles.templateActions}>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={e => {
                      e.stopPropagation();
                      handleTemplateSelect(template.name);
                    }}
                  >
                    Use Template
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.modalFooter}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
