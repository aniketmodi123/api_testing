import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BulkTestPanel from '../../components/BulkTestPanel/BulkTestPanel.jsx';
import CollectionTree from '../../components/CollectionTree/CollectionTree';
import { EnvironmentManager } from '../../components/EnvironmentManager';
import EnvironmentDetail from '../../components/EnvironmentManager/EnvironmentDetail';
import EnvironmentForm from '../../components/EnvironmentManager/EnvironmentForm';
import GlobalVariablesPanel from '../../components/EnvironmentManager/GlobalVariablesPanel';
import HistoryPanel from '../../components/HistoryPanel/HistoryPanel';
import IconSidebar from '../../components/IconSidebar';
import NodeDetailPanel from '../../components/NodeDetailPanel/NodeDetailPanel';
import RequestPanel from '../../components/RequestPanel/RequestPanel';
import TabBar, { useTabBar, isScratchTab } from '../../components/TabBar';
import { useEnvironment } from '../../store/environment';
import { useNode } from '../../store/node';
import { useWorkspace } from '../../store/workspace';
import styles from './Home.module.css';

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('collections');

  // Environment form states
  const [showEnvironmentForm, setShowEnvironmentForm] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState(null);
  const [showGlobalPanel, setShowGlobalPanel] = useState(false);
  const [nodeDetailNode, setNodeDetailNode] = useState(null);

  const {
    activeWorkspace,
    workspaceTree,
    setShouldLoadWorkspaces,
    loading: workspaceLoading,
    error: workspaceError,
    refreshWorkspaces,
  } = useWorkspace();

  const { selectedNode, setSelectedNode, nodes: nodeList } = useNode();

  const {
    variables,
    activeEnvironment,
    selectedEnvironment,
    selectEnvironment,
    createEnvironment,
    updateEnvironment,
    createEnvironmentWithDefaults,
  } = useEnvironment();

  // file_tree is only present after CollectionTree mutations; initial load uses a different shape.
  // Fall back to flat nodeList from useNode() which is always populated after workspace loads.
  const fileTree = workspaceTree?.file_tree ?? nodeList ?? null;

  const { tabs, activeTabId, openTab, openScratchTab, closeTab, setActiveTabId, updateTabMethod, reorderTab } = useTabBar(fileTree);

  // activeTabId is the single source of truth for which request RequestPanel shows.
  // Sync selectedNode whenever the active tab changes (open / switch / close / restore).
  // Skip while a folder detail panel is open so it isn't clobbered when the tree reloads.
  useEffect(() => {
    if (nodeDetailNode) return;
    if (!activeTabId || isScratchTab(activeTabId)) {
      setSelectedNode(null);
      return;
    }
    const node = findNodeById(fileTree, activeTabId);
    if (node) setSelectedNode({ ...node });
  }, [activeTabId, fileTree, nodeDetailNode]);

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
    setNodeDetailNode(null);
    if (tab === 'collections') navigate('/collections');
    else if (tab === 'environments') navigate('/environments');
    else if (tab === 'bulkTest') navigate('/bulk-test');
    else if (tab === 'history') navigate('/history');
  };

  const handleSelectRequest = node => {
    setSelectedNode(node);
    if (node.type === 'folder') {
      setNodeDetailNode(node);
    } else {
      setNodeDetailNode(null);
      openTab(node);
    }
  };

  const handleTabSelect = fileId => {
    setActiveTabId(fileId);
    setNodeDetailNode(null);
    const node = findNodeById(fileTree, fileId);
    if (node) {
      // Spread to new object so useEffect([selectedNode]) fires even when switching back to same node
      setSelectedNode({ ...node });
    } else {
      // Scratch tab — clear selectedNode so RequestPanel enters ephemeral mode
      setSelectedNode(null);
    }
  };

  const handleNewScratchTab = () => {
    openScratchTab();
    setNodeDetailNode(null);
    setSelectedNode(null);
  };

  const handleGlobalSelect = () => {
    setShowGlobalPanel(true);
    setShowEnvironmentForm(false);
    setEditingEnvironment(null);
    selectEnvironment(null);
  };

  const handleEnvironmentSelect = environment => {
    selectEnvironment(environment);
    setShowEnvironmentForm(false);
    setEditingEnvironment(null);
    setShowGlobalPanel(false);
  };

  const handleCreateEnvironment = () => {
    setShowEnvironmentForm(true);
    setEditingEnvironment(null);
    selectEnvironment(null);
    setShowGlobalPanel(false);
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
        if (!editingEnvironment) selectEnvironment(result);
        return result;
      }
      return false;
    } catch (error) {
      console.error('Failed to save environment:', error);
      if (setModalError) setModalError('Failed to save environment. Please try again.');
      return false;
    }
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
        {/* Left sidebar: nav tabs on top, tree content below — always visible */}
        <div className={styles.leftSidebar}>
          <IconSidebar onTabChange={handleTabChange} />
          {showSidePanel && (
            <div className={styles.treeContent}>
              {activeTab === 'collections' && (
                <CollectionTree
                  onSelectRequest={handleSelectRequest}
                />
              )}
              {activeTab === 'environments' && (
                <EnvironmentManager
                  onEnvironmentSelect={handleEnvironmentSelect}
                  onCreateEnvironment={handleCreateEnvironment}
                  onGlobalSelect={handleGlobalSelect}
                  selectedGlobal={showGlobalPanel}
                />
              )}
              {activeTab === 'history' && (
                <HistoryPanel onSelectRequest={handleSelectRequest} />
              )}
            </div>
          )}
        </div>

        {/* Right content area */}
        {showSidePanel ? (
          <div className={styles.contentPanel}>
            {activeTab === 'collections' || activeTab === 'history' ? (
              nodeDetailNode ? (
                <NodeDetailPanel
                  node={nodeDetailNode}
                  onClose={() => setNodeDetailNode(null)}
                />
              ) : (
                <div className={styles.requestArea}>
                  <TabBar
                    tabs={tabs}
                    activeTabId={activeTabId}
                    onSelect={handleTabSelect}
                    onClose={closeTab}
                    onNewTab={handleNewScratchTab}
                    onReorder={reorderTab}
                  />
                  <RequestPanel
                    activeRequest={selectedNode}
                    onMethodChange={(fileId, method) => updateTabMethod(fileId, method)}
                  />
                </div>
              )
            ) : activeTab === 'environments' ? (
              <div className={styles.variableManagementPanel}>
                {showGlobalPanel ? (
                  <GlobalVariablesPanel />
                ) : showEnvironmentForm ? (
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
          </div>
        ) : (
          <div className={styles.contentPanel}>
            <BulkTestPanel onSelectRequest={handleSelectRequest} />
          </div>
        )}
      </div>

    </div>
  );
}

function findNodeById(tree, id) {
  if (!Array.isArray(tree)) return null;
  return searchChildren(tree, id);
}

function searchChildren(children, id) {
  if (!children) return null;
  // Use == to handle string/number mismatch from localStorage serialization
  for (const node of children) {
    if (node.id == id) return node;
    if (node.children) {
      const found = searchChildren(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
