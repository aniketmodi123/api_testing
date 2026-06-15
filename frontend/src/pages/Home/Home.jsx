import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import BulkTestPanel from '../../components/BulkTestPanel/BulkTestPanel.jsx';
import CollectionTree from '../../components/CollectionTree/CollectionTree';
import { EnvironmentManager } from '../../components/EnvironmentManager';
import EnvironmentDetail from '../../components/EnvironmentManager/EnvironmentDetail';
import EnvironmentForm from '../../components/EnvironmentManager/EnvironmentForm';
import VariableModal from '../../components/EnvironmentManager/VariableModal';
import HistoryPanel from '../../components/HistoryPanel/HistoryPanel';
import IconSidebar from '../../components/IconSidebar';
import RequestPanel from '../../components/RequestPanel/RequestPanel';
import TabBar, { useTabBar } from '../../components/TabBar';
import { useEnvironment } from '../../store/environment';
import { useNode } from '../../store/node';
import { useWorkspace } from '../../store/workspace';
import styles from './Home.module.css';

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('collections');

  // Variable modal states
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [editingVariable, setEditingVariable] = useState(null);

  // Environment form states
  const [showEnvironmentForm, setShowEnvironmentForm] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState(null);

  const {
    activeWorkspace,
    workspaceTree,
    setShouldLoadWorkspaces,
    loading: workspaceLoading,
    error: workspaceError,
    refreshWorkspaces,
  } = useWorkspace();

  const { selectedNode, setSelectedNode } = useNode();

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

  const { tabs, activeTabId, openTab, closeTab, setActiveTabId, updateTabMethod } = useTabBar(workspaceTree);

  // Derive tab from URL on mount and when URL changes
  useEffect(() => {
    const path = location.pathname || '/';
    if (path === '/' || path === '') {
      setActiveTab('collections');
      navigate('/collections', { replace: true });
      return;
    }
    if (path.startsWith('/collections')) setActiveTab('collections');
    else if (path.startsWith('/environments')) setActiveTab('environments');
    else if (path.startsWith('/bulk-test')) setActiveTab('bulkTest');
    else if (path.startsWith('/history')) setActiveTab('history');
    else setActiveTab('collections');
  }, [location.pathname]);

  useEffect(() => {
    setShouldLoadWorkspaces(true);
  }, [setShouldLoadWorkspaces]);

  const handleTabChange = tab => {
    setActiveTab(tab);
    if (tab === 'collections') navigate('/collections');
    else if (tab === 'environments') navigate('/environments');
    else if (tab === 'bulkTest') navigate('/bulk-test');
    else if (tab === 'history') navigate('/history');
  };

  const handleSelectRequest = node => {
    setSelectedNode(node);
    openTab(node);
  };

  const handleTabSelect = fileId => {
    setActiveTabId(fileId);
    // Find node in workspace tree and restore it as selected node
    const node = findNodeById(workspaceTree, fileId);
    if (node) setSelectedNode(node);
  };

  const handleEnvironmentSelect = environment => {
    setSelectedEnvironment(environment);
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
        result = await updateEnvironment(editingEnvironment.id, environmentData);
      } else {
        if (environmentData.includeDefaults) {
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
        setShowEnvironmentForm(false);
        setEditingEnvironment(null);
        if (!editingEnvironment) setSelectedEnvironment(result);
        return result;
      }
      return false;
    } catch (error) {
      console.error('Failed to save environment:', error);
      if (setModalError) setModalError('Failed to save environment. Please try again.');
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

  const showSidePanel = activeTab !== 'bulkTest';

  return (
    <div className={styles.homeContainer}>
      {workspaceLoading && !activeWorkspace && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContent}>
            <div className={styles.loadingSpinner}></div>
            <p>Loading workspaces...</p>
            {workspaceError && (
              <div className={styles.errorMessage}>
                <p>Error: {workspaceError}</p>
                <button className={styles.retryButton} onClick={() => refreshWorkspaces()}>
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.mainContent}>
        <IconSidebar onTabChange={handleTabChange} />

        {showSidePanel ? (
          <PanelGroup orientation="horizontal" className={styles.panelGroup}>
            <Panel defaultSize="20%" minSize="12%" maxSize="40%" className={styles.treePanel}>
              {activeTab === 'collections' && (
                <CollectionTree onSelectRequest={handleSelectRequest} />
              )}
              {activeTab === 'environments' && (
                <EnvironmentManager
                  onEnvironmentSelect={handleEnvironmentSelect}
                  onCreateEnvironment={handleCreateEnvironment}
                  onEditEnvironment={handleEditEnvironment}
                />
              )}
              {activeTab === 'history' && (
                <HistoryPanel onSelectRequest={handleSelectRequest} />
              )}
            </Panel>
            <PanelResizeHandle className={styles.resizeHandle} />
            <Panel className={styles.contentPanel}>
              {activeTab === 'collections' || activeTab === 'history' ? (
                <div className={styles.requestArea}>
                  {tabs.length > 0 && (
                    <TabBar
                      tabs={tabs}
                      activeTabId={activeTabId}
                      onSelect={handleTabSelect}
                      onClose={closeTab}
                    />
                  )}
                  <RequestPanel
                    activeRequest={selectedNode}
                    onMethodChange={(fileId, method) => updateTabMethod(fileId, method)}
                  />
                </div>
              ) : activeTab === 'environments' ? (
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
                        Choose an environment from the left panel to view and manage its
                        variables, or create a new environment.
                      </p>
                      <div className={styles.emptyActions}>
                        <button className={styles.createButton} onClick={handleCreateEnvironment}>
                          Create Environment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </Panel>
          </PanelGroup>
        ) : (
          <div className={styles.contentPanel}>
            <BulkTestPanel onSelectRequest={handleSelectRequest} />
          </div>
        )}
      </div>

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

function findNodeById(tree, id) {
  if (!tree) return null;
  for (const workspace of tree) {
    const found = searchChildren(workspace.children, id);
    if (found) return found;
  }
  return null;
}

function searchChildren(children, id) {
  if (!children) return null;
  for (const node of children) {
    if (node.id === id) return node;
    if (node.children) {
      const found = searchChildren(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
