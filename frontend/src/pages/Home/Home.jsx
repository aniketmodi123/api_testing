import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BulkTestPanel from '../../components/BulkTestPanel/BulkTestPanel.jsx';
import CollectionTree from '../../components/CollectionTree/CollectionTree';
import { EnvironmentManager } from '../../components/EnvironmentManager';
import EnvironmentDetail from '../../components/EnvironmentManager/EnvironmentDetail';
import EnvironmentForm from '../../components/EnvironmentManager/EnvironmentForm';
import VariableModal from '../../components/EnvironmentManager/VariableModal';
import RequestPanel from '../../components/RequestPanel/RequestPanel';
import Sidebar from '../../components/Sidebar/Sidebar';
import { useEnvironment } from '../../store/environment';
import { useNode } from '../../store/node';
import { useWorkspace } from '../../store/workspace';
import styles from './Home.module.css';

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();

  // State for collection, and request
  const [activeTab, setActiveTab] = useState('collections');
  const [activeRequest, setActiveRequest] = useState(null);

  // Variable modal states
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [editingVariable, setEditingVariable] = useState(null);

  // Environment form states
  const [showEnvironmentForm, setShowEnvironmentForm] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState(null);

  // Resize functionality
  const [sidePanelWidth, setSidePanelWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);

  // Initial loading state
  const {
    activeWorkspace,
    workspaceTree,
    setShouldLoadWorkspaces,
    loading: workspaceLoading,
    error: workspaceError,
    refreshWorkspaces,
  } = useWorkspace(); // Use node context for managing nodes/folders
  const { selectedNode, setSelectedNode, loading: nodeLoading } = useNode();

  // Use environment context for environment management
  const {
    variables,
    activeEnvironment,
    selectedEnvironment,
    setSelectedEnvironment,
    createEnvironment,
    updateEnvironment,
    createEnvironmentFromTemplate,
    createEnvironmentWithDefaults,
  } = useEnvironment();

  // Derive tab from URL on mount and when URL changes
  useEffect(() => {
    const path = location.pathname || '/';
    // Support both root and explicit section routes
    if (path === '/' || path === '') {
      setActiveTab('collections');
      // Normalize URL so refresh/paste shows explicit section
      navigate('/collections', { replace: true });
      return;
    }
    if (path.startsWith('/collections')) {
      setActiveTab('collections');
    } else if (path.startsWith('/environments')) {
      setActiveTab('environments');
    } else if (path.startsWith('/bulk-test')) {
      setActiveTab('bulkTest');
    } else {
      // default fallback
      setActiveTab('collections');
    }
  }, [location.pathname]);

  // Enable workspace loading immediately when Home component mounts
  useEffect(() => {
    console.log('[Home] Enabling workspace loading on mount');
    setShouldLoadWorkspaces(true);
    
    // Don't disable on unmount to avoid issues when navigating between authenticated pages
    return () => {
      // Keep workspaces enabled for other authenticated pages
      // setShouldLoadWorkspaces(false);
    };
  }, [setShouldLoadWorkspaces]);

  const handleTabChange = tab => {
    setActiveTab(tab);
    // Push to corresponding route so refresh preserves section
    if (tab === 'collections') navigate('/collections');
    else if (tab === 'environments') navigate('/environments');
    else if (tab === 'bulkTest') navigate('/bulk-test');
  };

  const handleSelectRequest = request => {
    setActiveRequest(request);
    // Also update selected node in the node context
    setSelectedNode(request);
  };

  const handleEnvironmentSelect = environment => {
    setSelectedEnvironment(environment);
    // Hide form when selecting an environment
    setShowEnvironmentForm(false);
    setEditingEnvironment(null);
  };

  const handleCreateEnvironment = () => {
    setShowEnvironmentForm(true);
    setEditingEnvironment(null);
    setSelectedEnvironment(null);
  };

  const handleEditEnvironment = environment => {
    setShowEnvironmentForm(true);
    setEditingEnvironment(environment);
    setSelectedEnvironment(null);
  };

  const handleCancelEnvironmentForm = () => {
    setShowEnvironmentForm(false);
    setEditingEnvironment(null);
  };

  const handleSaveEnvironment = async (environmentData, setModalError) => {
    try {
      let result;
      if (editingEnvironment) {
        // Update existing environment
        result = await updateEnvironment(
          editingEnvironment.id,
          environmentData
        );
      } else {
        // Create new environment
        if (environmentData.includeDefaults) {
          // Dev log removed

          // Create environment with user's custom name and description but template variables
          result = await createEnvironmentWithDefaults(
            environmentData.name,
            environmentData.description,
            environmentData.is_active
          );
        } else {
          result = await createEnvironment(environmentData);
        }
      }

      if (result) {
        // Success - hide form and optionally select the environment
        setShowEnvironmentForm(false);
        setEditingEnvironment(null);
        if (!editingEnvironment) {
          // For new environments, select them
          setSelectedEnvironment(result);
        }
        return result;
      } else {
        // Error handled by the environment context
        return false;
      }
    } catch (error) {
      console.error('Failed to save environment:', error);
      if (setModalError) {
        setModalError('Failed to save environment. Please try again.');
      }
      return false;
    }
  };

  const handleCreateVariable = () => {
    setEditingVariable(null);
    setShowVariableModal(true);
  };

  const handleEditVariable = variable => {
    setEditingVariable(variable);
    setShowVariableModal(true);
  };

  const handleCloseVariableModal = () => {
    setShowVariableModal(false);
    setEditingVariable(null);
  };

  // Resize handlers
  const handleMouseDown = e => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = e => {
    if (!isResizing) return;

    const newWidth = e.clientX;
    if (newWidth >= 200 && newWidth <= 500) {
      setSidePanelWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  // Add mouse event listeners for resize
  useEffect(() => {
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

  return (
    <div className={styles.homeContainer}>
      {/* Show loading state while workspaces are being loaded */}
      {workspaceLoading && !activeWorkspace && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <div className={styles.loadingSpinner}></div>
            <p>Loading workspaces...</p>
            {workspaceError && (
              <div className={styles.errorMessage}>
                <p>Error: {workspaceError}</p>
                <button 
                  className={styles.retryButton}
                  onClick={() => refreshWorkspaces()}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className={styles.mainContent}>
        {/* Left Sidebar */}
        <Sidebar onTabChange={handleTabChange} />

        {/* Collection or Environment Panel based on active tab */}
        {activeTab !== 'bulkTest' && (
          <div
            className={styles.sidePanel}
            style={{ width: `${sidePanelWidth}px` }}
          >
            {activeTab === 'collections' ? (
              <CollectionTree onSelectRequest={handleSelectRequest} />
            ) : (
              <EnvironmentManager
                onEnvironmentSelect={handleEnvironmentSelect}
                onCreateEnvironment={handleCreateEnvironment}
                onEditEnvironment={handleEditEnvironment}
              />
            )}
          </div>
        )}

        {/* Resize Handle */}
        {activeTab !== 'bulkTest' && (
          <div
            className={styles.resizeHandle}
            onMouseDown={handleMouseDown}
          ></div>
        )}

        {/* Main Content Area */}
        <div className={styles.contentPanel}>
          {activeTab === 'collections' ? (
            <RequestPanel activeRequest={activeRequest} />
          ) : activeTab === 'environments' ? (
            /* Show variable management or environment form when in environments tab */
            <div className={styles.variableManagementPanel}>
              {showEnvironmentForm ? (
                <EnvironmentForm
                  onCancel={handleCancelEnvironmentForm}
                  onSave={handleSaveEnvironment}
                  initialData={editingEnvironment}
                  isEdit={!!editingEnvironment}
                />
              ) : selectedEnvironment ? (
                <EnvironmentDetail
                  environment={selectedEnvironment}
                  variables={variables}
                  isActive={activeEnvironment?.id === selectedEnvironment.id}
                  onCreateVariable={handleCreateVariable}
                  onEditVariable={handleEditVariable}
                  onEditEnvironment={handleEditEnvironment}
                />
              ) : (
                <div className={styles.noEnvironmentSelected}>
                  <div className={styles.noSelectionIcon}>🌍</div>
                  <h3>Select an environment</h3>
                  <p>
                    Choose an environment from the left panel to view and manage
                    its variables, or create a new environment.
                  </p>
                  <div className={styles.emptyActions}>
                    <button
                      className={styles.createButton}
                      onClick={handleCreateEnvironment}
                    >
                      Create Environment
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Bulk Test tab: render new BulkTestPanel
            <BulkTestPanel onSelectRequest={handleSelectRequest} />
          )}
        </div>
      </div>

      {/* Variable Modal */}
      {showVariableModal && selectedEnvironment && (
        <VariableModal
          environment={selectedEnvironment}
          editingVariable={editingVariable}
          onClose={handleCloseVariableModal}
        />
      )}
    </div>
  );
}
