import { useCallback, useEffect, useRef, useState } from 'react';
import BulkCollectionTree from './BulkTestPanel/BulkCollectionTree.jsx';
import BulkControls from './BulkTestPanel/BulkControls.jsx';
import BulkResults from './BulkTestPanel/BulkResults.jsx';
import BulkScheduler from './BulkTestPanel/BulkScheduler.jsx';
import BulkSelection from './BulkTestPanel/BulkSelection.jsx';
import styles from './BulkTestPanel/BulkTestPanel.module.css';
import LookingLoader from './LookingLoader/LookingLoader';

export default function BulkTestPanel({ onSelectRequest }) {
  const [selectedItems, setSelectedItems] = useState([]);
  const [testScope, setTestScope] = useState('selected'); // 'selected', 'folder', 'all'
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [selectedApiCases, setSelectedApiCases] = useState([]);

  // Tab management for right panel
  const [activeTab, setActiveTab] = useState('selection'); // 'selection', 'results', 'scheduled'

  // Resizable functionality
  const [leftPanelWidth, setLeftPanelWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);
  const resizerRef = useRef(null);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = e => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Set min and max width constraints
      const minWidth = 200;
      const maxWidth = Math.min(500, containerRect.width * 0.6);

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setLeftPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Switch to results tab when results are available
  useEffect(() => {
    if (results && !isRunning) {
      setActiveTab('results');
    }
  }, [results, isRunning]);

  // Sync selectedApiCases with selectedItems
  useEffect(() => {
    // Build the API-call-ready structure
    const apiCases = selectedItems
      .filter(item => item.type === 'api')
      .map(api => ({
        file_id: api.id,
        cases:
          api.selectedCases && api.selectedCases.length > 0
            ? api.selectedCases.map(c => c.caseId)
            : api.children
              ? api.children.map(c => c.id)
              : [],
      }))
      .filter(entry => entry.cases.length > 0);
    setSelectedApiCases(apiCases);
  }, [selectedItems]);

  useEffect(() => {
    if (selectedApiCases.length > 0) {
      console.log('Selected API Cases (for API call):', selectedApiCases);
    }
  }, [selectedApiCases]);

  const handleResizerMouseDown = e => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Handle selection from collection tree (both APIs and test cases)
  const handleTreeSelection = useCallback(
    item => {
      if (onSelectRequest) {
        onSelectRequest(item);
      }

      setSelectedItems(prev => {
        // Helper to get all APIs under a folder recursively
        const getAllApisInFolder = folder => {
          let apis = [];
          if (folder.children) {
            folder.children.forEach(child => {
              if (child.type === 'api' || child.type === 'file') {
                apis.push({
                  id: child.id,
                  type: 'api',
                  name: child.name,
                  method: child.method || 'GET',
                  folderId: folder.id,
                  parentFolderId: folder.id,
                  children: child.children || [],
                  testCasesCount: child.children ? child.children.length : 0,
                });
              } else if (child.type === 'folder') {
                apis = apis.concat(getAllApisInFolder(child));
              }
            });
          }
          return apis;
        };

        // Helper to get all descendant folders recursively
        const getAllFoldersInFolder = folder => {
          let folders = [];
          if (folder.children) {
            folder.children.forEach(child => {
              if (child.type === 'folder') {
                folders.push({
                  id: child.id,
                  type: 'folder',
                  name: child.name,
                  children: child.children || [],
                  testCasesCount: child.children
                    ? child.children.reduce(
                        (count, c) =>
                          c.type === 'file'
                            ? count + (c.children ? c.children.length : 0)
                            : count,
                        0
                      )
                    : 0,
                });
                folders = folders.concat(getAllFoldersInFolder(child));
              }
            });
          }
          return folders;
        };

        // Folder deselection logic
        if (item.type === 'folder' && item.remove) {
          // Remove the folder, all descendant folders, all descendant APIs/files, and all ancestor folders
          const apisInFolder = getAllApisInFolder(item);
          const foldersInFolder = getAllFoldersInFolder(item);
          // Collect all descendant API/file/folder IDs
          let allApiIds = apisInFolder.map(api => api.id);
          let allFolderIds = foldersInFolder.map(folder => folder.id);

          // Helper to find all ancestor folder IDs (by traversing up parentFolderId)
          function findAncestorFolderIds(folderId, allSelected) {
            let ancestors = [];
            let parentId = null;
            // Find the folder in the tree
            const folderItem = allSelected.find(
              f => f.id === folderId && f.type === 'folder'
            );
            if (folderItem && folderItem.parentFolderId) {
              parentId = folderItem.parentFolderId;
            } else if (item.parentFolderId) {
              parentId = item.parentFolderId;
            }
            while (parentId) {
              const parent = allSelected.find(
                f => f.id === parentId && f.type === 'folder'
              );
              if (parent) {
                ancestors.push(parent.id);
                parentId = parent.parentFolderId;
              } else {
                break;
              }
            }
            return ancestors;
          }

          const ancestorFolderIds = findAncestorFolderIds(item.id, prev);

          return prev.filter(existing => {
            // Remove if this is the folder, or any descendant folder, or any descendant API/file, or any ancestor folder
            if (existing.id === item.id && existing.type === 'folder')
              return false;
            if (
              allFolderIds.includes(existing.id) &&
              existing.type === 'folder'
            )
              return false;
            if (
              allApiIds.includes(existing.id) &&
              (existing.type === 'api' || existing.type === 'file')
            )
              return false;
            if (
              allApiIds.includes(existing.parentFileId) &&
              existing.type === 'case'
            )
              return false;
            if (
              ancestorFolderIds.includes(existing.id) &&
              existing.type === 'folder'
            )
              return false;
            return true;
          });
        }

        // Remove logic for toggling (existing logic for file/case/folder add/remove)
        const exists = prev.find(
          selected =>
            selected.id === item.id &&
            selected.type === item.type &&
            (selected.caseId === item.caseId ||
              typeof selected.caseId === 'undefined')
        );
        if (exists) {
          // Toggle off: remove item and, if folder, all its APIs
          if (item.type === 'folder') {
            const apisInFolder = getAllApisInFolder(item);
            return prev.filter(
              existing =>
                existing.id !== item.id &&
                !apisInFolder.some(api => api.id === existing.id)
            );
          }
          if (item.type === 'api') {
            return prev.filter(existing => existing.id !== item.id);
          }
          if (item.type === 'case') {
            // Remove only this case from the API's selectedCases
            return prev
              .map(existing => {
                if (
                  existing.type === 'api' &&
                  existing.id === item.parentFileId &&
                  existing.selectedCases
                ) {
                  return {
                    ...existing,
                    selectedCases: existing.selectedCases.filter(
                      c => c.caseId !== item.caseId
                    ),
                  };
                }
                return existing;
              })
              .filter(existing => {
                // Remove API if no selectedCases left
                if (
                  existing.type === 'api' &&
                  existing.selectedCases &&
                  existing.selectedCases.length === 0
                ) {
                  return false;
                }
                return true;
              });
          }
        }

        let newItems = [...prev];

        if (item.type === 'folder') {
          // Remove any APIs or cases from this folder
          newItems = newItems.filter(
            existing =>
              existing.parentFolderId !== item.id &&
              !(existing.type === 'api' && existing.folderId === item.id)
          );
          // Add the folder itself and all descendant folders to selectedItems
          const folderObj = {
            id: item.id,
            type: 'folder',
            name: item.name,
            children: item.children || [],
            testCasesCount: item.testCasesCount || 0,
          };
          const folders = getAllFoldersInFolder(item);
          // Add all APIs in this folder
          const apis = getAllApisInFolder(item);
          return [
            ...newItems,
            folderObj,
            ...folders,
            ...apis.map(api => ({
              ...api,
              selected: true,
              selectedCases: [],
            })),
          ];
        } else if (item.type === 'api') {
          // Remove any selected cases for this API
          newItems = newItems.filter(
            existing =>
              !(existing.type === 'api' && existing.id === item.id) &&
              !(existing.type === 'case' && existing.parentFileId === item.id)
          );
          return [
            ...newItems,
            {
              ...item,
              selected: true,
              selectedCases: [],
            },
          ];
        } else if (item.type === 'case') {
          // If parent API is already selected, toggle this case in selectedCases
          let foundApi = newItems.find(
            existing =>
              existing.type === 'api' && existing.id === item.parentFileId
          );
          if (foundApi) {
            const alreadySelected = (foundApi.selectedCases || []).some(
              c => c.caseId === item.caseId
            );
            let updatedCases;
            if (alreadySelected) {
              // Remove the case
              updatedCases = foundApi.selectedCases.filter(
                c => c.caseId !== item.caseId
              );
            } else {
              // Add the case
              updatedCases = [
                ...(foundApi.selectedCases || []),
                {
                  caseId: item.caseId,
                  caseName: item.caseName,
                  method: item.method,
                  created_at: item.created_at,
                },
              ];
            }
            foundApi = {
              ...foundApi,
              selectedCases: updatedCases,
            };
            // Replace in newItems
            newItems = newItems.map(existing =>
              existing.type === 'api' && existing.id === item.parentFileId
                ? foundApi
                : existing
            );
            // Remove API if no selectedCases left
            return newItems.filter(
              existing =>
                !(
                  existing.type === 'api' &&
                  existing.id === item.parentFileId &&
                  foundApi.selectedCases.length === 0
                )
            );
          } else {
            // Add parent API with this case as selectedCases
            return [
              ...newItems,
              {
                id: item.parentFileId,
                type: 'api',
                name: item.parentFileName,
                method: item.method || 'GET',
                selected: true,
                selectedCases: [
                  {
                    caseId: item.caseId,
                    caseName: item.caseName,
                    method: item.method,
                    created_at: item.created_at,
                  },
                ],
                testCasesCount:
                  item.parentFileTestCasesCount ||
                  (item.parentFileChildren
                    ? item.parentFileChildren.length
                    : 0),
              },
            ];
          }
        }
        // Default: add the item
        return [
          ...newItems,
          {
            ...item,
            selected: true,
          },
        ];
      });
    },
    [onSelectRequest]
  );

  // Remove item from selection
  const handleRemoveSelection = useCallback(
    (itemId, itemType, caseId = null) => {
      setSelectedItems(prev => {
        if (itemType === 'api') {
          // Remove the whole API selection (all cases)
          return prev.filter(
            item => !(item.type === 'api' && Number(item.id) === Number(itemId))
          );
        }
        if (itemType === 'case') {
          // Remove a single test case from an API's selectedCases
          return prev
            .map(item => {
              if (item.type === 'api' && Number(item.id) === Number(itemId)) {
                if (item.selectedCases && item.selectedCases.length > 0) {
                  // Partial selection: remove the case from selectedCases
                  const updatedCases = item.selectedCases.filter(
                    c => Number(c.caseId) !== Number(caseId)
                  );
                  if (updatedCases.length > 0) {
                    return { ...item, selectedCases: updatedCases };
                  } else {
                    // No cases left, remove the API
                    return null;
                  }
                } else if (item.children && item.children.length > 0) {
                  // Whole API selected: convert to partial selection (all except the removed case)
                  const remainingCases = item.children
                    .filter(c => Number(c.id) !== Number(caseId))
                    .map(c => ({
                      caseId: c.id,
                      caseName: c.name,
                      method: c.method,
                      created_at: c.created_at,
                    }));
                  if (remainingCases.length > 0) {
                    return { ...item, selectedCases: remainingCases };
                  } else {
                    // No cases left, remove the API
                    return null;
                  }
                }
              }
              return item;
            })
            .filter(Boolean);
        }
        if (itemType === 'folder') {
          // Remove all APIs under this folder
          return prev.filter(
            item =>
              !(item.folderId === itemId || item.parentFolderId === itemId)
          );
        }
        // Default: just remove the item
        return prev.filter(
          item =>
            !(
              Number(item.id) === Number(itemId) &&
              item.type === itemType &&
              (typeof caseId === 'undefined' ||
                Number(item.caseId) === Number(caseId))
            )
        );
      });
    },
    []
  ); // Clear all selections
  const handleClearSelections = useCallback(() => {
    setSelectedItems([]);
  }, []);

  // Run bulk tests
  const handleRunTests = useCallback(async () => {
    if (selectedItems.length === 0 && testScope === 'selected') {
      alert('Please select APIs or test cases to run');
      return;
    }

    setIsRunning(true);
    setResults(null);

    try {
      // TODO: Replace with actual API call to backend
      const mockResults = {
        summary: {
          total: selectedItems.length * 2,
          passed: Math.floor(selectedItems.length * 1.7),
          failed: Math.ceil(selectedItems.length * 0.3),
          pass_rate: 85,
          duration: '2.3s',
        },
        details: selectedItems.map((item, index) => ({
          id: `${item.id}_${index}`,
          name: item.name,
          status: Math.random() > 0.3 ? 'passed' : 'failed',
          duration: `${Math.floor(Math.random() * 500)}ms`,
          response: {
            status: Math.random() > 0.3 ? 200 : 500,
            data: { message: 'Mock response' },
          },
        })),
      };

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      setResults(mockResults);
    } catch (error) {
      console.error('Bulk test failed:', error);
      alert('Failed to run bulk tests');
    } finally {
      setIsRunning(false);
    }
  }, [selectedItems, testScope]);

  // Schedule tests
  const handleScheduleTests = useCallback(
    scheduleConfig => {
      const newJob = {
        id: Date.now().toString(),
        name:
          scheduleConfig.name || `Bulk Test - ${new Date().toLocaleString()}`,
        selectedItems: [...selectedItems],
        schedule: scheduleConfig,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      };

      setScheduledJobs(prev => [...prev, newJob]);
      setShowScheduler(false);

      // TODO: Send to backend for actual scheduling
      console.log('Scheduled job:', newJob);
    },
    [selectedItems]
  );

  return (
    <div className={styles.bulkTestContainer} ref={containerRef}>
      {isRunning && <LookingLoader overlay text="Running bulk tests..." />}
      {/* Left Panel: Collection Tree */}
      <div
        className={styles.leftPanel}
        style={{ width: `${leftPanelWidth}px` }}
      >
        <div className={styles.treeHeader}>
          <h3>Select APIs & Test Cases</h3>
          <p className={styles.treeSubtitle}>
            Click on APIs or test cases to add them to your bulk test
          </p>
        </div>
        <div className={styles.treeContainer}>
          <BulkCollectionTree
            onSelectRequest={handleTreeSelection}
            selectedItems={selectedItems}
            testScope={testScope}
          />
        </div>
      </div>

      {/* Resizer Handle */}
      <div
        className={styles.resizer}
        ref={resizerRef}
        onMouseDown={handleResizerMouseDown}
      />

      {/* Right Panel: Bulk Test Controls & Results */}
      <div className={styles.rightPanel}>
        {/* Controls Section */}
        <BulkControls
          testScope={testScope}
          onScopeChange={setTestScope}
          isRunning={isRunning}
          onRunTests={handleRunTests}
          onShowScheduler={() => setShowScheduler(true)}
          selectedCount={selectedItems.length}
        />

        {/* Tabs */}
        <div className={styles.tabs}>
          <div
            className={`${styles.tab} ${activeTab === 'selection' ? styles.active : ''}`}
            onClick={() => setActiveTab('selection')}
          >
            Selected Items ({selectedItems.length})
          </div>
          <div
            className={`${styles.tab} ${activeTab === 'results' ? styles.active : ''}`}
            onClick={() => setActiveTab('results')}
          >
            Test Results
          </div>
          {scheduledJobs.length > 0 && (
            <div
              className={`${styles.tab} ${activeTab === 'scheduled' ? styles.active : ''}`}
              onClick={() => setActiveTab('scheduled')}
            >
              Scheduled Jobs ({scheduledJobs.length})
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className={styles.tabContent}>
          {activeTab === 'selection' && (
            <BulkSelection
              selectedItems={selectedItems}
              testScope={testScope}
              onRemoveSelection={handleRemoveSelection}
              onClearSelections={handleClearSelections}
            />
          )}

          {activeTab === 'results' && (
            <BulkResults results={results} isRunning={isRunning} />
          )}

          {activeTab === 'scheduled' && scheduledJobs.length > 0 && (
            <div className={styles.scheduledJobsSection}>
              <div className={styles.jobsList}>
                {scheduledJobs.map(job => (
                  <div key={job.id} className={styles.jobItem}>
                    <div className={styles.jobInfo}>
                      <strong>{job.name}</strong>
                      <span className={styles.jobStatus}>{job.status}</span>
                    </div>
                    <div className={styles.jobDetails}>
                      {job.selectedItems.length} items • {job.schedule.type}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scheduler Modal */}
      {showScheduler && (
        <BulkScheduler
          onSchedule={handleScheduleTests}
          onClose={() => setShowScheduler(false)}
          selectedItems={selectedItems}
        />
      )}
    </div>
  );
}
