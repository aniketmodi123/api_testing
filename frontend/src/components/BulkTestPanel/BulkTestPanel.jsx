import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../../services/apiService.js';
import { useAuth } from '../../store/session.jsx';
import { useWorkspace } from '../../store/workspace.jsx';
import LookingLoader from '../LookingLoader/LookingLoader.jsx';
import BulkCollectionTree from './BulkCollectionTree.jsx';
import BulkControls from './BulkControls.jsx';
import BulkResults from './BulkResults.jsx';
import BulkScheduler from './BulkScheduler.jsx';
import BulkSelection from './BulkSelection.jsx';
import styles from './BulkTestPanel.module.css';

export default function BulkTestPanel({ onSelectRequest }) {
  const [selectedItems, setSelectedItems] = useState([]);
  const [testScope, setTestScope] = useState('selected'); // 'selected', 'folder', 'all'
  // Removed selectedType, use testScope for API type
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [selectedApiCases, setSelectedApiCases] = useState([]);
  const [pollingInterval, setPollingInterval] = useState(null);

  // New state for the three-table structure
  const [testHistory, setTestHistory] = useState([]); // BulkTestSchedule data
  const [runningTests, setRunningTests] = useState([]); // BulkTestExecution data (running/queued)
  const [latestResults, setLatestResults] = useState(null); // BulkTestResult data
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingRunning, setLoadingRunning] = useState(false);
  const [loadingExecution, setLoadingExecution] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [loadingScheduleCreate, setLoadingScheduleCreate] = useState(false);

  // Hooks for auth and workspace (moved up to be available early)
  const auth = useAuth();
  const { activeWorkspace } = useWorkspace();

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

  // Load test history (BulkTestSchedule)
  const loadTestHistory = useCallback(async () => {
    if (!auth?.username || !activeWorkspace?.id) return;

    setLoadingHistory(true);
    try {
      const response = await apiService.getBulkTestSchedules(
        auth.username,
        activeWorkspace.id
      );
      // Always set the data, even if it's empty array
      setTestHistory(response?.data || []);
    } catch (error) {
      console.error('Failed to load test history:', error);
      setTestHistory([]); // Clear on error
    } finally {
      setLoadingHistory(false);
    }
  }, [auth?.username, activeWorkspace?.id]);

  // Load running tests (BulkTestExecution with status running/queued)
  const loadRunningTests = useCallback(async () => {
    if (!auth?.username || !activeWorkspace?.id) return;

    setLoadingRunning(true);
    try {
      const response = await apiService.getRunningBulkTestExecutions(
        auth.username,
        activeWorkspace.id
      );
      // Always set the data, even if it's empty array
      setRunningTests(response?.data || []);
    } catch (error) {
      console.error('Failed to load running tests:', error);
      setRunningTests([]); // Clear on error
    } finally {
      setLoadingRunning(false);
    }
  }, [auth?.username, activeWorkspace?.id]);

  // Switch to results tab when results are available
  useEffect(() => {
    if (results && !isRunning) {
      setActiveTab('results');
    }
  }, [results, isRunning]);

  // Poll for execution results of running jobs
  useEffect(() => {
    const runningJobs = scheduledJobs.filter(job => job.status === 'running');

    if (runningJobs.length > 0) {
      const interval = setInterval(async () => {
        for (const job of runningJobs) {
          try {
            if (job.schedule?.id && auth?.username) {
              const executions = await apiService.getBulkTestExecutions(
                job.schedule.id,
                auth.username
              );

              console.log('Polling execution results:', executions);

              // Check if execution is complete
              if (
                executions?.data &&
                Array.isArray(executions.data) &&
                executions.data.length > 0
              ) {
                const latestExecution = executions.data[0];
                if (
                  latestExecution.status !== 'running' &&
                  latestExecution.status !== 'queued'
                ) {
                  // Update job status
                  setScheduledJobs(prev =>
                    prev.map(j =>
                      j.id === job.id
                        ? {
                            ...j,
                            status: latestExecution.status,
                            execution: latestExecution,
                          }
                        : j
                    )
                  );

                  // If it's a recent execution, show results
                  if (
                    latestExecution.results &&
                    latestExecution.results.length > 0
                  ) {
                    // Transform execution results to the format expected by BulkResults
                    const transformedResults = {
                      summary: {
                        total:
                          latestExecution.total_cases ||
                          latestExecution.results.length,
                        passed:
                          latestExecution.passed ||
                          latestExecution.results.filter(r => r.success).length,
                        failed:
                          latestExecution.failed ||
                          latestExecution.results.filter(r => !r.success)
                            .length,
                        pass_rate: latestExecution.total_cases
                          ? Math.round(
                              (latestExecution.passed /
                                latestExecution.total_cases) *
                                100
                            )
                          : 0,
                        duration: latestExecution.duration_ms
                          ? `${latestExecution.duration_ms}ms`
                          : null,
                      },
                      details: latestExecution.results.map(result => ({
                        id: result.id,
                        name: result.case_name,
                        status: result.success ? 'passed' : 'failed',
                        response: {
                          status: result.status_code,
                        },
                        duration: result.duration_ms
                          ? `${result.duration_ms}ms`
                          : 'N/A',
                        failures: result.failures,
                        request: result.request,
                        response_data: result.response,
                      })),
                    };

                    setResults(transformedResults);
                    setActiveTab('results');
                  }
                }
              }
            }
          } catch (error) {
            console.error('Failed to poll execution status:', error);
          }
        }
      }, 5000); // Poll every 5 seconds

      setPollingInterval(interval);

      return () => {
        clearInterval(interval);
        setPollingInterval(null);
      };
    } else if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [scheduledJobs, auth?.username, loadRunningTests, loadTestHistory]);

  // Load initial data when component mounts or workspace changes
  useEffect(() => {
    // Clear local state when workspace changes
    setScheduledJobs([]);
    setLatestResults(null);

    // Load fresh data
    loadTestHistory();
    loadRunningTests();
  }, [loadTestHistory, loadRunningTests, activeWorkspace?.id]);

  // Handle viewing executions for a specific schedule
  const handleViewScheduleExecutions = useCallback(
    async scheduleId => {
      setLoadingExecution(true);
      try {
        const executions = await apiService.getBulkTestExecutions(
          scheduleId,
          auth.username
        );

        if (executions?.data && executions.data.length > 0) {
          const latestExecution = executions.data[0];

          // Transform and set the latest results
          if (latestExecution.results && latestExecution.results.length > 0) {
            const transformedResults = {
              summary: {
                total:
                  latestExecution.total_cases || latestExecution.results.length,
                passed:
                  latestExecution.passed ||
                  latestExecution.results.filter(r => r.success).length,
                failed:
                  latestExecution.failed ||
                  latestExecution.results.filter(r => !r.success).length,
                pass_rate: latestExecution.total_cases
                  ? Math.round(
                      (latestExecution.passed / latestExecution.total_cases) *
                        100
                    )
                  : 0,
                duration: latestExecution.duration_ms
                  ? `${latestExecution.duration_ms}ms`
                  : null,
              },
              details: latestExecution.results.map(result => ({
                id: result.id,
                name: result.case_name,
                status: result.success ? 'passed' : 'failed',
                response: {
                  status: result.status_code,
                },
                duration: result.duration_ms
                  ? `${result.duration_ms}ms`
                  : 'N/A',
                failures: result.failures,
                request: result.request,
                response_data: result.response,
              })),
            };

            setLatestResults(transformedResults);
            setActiveTab('results');
          }
        }
      } catch (error) {
        console.error('Failed to load schedule executions:', error);
        alert('Failed to load execution results');
      } finally {
        setLoadingExecution(false);
      }
    },
    [auth?.username]
  );

  // Delete a bulk test schedule and all its related data
  const handleDeleteSchedule = useCallback(
    async scheduleId => {
      if (!auth?.username) {
        console.error('No username available for delete operation');
        return;
      }

      const confirmDelete = window.confirm(
        'Are you sure you want to delete this test history?\n\nThis will permanently delete:\n- The schedule\n- All execution records\n- All test results\n\nThis action cannot be undone.'
      );

      if (!confirmDelete) {
        return;
      }

      setLoadingDelete(true);
      try {
        await apiService.deleteBulkTestSchedule(scheduleId, auth.username);

        // Remove from local state
        setTestHistory(prev =>
          prev.filter(schedule => schedule.id !== scheduleId)
        );

        // Also remove from scheduled jobs if it exists there
        setScheduledJobs(prev =>
          prev.filter(job => job.schedule?.id !== scheduleId)
        );

        // Show success message
        alert('Test history deleted successfully');

        // Refresh the data to ensure consistency
        await loadTestHistory();
        await loadRunningTests();
      } catch (error) {
        console.error('Failed to delete schedule:', error);
        alert('Failed to delete test history. Please try again.');
      } finally {
        setLoadingDelete(false);
      }
    },
    [auth?.username, loadTestHistory, loadRunningTests]
  );

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Sync selectedApiCases with selectedItems and testScope
  useEffect(() => {
    if (testScope === 'api') {
      // Only API/file IDs, no cases
      const apiIds = selectedItems
        .filter(item => item.type === 'api')
        .map(api => api.id);
      setSelectedApiCases(apiIds);
    } else {
      // Build the API-call-ready structure (default)
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
    }
  }, [selectedItems, testScope]);

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

    if (!activeWorkspace?.id) {
      alert('No workspace selected');
      return;
    }

    // Helper function to get local datetime in ISO format without timezone
    const getLocalDateTime = () => {
      const now = new Date();
      // Get local time by adjusting for timezone offset
      const localTime = new Date(
        now.getTime() - now.getTimezoneOffset() * 60000
      );
      return localTime.toISOString().slice(0, -1); // Remove 'Z' to indicate local time
    };

    setIsRunning(true);
    setResults(null);

    try {
      const username = auth?.username || '';

      // Prepare the payload for scheduling
      const payload = {
        type: testScope,
        apis:
          testScope === 'api'
            ? selectedApiCases // Array of file IDs for 'api' type
            : selectedApiCases, // Array of {file_id, cases} for 'selected' type
      };

      // Create a schedule with immediate execution (type: "once")
      const scheduleData = {
        name: `Bulk Test Run - ${new Date().toLocaleString()}`,
        type: 'once',
        date_time: getLocalDateTime(), // Use local time consistently
        enabled: true,
        payload: payload,
      };

      console.log('Creating bulk test schedule:', scheduleData);

      // Save the request first (create schedule)
      const scheduleResponse = await apiService.createBulkTestSchedule(
        scheduleData,
        username,
        activeWorkspace.id
      );

      console.log('Schedule created:', scheduleResponse);

      // Add to local scheduled jobs for UI tracking
      const newJob = {
        id: scheduleResponse.data?.id || Date.now().toString(),
        name: scheduleData.name,
        selectedItems: [...selectedItems],
        schedule: scheduleResponse.data,
        status: 'running',
        createdAt: new Date().toISOString(),
      };

      setScheduledJobs(prev => [...prev, newJob]);

      // Refresh data to show the new schedule
      await loadTestHistory();
      await loadRunningTests();

      // Switch to progress tab to show the new execution
      setActiveTab('progress');

      // The background scheduler will pick up and execute the test
      // We can optionally poll for results or show a message
      alert(
        'Bulk test has been scheduled and will run in the background. Check the "Running Tests" tab for progress.'
      );
    } catch (error) {
      console.error('Failed to schedule bulk test:', error);
      alert(
        `Failed to schedule bulk test: ${error.message || 'Unknown error'}`
      );
    } finally {
      setIsRunning(false);
    }
  }, [selectedApiCases, testScope, auth, activeWorkspace, selectedItems]);

  // Schedule tests (for future/recurring schedules)
  const handleScheduleTests = useCallback(
    async scheduleConfig => {
      if (!activeWorkspace?.id) {
        alert('No workspace selected');
        return;
      }

      setLoadingScheduleCreate(true);
      try {
        const username = auth?.username || '';

        // Prepare the payload for scheduling
        const payload = {
          type: testScope,
          apis:
            testScope === 'api'
              ? selectedApiCases // Array of file IDs for 'api' type
              : selectedApiCases, // Array of {file_id, cases} for 'selected' type
        };

        // Process the schedule config to ensure proper datetime format
        const processedConfig = { ...scheduleConfig };

        // If it's a "once" type schedule, ensure datetime is in the right format
        if (scheduleConfig.type === 'once' && scheduleConfig.datetime) {
          // datetime-local provides format like "2025-10-04T20:43"
          // We need to convert it to ISO format but without 'Z' to indicate local time
          processedConfig.date_time = scheduleConfig.datetime + ':00'; // Add seconds
          delete processedConfig.datetime; // Remove the original field
        }

        // Create the schedule
        const scheduleData = {
          ...processedConfig,
          payload: payload,
        };

        console.log('Creating scheduled bulk test:', scheduleData);

        const scheduleResponse = await apiService.createBulkTestSchedule(
          scheduleData,
          username,
          activeWorkspace.id
        );

        const newJob = {
          id: scheduleResponse.data?.id || Date.now().toString(),
          name:
            scheduleConfig.name || `Bulk Test - ${new Date().toLocaleString()}`,
          selectedItems: [...selectedItems],
          schedule: scheduleResponse.data,
          status: 'scheduled',
          createdAt: new Date().toISOString(),
        };

        setScheduledJobs(prev => [...prev, newJob]);
        setShowScheduler(false);

        // Refresh data to show the new schedule
        await loadTestHistory();

        alert('Bulk test has been scheduled successfully!');
      } catch (error) {
        console.error('Failed to create schedule:', error);
        alert(`Failed to create schedule: ${error.message || 'Unknown error'}`);
      } finally {
        setLoadingScheduleCreate(false);
      }
    },
    [selectedApiCases, testScope, auth, activeWorkspace, selectedItems]
  );

  return (
    <div className={styles.bulkTestContainer} ref={containerRef}>
      {isRunning && <LookingLoader overlay text="Running bulk test..." />}
      {loadingExecution && (
        <LookingLoader overlay text="Loading test results..." />
      )}
      {loadingDelete && (
        <LookingLoader overlay text="Deleting test history..." />
      )}
      {loadingScheduleCreate && (
        <LookingLoader overlay text="Creating schedule..." />
      )}
      {loadingHistory && (
        <LookingLoader overlay text="Loading test history..." />
      )}
      {loadingRunning && (
        <LookingLoader overlay text="Loading running tests..." />
      )}
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
          selectedCount={
            selectedItems.filter(item => item.type === 'api').length
          }
        />

        {/* Tabs */}
        <div className={styles.tabs}>
          <div
            className={`${styles.tab} ${activeTab === 'selection' ? styles.active : ''}`}
            onClick={() => setActiveTab('selection')}
          >
            📋 Setup ({selectedItems.length})
          </div>
          <div
            className={`${styles.tab} ${activeTab === 'history' ? styles.active : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📚 Test History
          </div>
          <div
            className={`${styles.tab} ${activeTab === 'progress' ? styles.active : ''}`}
            onClick={() => setActiveTab('progress')}
          >
            ⚡ Running Tests
          </div>
          <div
            className={`${styles.tab} ${activeTab === 'results' ? styles.active : ''}`}
            onClick={() => setActiveTab('results')}
          >
            📊 Latest Results
          </div>
        </div>

        {/* Tab Content */}
        <div className={styles.tabContent}>
          {/* Setup Tab - Selected Items (Original functionality) */}
          {activeTab === 'selection' && (
            <BulkSelection
              selectedItems={
                testScope === 'api'
                  ? selectedItems.filter(item => item.type === 'api')
                  : selectedItems.filter(item => item.type === 'api')
              }
              onRemoveSelection={handleRemoveSelection}
              onClearSelections={handleClearSelections}
            />
          )}

          {/* Test History Tab - BulkTestSchedule data */}
          {activeTab === 'history' && (
            <div className={styles.historySection}>
              <div className={styles.sectionHeader}>
                <h3>📚 Bulk Test History</h3>
                <button
                  className={styles.refreshButton}
                  onClick={loadTestHistory}
                  disabled={loadingHistory}
                >
                  {loadingHistory ? '⏳ Loading...' : '🔄 Refresh'}
                </button>
              </div>
              <div className={styles.historyList}>
                {testHistory.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>
                      No test history yet. Run your first bulk test to see it
                      here!
                    </p>
                  </div>
                ) : (
                  testHistory.map(schedule => (
                    <div key={schedule.id} className={styles.historyItem}>
                      <div className={styles.historyInfo}>
                        <div className={styles.historyTitle}>
                          <strong>{schedule.name}</strong>
                          <span className={styles.historyType}>
                            {schedule.type}
                          </span>
                        </div>
                        <div className={styles.historyMeta}>
                          <span>
                            Created:{' '}
                            {new Date(schedule.created_at).toLocaleDateString()}
                          </span>
                          <span>
                            Executions: {schedule.executions_count || 0}
                          </span>
                          <span
                            className={`${styles.statusBadge} ${schedule.enabled ? styles.enabled : styles.disabled}`}
                          >
                            {schedule.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                      <div className={styles.historyActions}>
                        <button
                          className={styles.viewButton}
                          onClick={() =>
                            handleViewScheduleExecutions(schedule.id)
                          }
                          title="View test results"
                          disabled={loadingExecution || loadingDelete}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                        <button
                          className={styles.deleteButton}
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          title="Delete this test history and all its results"
                          disabled={loadingExecution || loadingDelete}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Running Tests Tab - BulkTestExecution data */}
          {activeTab === 'progress' && (
            <div className={styles.progressSection}>
              <div className={styles.sectionHeader}>
                <h3>⚡ Running Tests</h3>
                <button
                  className={styles.refreshButton}
                  onClick={loadRunningTests}
                  disabled={loadingRunning}
                >
                  {loadingRunning ? '⏳ Loading...' : '🔄 Refresh'}
                </button>
              </div>
              <div className={styles.progressList}>
                {runningTests.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>
                      No tests currently running. Start a bulk test to see
                      progress here!
                    </p>
                  </div>
                ) : (
                  runningTests.map(execution => (
                    <div key={execution.id} className={styles.progressItem}>
                      <div className={styles.progressInfo}>
                        <div className={styles.progressTitle}>
                          <strong>Execution #{execution.id}</strong>
                          <span
                            className={`${styles.statusBadge} ${styles[execution.status]}`}
                          >
                            {execution.status.toUpperCase()}
                          </span>
                        </div>
                        <div className={styles.progressStats}>
                          <span>Total: {execution.total_cases}</span>
                          <span>Passed: {execution.passed}</span>
                          <span>Failed: {execution.failed}</span>
                          {execution.duration_ms > 0 && (
                            <span>Duration: {execution.duration_ms}ms</span>
                          )}
                        </div>
                        <div className={styles.progressTimes}>
                          <span>
                            Started:{' '}
                            {new Date(execution.started_at).toLocaleString()}
                          </span>
                          {execution.finished_at && (
                            <span>
                              Finished:{' '}
                              {new Date(execution.finished_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {execution.status === 'failed' &&
                        execution.error_message && (
                          <div className={styles.errorMessage}>
                            <strong>Error:</strong> {execution.error_message}
                          </div>
                        )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Latest Results Tab - BulkTestResult data */}
          {activeTab === 'results' && (
            <div className={styles.resultsSection}>
              <div className={styles.sectionHeader}>
                <h3>📊 Latest Test Results</h3>
              </div>
              {latestResults ? (
                <BulkResults results={latestResults} isRunning={isRunning} />
              ) : (
                <div className={styles.emptyState}>
                  <p>
                    No recent results available. Run a bulk test to see detailed
                    results here!
                  </p>
                </div>
              )}
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
