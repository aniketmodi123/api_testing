import { useState } from 'react';
import { useWorkspace } from '../../store/workspace';
import styles from './WorkspaceSelector.module.css';

export default function WorkspaceSelector() {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    createWorkspace,
    loading,
  } = useWorkspace();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const handleSelect = workspace => {
    setActiveWorkspace(workspace);
    setIsDropdownOpen(false);
  };

  const handleCreateWorkspace = async e => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    try {
      await createWorkspace({ name: newWorkspaceName.trim() });
      setNewWorkspaceName('');
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to create workspace:', err);
      // Handle error - could show a notification
    }
  };

  return (
    <div className={styles.workspaceSelector}>
      <button
        className={styles.selectorButton}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <span className={styles.workspaceName}>
          {activeWorkspace ? activeWorkspace.name : 'Select Workspace'}
        </span>
        <span className={styles.dropdownIcon}>▼</span>
      </button>

      {isDropdownOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <h3>Workspaces</h3>
            <button
              className={styles.newButton}
              onClick={() => setIsCreating(true)}
              disabled={loading}
            >
              + New
            </button>
          </div>

          {isCreating && (
            <form
              className={styles.createForm}
              onSubmit={handleCreateWorkspace}
            >
              <input
                type="text"
                placeholder="Workspace name"
                className={styles.createInput}
                value={newWorkspaceName}
                onChange={e => setNewWorkspaceName(e.target.value)}
                autoFocus
              />
              <div className={styles.createActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => {
                    setIsCreating(false);
                    setNewWorkspaceName('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.createButton}
                  disabled={!newWorkspaceName.trim() || loading}
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          )}

          <div className={styles.workspaceList}>
            {loading && !workspaces.length ? (
              <div className={styles.loadingItem}>Loading workspaces...</div>
            ) : workspaces.length > 0 ? (
              workspaces.map(workspace => (
                <div
                  key={workspace.id}
                  className={`${styles.workspaceItem} ${activeWorkspace?.id === workspace.id ? styles.active : ''}`}
                  onClick={() => handleSelect(workspace)}
                >
                  {workspace.name}
                </div>
              ))
            ) : (
              <div className={styles.emptyItem}>No workspaces found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
