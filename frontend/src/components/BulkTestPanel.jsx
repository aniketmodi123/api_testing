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

  // Clear selection when testScope changes
  useEffect(() => {
    setSelectedItems([]);
  }, [testScope]);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduledJobs, setScheduledJobs] = useState([]);

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

  const handleResizerMouseDown = e => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Only allow selection of APIs and folders (no test cases)
  const handleTreeSelection = useCallback(({ action, item, files }) => {
    if (!action) {
      item = item || files?.[0];
      action = 'select';
      files = files ? files : [item];
    }

    // Only process APIs and folders
    const filtered = (files && Array.isArray(files) ? files : [item]).filter(
      f => f.type === 'api' || f.type === 'folder'
    );
    if (filtered.length === 0) return;

    setSelectedItems(prev => {
      let newItems = [...prev];
      const getKey = i => `${i.type}:${i.id}`;
      const prevKeys = new Set(prev.map(getKey));

      if (action === 'select') {
        filtered.forEach(f => {
          const key = getKey(f);
          if (!prevKeys.has(key)) {
            newItems.push({
              ...f,
              selected: true,
              displayName: f.name,
            });
          }
        });
      } else if (action === 'deselect') {
        const removeKeys = new Set(filtered.map(getKey));
        newItems = newItems.filter(i => !removeKeys.has(getKey(i)));
      }
      return newItems;
    });
  }, []);

  // Remove item from selection (only APIs and folders)
  const handleRemoveSelection = useCallback((itemId, itemType) => {
    setSelectedItems(prev =>
      prev.filter(item => !(item.id === itemId && item.type === itemType))
    );
  }, []);
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

  // Only keep selected APIs and folders
  const filteredSelectedItems = selectedItems.filter(
    item => item.type === 'api' || item.type === 'folder'
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
          <h3>Select APIs & Folders</h3>
          <p className={styles.treeSubtitle}>
            Click on APIs or folders to add them to your bulk test
          </p>
        </div>
        <div className={styles.treeContainer}>
          <BulkCollectionTree
            onSelectRequest={handleTreeSelection}
            selectedItems={filteredSelectedItems}
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
          selectedCount={filteredSelectedItems.length}
        />

        {/* Tabs */}
        <div className={styles.tabs}>
          <div
            className={`${styles.tab} ${activeTab === 'selection' ? styles.active : ''}`}
            onClick={() => setActiveTab('selection')}
          >
            Selected Items ({filteredSelectedItems.length})
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
              selectedItems={filteredSelectedItems}
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
          selectedItems={filteredSelectedItems}
        />
      )}
    </div>
  );
}
