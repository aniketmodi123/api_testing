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
  testScope,
  onRemoveSelection,
  onClearSelections,
}) {
  const [expandedFolders, setExpandedFolders] = useState(new Set());

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

  // Helper: build a nested folder tree from selectedItems
  function buildFolderTree(items) {
    const idToNode = {};
    const roots = [];
    items
      .filter(i => i.type === 'folder')
      .forEach(folder => {
        idToNode[folder.id] = { ...folder, children: [] };
      });
    // Attach children to parents
    Object.values(idToNode).forEach(folder => {
      if (folder.parentFolderId && idToNode[folder.parentFolderId]) {
        idToNode[folder.parentFolderId].children.push(folder);
      } else {
        roots.push(folder);
      }
    });
    return roots;
  }

  // Only show folders in tree if testScope === 'folder'
  if (testScope === 'folder') {
    const folderTree = buildFolderTree(selectedItems);

    const renderFolderNode = (folder, level = 0) => {
      const isExpanded = expandedFolders.has(folder.id);
      return (
        <div key={folder.id} style={{ marginLeft: level * 16 }}>
          <div className={styles.apiHeader}>
            <div
              className={styles.apiInfo}
              onClick={() => {
                const newSet = new Set(expandedFolders);
                if (isExpanded) newSet.delete(folder.id);
                else newSet.add(folder.id);
                setExpandedFolders(newSet);
              }}
              style={{ cursor: 'pointer' }}
              title="Expand/collapse folder"
            >
              <span className={styles.itemIcon}>{getItemIcon('folder')}</span>
              <span className={styles.apiName}>{folder.name}</span>
              <span className={styles.apiSummary}>
                {folder.testCasesCount || 0} test cases
              </span>
            </div>
            <button
              className={styles.removeButton}
              onClick={() => onRemoveSelection(folder.id, 'folder', null)}
              title="Remove this folder"
            >
              ❌
            </button>
          </div>
          {isExpanded && folder.children && folder.children.length > 0 && (
            <div>
              {folder.children.map(child => renderFolderNode(child, level + 1))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className={styles.selectionSection}>
        <div className={styles.selectionHeader}>
          <button className={styles.clearButton} onClick={onClearSelections}>
            Clear All
          </button>
        </div>
        <div className={styles.selectedItemsList}>
          {folderTree.map(folder => renderFolderNode(folder))}
        </div>
      </div>
    );
  }

  // ...existing code for API/case selection panel...
  // (Paste the previous API/case rendering logic here if needed)
}
