import { useState } from 'react';
import styles from './BulkTestPanel.module.css';

const getItemIcon = type => {
  switch (type) {
    case 'api':
      return '🔗';
    case 'case':
      return '📝';
    case 'folder':
      return '📁';
    default:
      return '📄';
  }
};

export default function BulkSelection({
  selectedItems,
  onRemoveSelection,
  onClearSelections,
}) {
  const [expandedApis, setExpandedApis] = useState(new Set());

  if (selectedItems.length === 0) {
    return (
      <div className={styles.selectionSection}>
        <div className={styles.emptySelection}>
          No items selected. Click on APIs or test cases in the tree to add
          them.
        </div>
      </div>
    );
  }

  // Group items by API/file
  const groupedItems = {};
  selectedItems.forEach(item => {
    if (item.type === 'api') {
      // This is a whole API selection
      if (!groupedItems[item.id]) {
        groupedItems[item.id] = {
          api: item,
          cases: [],
          isWholeApi: true,
        };
      } else {
        // If there are individual cases and now we select whole API,
        // upgrade to whole API and clear individual cases
        groupedItems[item.id].api = item;
        groupedItems[item.id].isWholeApi = true;
        groupedItems[item.id].cases = []; // Clear individual cases since whole API is selected
      }
    } else if (item.type === 'case') {
      // This is an individual test case
      const apiId = item.parentFileId || item.id;
      if (!groupedItems[apiId]) {
        groupedItems[apiId] = {
          api: {
            id: apiId,
            name: item.parentFileName || 'Unknown API',
            type: 'api',
            method: item.method,
          },
          cases: [],
          isWholeApi: false,
        };
      }

      // Only add individual cases if whole API is not selected
      if (!groupedItems[apiId].isWholeApi) {
        groupedItems[apiId].cases.push(item);
      }
      // If whole API is already selected, ignore individual case selections
    }
  });

  const toggleApiExpansion = apiId => {
    const newExpanded = new Set(expandedApis);
    if (newExpanded.has(apiId)) {
      newExpanded.delete(apiId);
    } else {
      newExpanded.add(apiId);
    }
    setExpandedApis(newExpanded);
  };

  const removeWholeApi = apiId => {
    // Remove the whole API selection
    onRemoveSelection(parseInt(apiId), 'api', null);
  };

  const removeIndividualCase = (caseId, apiId) => {
    // Remove individual test case
    onRemoveSelection(caseId, 'case', caseId);
  };

  return (
    <div className={styles.selectionSection}>
      <div className={styles.selectionHeader}>
        <button className={styles.clearButton} onClick={onClearSelections}>
          Clear All
        </button>
      </div>

      <div className={styles.selectedItemsList}>
        {Object.entries(groupedItems).map(([apiId, group]) => {
          const isExpanded = expandedApis.has(apiId);
          const selectedCasesCount = group.cases.length;
          const totalCasesCount =
            group.api.testCasesCount || selectedCasesCount;

          return (
            <div key={apiId} className={styles.apiGroup}>
              {/* API Header */}
              <div className={styles.apiHeader}>
                <div
                  className={styles.apiInfo}
                  onClick={() => {
                    // Toggle API selection when clicking on the API info
                    if (group.isWholeApi) {
                      removeWholeApi(apiId);
                    } else {
                      toggleApiExpansion(apiId);
                    }
                  }}
                >
                  <span className={styles.expandIcon}>
                    {group.isWholeApi ? '🔗' : isExpanded ? '📂' : '📁'}
                  </span>
                  <span className={styles.itemIcon}>{getItemIcon('api')}</span>
                  <div className={styles.apiDetails}>
                    <span className={styles.apiName}>{group.api.name}</span>
                    <span className={styles.apiSummary}>
                      {group.isWholeApi
                        ? `All cases (${totalCasesCount})`
                        : `${selectedCasesCount} selected case${selectedCasesCount !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  {group.api.method && (
                    <span className={styles.methodTag}>{group.api.method}</span>
                  )}
                </div>

                <button
                  className={styles.removeButton}
                  onClick={() => {
                    if (group.isWholeApi) {
                      removeWholeApi(apiId);
                    } else {
                      // Remove all individual cases for this API
                      group.cases.forEach(case_ => {
                        removeIndividualCase(case_.id, apiId);
                      });
                    }
                  }}
                  title="Remove all from this API"
                >
                  ❌
                </button>
              </div>

              {/* Expanded Cases List */}
              {isExpanded && !group.isWholeApi && group.cases.length > 0 && (
                <div className={styles.casesList}>
                  {group.cases.map((case_, index) => (
                    <div
                      key={`${case_.id}-${index}`}
                      className={styles.caseItem}
                      onClick={() =>
                        removeIndividualCase(case_.id, parseInt(apiId))
                      }
                      style={{ cursor: 'pointer' }}
                      title="Click to remove this test case"
                    >
                      <div className={styles.caseDetails}>
                        <span className={styles.caseName}>
                          {case_.caseName || case_.name}
                        </span>
                      </div>
                      <button
                        className={styles.removeCaseButton}
                        onClick={e => {
                          e.stopPropagation(); // Prevent triggering the parent onClick
                          removeIndividualCase(case_.id, parseInt(apiId));
                        }}
                        title="Remove this test case"
                      >
                        ✖️
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Show message for whole API selection */}
              {isExpanded && group.isWholeApi && (
                <div className={styles.wholeApiMessage}>
                  <span>
                    🔗 Entire API selected - all test cases will be included
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
