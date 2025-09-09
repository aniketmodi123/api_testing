import { useEffect, useState } from 'react';
import { workspaceService } from '../../services/workspaceService';
import { useWorkspace } from '../../store/workspace';
import styles from './BulkCollectionTree.module.css';

// Enhanced Node Item component with bulk selection support
const BulkNodeItem = ({
  node,
  expandedFolders,
  toggleFolder,
  onSelectRequest,
  selectedItems,
  getMethodColor,
  level = 0,
}) => {
  if (node.type === 'folder') {
    return (
      <div
        className={styles.folderItem}
        style={{ paddingLeft: `${level * 2}px` }}
      >
        <div
          className={styles.folderHeader}
          onClick={() => toggleFolder(node.id)}
        >
          <span className={styles.folderIcon}>
            {expandedFolders.includes(node.id) ? '📂' : '📁'}
          </span>
          <span className={styles.folderName}>{node.name}</span>
        </div>

        {node.children && expandedFolders.includes(node.id) && (
          <div className={styles.folderItems}>
            {node.children.map(childNode => (
              <BulkNodeItem
                key={childNode.id}
                node={childNode}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onSelectRequest={onSelectRequest}
                selectedItems={selectedItems}
                getMethodColor={getMethodColor}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  } else if (node.type === 'file') {
    // Handle file nodes that now contain test cases directly (not APIs)
    const handleTestCaseSelection = testCase => {
      const caseItem = {
        id: testCase.id,
        caseId: testCase.id,
        caseName: testCase.name,
        type: 'case',
        parentFileName: node.name,
        parentFileId: node.id,
        method: testCase.method || 'GET',
        name: `${node.name} - ${testCase.name}`,
        created_at: testCase.created_at,
      };
      onSelectRequest(caseItem);
    };

    const handleApiFileSelection = () => {
      const apiItem = {
        id: node.id,
        type: 'api',
        name: node.name,
        method: node.method || 'GET',
        testCasesCount: node.children ? node.children.length : 0,
        children: node.children || [],
      };
      onSelectRequest(apiItem);
    };

    const isCaseSelected = testCase => {
      // Case is selected if:
      // 1. Individual case is selected AND whole API is not selected
      // 2. OR if whole API is selected (but we'll handle display differently)
      const individualCaseSelected = selectedItems.some(
        item => item.id === testCase.id && item.type === 'case'
      );
      const wholeApiSelected = selectedItems.some(
        item => item.id === node.id && item.type === 'api'
      );

      // Only show case as selected if individual case is selected and whole API is NOT selected
      return individualCaseSelected && !wholeApiSelected;
    };

    const isApiSelected = () => {
      return selectedItems.some(
        item => item.id === node.id && item.type === 'api'
      );
    };

    return (
      <div
        className={styles.fileItem}
        style={{ paddingLeft: `${level * 2}px` }}
      >
        <div className={styles.fileHeader}>
          {/* API Selection checkbox/button */}
          <div
            className={`${styles.apiSelector} ${isApiSelected() ? styles.selected : ''}`}
            onClick={handleApiFileSelection}
            title="Select entire API with all test cases"
          >
            <span className={styles.selectIcon}>
              {isApiSelected() ? '☑️' : '☐'}
            </span>
          </div>

          {/* Toggle expand/collapse */}
          <div
            className={styles.fileToggle}
            onClick={() => toggleFolder(node.id)}
          >
            <span className={styles.expandIcon}>
              {expandedFolders.includes(node.id) ? '📂' : '📁'}
            </span>
            {/* Show method badge for files since they now have methods */}
            {node.method && (
              <span
                className={styles.methodBadge}
                style={{
                  backgroundColor: getMethodColor(node.method),
                }}
              >
                {node.method}
              </span>
            )}
            <span className={styles.fileName}>
              {node.name}{' '}
              {node.children &&
                node.children.length > 0 &&
                `(${node.children.length})`}
            </span>
          </div>
        </div>

        {node.children && expandedFolders.includes(node.id) && (
          <div className={styles.fileItems}>
            {node.children.map(testCase => (
              <div
                key={testCase.id}
                className={`${styles.testCaseItem} ${
                  isCaseSelected(testCase) ? styles.selected : ''
                }`}
                onClick={() => handleTestCaseSelection(testCase)}
                style={{ paddingLeft: `${(level + 1) * 2}px` }}
                title={testCase.name}
              >
                <span className={styles.caseName}>
                  {testCase.name.length > 35
                    ? `${testCase.name.substring(0, 32)}...`
                    : testCase.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
};

export default function BulkCollectionTree({
  onSelectRequest,
  selectedItems = [],
}) {
  const { activeWorkspace } = useWorkspace();
  const [bulkTreeData, setBulkTreeData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false); // Track if data has been loaded

  // Load workspace tree with APIs and test cases
  useEffect(() => {
    let isMounted = true; // Prevent state updates if component unmounts

    if (activeWorkspace?.id && !hasLoaded) {
      loadBulkTestingTree(isMounted);
    }

    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, hasLoaded]); // Add hasLoaded to dependencies

  const loadBulkTestingTree = async (isMounted = true) => {
    if (!activeWorkspace?.id || loading) return; // Prevent duplicate calls

    console.log('Loading bulk testing tree for workspace:', activeWorkspace.id);
    setLoading(true);
    try {
      const response = await workspaceService.getBulkTestingTree(
        activeWorkspace.id
      );

      if (!isMounted) return; // Don't update state if component unmounted

      if (response.data && response.data.file_tree) {
        setBulkTreeData(response.data.file_tree);
        setHasLoaded(true); // Mark as loaded

        // Don't auto-expand - let user click to expand
        // Only auto-expand folders (but not files)
        const expandedIds = [];
        const traverseAndExpand = nodes => {
          nodes.forEach(node => {
            if (
              node.type === 'folder' &&
              node.children &&
              node.children.length > 0
            ) {
              // Only auto-expand folders, not files
              expandedIds.push(node.id);
              traverseAndExpand(node.children);
            }
          });
        };

        traverseAndExpand(response.data.file_tree);
        setExpandedFolders(expandedIds);

        console.log('Loaded bulk testing tree:', response.data);
        console.log('Total APIs:', response.data.total_apis);
        console.log('Total test cases:', response.data.total_test_cases);
        console.log('Auto-expanded folders:', expandedIds);
      }
    } catch (error) {
      console.error('Failed to load bulk testing tree:', error);
      if (isMounted) {
        setBulkTreeData([]);
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const toggleFolder = folderId => {
    setExpandedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  const getMethodColor = method => {
    const colors = {
      GET: '#28a745',
      POST: '#007bff',
      PUT: '#ffc107',
      DELETE: '#dc3545',
      PATCH: '#17a2b8',
      OPTIONS: '#6c757d',
      HEAD: '#6f42c1',
    };
    return colors[method?.toUpperCase()] || colors.GET;
  };

  const handleSelectRequest = item => {
    // Just call parent callback - don't maintain internal state
    onSelectRequest(item);
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <p>Loading bulk testing tree...</p>
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className={styles.emptyState}>
        <p>No workspace selected</p>
      </div>
    );
  }

  if (!bulkTreeData || bulkTreeData.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No APIs found for bulk testing</p>
      </div>
    );
  }

  return (
    <div className={styles.treeContainer}>
      {bulkTreeData.map(node => (
        <BulkNodeItem
          key={node.id}
          node={node}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          onSelectRequest={handleSelectRequest}
          selectedItems={selectedItems}
          getMethodColor={getMethodColor}
        />
      ))}
    </div>
  );
}
