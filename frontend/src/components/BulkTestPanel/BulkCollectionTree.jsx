import { useEffect, useState } from 'react';
import { workspaceService } from '../../services/workspaceService';
import { useWorkspace } from '../../store/workspace';
import LookingLoader from '../LookingLoader/LookingLoader';
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
  testScope = 'selected',
}) => {
  if (node.type === 'folder') {
    // Always show all folders, including inner folders, regardless of testScope

    // Recursively collect all files under a folder
    const collectAllFiles = folderNode => {
      let files = [];
      if (!folderNode.children) return files;
      for (const child of folderNode.children) {
        if (child.type === 'file') {
          files.push({
            id: child.id,
            type: 'api',
            name: child.name,
            method: child.method || 'GET',
            testCasesCount: child.children ? child.children.length : 0,
            children: child.children || [],
          });
        } else if (child.type === 'folder') {
          files = files.concat(collectAllFiles(child));
        }
      }
      return files;
    };

    const handleFolderSelection = () => {
      const folderItem = {
        id: node.id,
        type: 'folder',
        name: node.name,
        children: node.children || [],
        testCasesCount: node.children
          ? node.children.reduce((count, child) => {
              if (child.type === 'file') {
                return count + (child.children ? child.children.length : 0);
              }
              return count;
            }, 0)
          : 0,
      };
      const allFiles = collectAllFiles(node);
      if (isFolderSelected()) {
        onSelectRequest({
          action: 'deselect',
          item: folderItem,
          files: allFiles,
        });
      } else {
        onSelectRequest({
          action: 'select',
          item: folderItem,
          files: allFiles,
        });
      }
    };

    const isFolderSelected = () => {
      return selectedItems.some(
        item => item.id === node.id && item.type === 'folder'
      );
    };

    // Folder selectable in all modes
    const showFolderSelector =
      testScope === 'folder' || testScope === 'all' || testScope === 'selected';

    return (
      <div className={styles.folderItem}>
        <div className={styles.folderHeader}>
          {showFolderSelector && (
            <div
              className={`${styles.folderSelector} ${isFolderSelected() ? styles.selected : ''}`}
              onClick={e => {
                e.stopPropagation();
                handleFolderSelection();
              }}
              title="Select entire folder"
            >
              <span className={styles.selectIcon}>
                {isFolderSelected() ? '☑️' : '☐'}
              </span>
            </div>
          )}
          <div
            className={styles.folderToggle}
            onClick={() => toggleFolder(node.id)}
          >
            <span className={styles.folderIcon}>
              {expandedFolders.includes(node.id) ? '📂' : '📁'}
            </span>
            <span className={styles.folderName}>{node.name}</span>
          </div>
        </div>

        {/* Children: always show for expanded folders, filter by testScope */}
        {node.children && expandedFolders.includes(node.id) && (
          <div className={styles.folderItems}>
            {node.children
              .filter(childNode => {
                if (testScope === 'all') {
                  // Only show folders in 'Folders only' mode
                  return childNode.type === 'folder';
                }
                if (testScope === 'folder') {
                  // Show all folders and files
                  return (
                    childNode.type === 'folder' || childNode.type === 'file'
                  );
                }
                // 'selected' shows all
                return true;
              })
              .map(childNode => (
                <BulkNodeItem
                  key={childNode.id}
                  node={childNode}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  onSelectRequest={onSelectRequest}
                  selectedItems={selectedItems}
                  getMethodColor={getMethodColor}
                  level={level + 1}
                  testScope={testScope}
                />
              ))}
          </div>
        )}
      </div>
    );
  } else if (node.type === 'file') {
    // Only show files in 'selected' and 'folder' modes
    if (testScope === 'all') return null;

    const handleApiFileSelection = () => {
      const apiItem = {
        id: node.id,
        type: 'api',
        name: node.name,
        method: node.method || 'GET',
        testCasesCount: node.children ? node.children.length : 0,
        children: node.children || [],
      };
      if (isApiSelected()) {
        onSelectRequest({ action: 'deselect', item: apiItem });
      } else {
        onSelectRequest({ action: 'select', item: apiItem });
      }
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
          <div
            className={styles.fileToggle}
            onClick={() => toggleFolder(node.id)}
          >
            {node.method && (
              <span
                className={styles.methodBadge}
                style={{ backgroundColor: getMethodColor(node.method) }}
              >
                {node.method}
              </span>
            )}
            <span className={styles.fileName}>{node.name}</span>
          </div>
        </div>

        {/* Only show cases in 'selected' mode */}
        {testScope === 'selected' &&
          node.children &&
          expandedFolders.includes(node.id) && (
            <div className={styles.fileItems}>
              {node.children.map(testCase => {
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
                const isSelected = selectedItems.some(
                  item => item.id === testCase.id && item.type === 'case'
                );
                return (
                  <div
                    key={testCase.id}
                    className={`${styles.testCaseItem} ${isSelected ? styles.selected : ''}`}
                    onClick={() => {
                      if (isSelected) {
                        onSelectRequest({ action: 'deselect', item: caseItem });
                      } else {
                        onSelectRequest({ action: 'select', item: caseItem });
                      }
                    }}
                    style={{ paddingLeft: `${(level + 1) * 2}px` }}
                    title={testCase.name}
                  >
                    <span className={styles.caseName}>
                      {testCase.name.length > 35
                        ? `${testCase.name.substring(0, 32)}...`
                        : testCase.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    );
  }
};

export default function BulkCollectionTree({
  onSelectRequest,
  selectedItems = [],
  testScope = 'selected',
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
    return <LookingLoader overlay text="Loading ..." />;
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
          testScope={testScope}
        />
      ))}
    </div>
  );
}
