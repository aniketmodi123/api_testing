import { useState } from 'react';
import CollectionTree from '../../components/CollectionTree/CollectionTree';
import RequestPanel from '../../components/RequestPanel/RequestPanel';
import Sidebar from '../../components/Sidebar/Sidebar';
import { useWorkspace } from '../../store/workspace';
import styles from './Home.module.css';

export default function Home() {
  // State for collection, and request
  const [activeTab, setActiveTab] = useState('collections');
  const [activeRequest, setActiveRequest] = useState(null);

  // Use the workspace context instead of local state
  const { activeWorkspace, workspaceTree } = useWorkspace();

  const handleTabChange = tab => {
    setActiveTab(tab);
  };

  const handleSelectRequest = request => {
    setActiveRequest(request);
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
            <div className={styles.environmentPanel}>
              <div className={styles.panelHeader}>
                <h3>Environments</h3>
                <button className={styles.addButton}>+</button>
              </div>
              <div className={styles.emptyState}>
                <p>No environments created yet</p>
                <button className={styles.createButton}>
                  Create Environment
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className={styles.contentPanel}>
          <RequestPanel activeRequest={activeRequest} />
        </div>
      </div>
    </div>
  );
}
