import { useEffect, useState } from 'react';
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
  // State for collection, and request
  const [activeTab, setActiveTab] = useState('collections');
  const [activeRequest, setActiveRequest] = useState(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState(null);

  // Variable modal states
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [editingVariable, setEditingVariable] = useState(null);

  // Environment form states
  const [showEnvironmentForm, setShowEnvironmentForm] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState(null);

  // Use the workspace context instead of local state
  const { activeWorkspace, workspaceTree, setShouldLoadWorkspaces } =
    useWorkspace(); // Use node context for managing nodes/folders
  const { selectedNode, setSelectedNode } = useNode();

  // Use environment context for environment management
  const {
    variables,
    activeEnvironment,
    createEnvironment,
    updateEnvironment,
    createEnvironmentFromTemplate,
  } = useEnvironment();

  // Enable workspace loading when home component mounts
  useEffect(() => {
    setShouldLoadWorkspaces(true);

    // Disable workspace loading when component unmounts
    return () => setShouldLoadWorkspaces(false);
  }, [setShouldLoadWorkspaces]);

  const handleTabChange = tab => {
    setActiveTab(tab);
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
          result = await createEnvironmentFromTemplate(environmentData);
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

  return (
    <div className={styles.homeContainer}>
      <div className={styles.mainContent}>
        {/* Left Sidebar */}
        <Sidebar onTabChange={handleTabChange} />

        {/* Collection or Environment Panel based on active tab */}
        <div className={styles.sidePanel}>
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

        {/* Main Content Area */}
        <div className={styles.contentPanel}>
          {activeTab === 'collections' ? (
            <RequestPanel activeRequest={activeRequest} />
          ) : (
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
