import { useEffect, useRef, useState } from 'react';
import lookingGif from '../../assets/looking.gif';
import { useWorkspace } from '../../store/workspace';
import styles from './WorkspaceSelector.module.css';

export default function WorkspaceSelector() {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    createWorkspace,
    deleteWorkspace,
    loading,
    shouldLoadWorkspaces,
  } = useWorkspace();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');

  const handleSelect = workspace => {
    setActiveWorkspace(workspace);
    setIsDropdownOpen(false);
  };

  const handleCreateWorkspace = async e => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    try {
      await createWorkspace({
        name: newWorkspaceName.trim(),
        description: newWorkspaceDescription.trim() || null,
      });
      setNewWorkspaceName('');
      setNewWorkspaceDescription('');
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to create workspace:', err);
      // Handle error - could show a notification
    }
  };

  const handleDeleteClick = (e, workspace) => {
    e.stopPropagation(); // Prevent workspace selection
    setWorkspaceToDelete(workspace);
    setIsDeleting(true);
  };

  const handleConfirmDelete = async () => {
    if (!workspaceToDelete || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await deleteWorkspace(workspaceToDelete.id);
      // Always show loader for at least 500ms for user feedback
      setTimeout(() => {
        setIsDeleting(false);
        setWorkspaceToDelete(null);
        setDeleteLoading(false);
      }, 500);
    } catch (err) {
      console.error('Failed to delete workspace:', err);
      setDeleteLoading(false);
      // Handle error - could show a notification
    }
  };

  const handleCancelDelete = () => {
    setIsDeleting(false);
    setWorkspaceToDelete(null);
  };

  // Check the current URL path
  const [isAuthPage, setIsAuthPage] = useState(false);
  const dropdownRef = useRef(null);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    const handleClickOutside = event => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    // Only add the event listener when the dropdown is open
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    // Check if we're on an auth page
    const path = window.location.pathname;
    setIsAuthPage(
      path === '/sign-in' || path === '/sign-up' || path === '/forgot-password'
    );

    // Listen for URL changes
    const handleRouteChange = () => {
      const newPath = window.location.pathname;
      setIsAuthPage(
        newPath === '/sign-in' ||
          newPath === '/sign-up' ||
          newPath === '/forgot-password'
      );
    };

    window.addEventListener('popstate', handleRouteChange);

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // Don't render anything if workspace loading is disabled or we're on an auth page
  if (!shouldLoadWorkspaces || isAuthPage) {
    return null;
  }

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
        <div ref={dropdownRef} className={styles.dropdown}>
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
                required
              />
              <textarea
                placeholder="Description (optional)"
                className={styles.createInput}
                value={newWorkspaceDescription}
                onChange={e => setNewWorkspaceDescription(e.target.value)}
                rows={2}
              />
              <div className={styles.createActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => {
                    setIsCreating(false);
                    setNewWorkspaceName('');
                    setNewWorkspaceDescription('');
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

          {isDeleting &&
            workspaceToDelete &&
            (deleteLoading ? (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  background: 'rgba(0,0,0,0.4)',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={lookingGif}
                  alt="Processing..."
                  style={{ width: 120, height: 120, objectFit: 'contain' }}
                />
                <div
                  style={{
                    color: '#fff',
                    fontSize: 20,
                    marginTop: 16,
                    fontWeight: 500,
                  }}
                >
                  Processing...
                </div>
              </div>
            ) : (
              <div className={styles.deleteConfirmation}>
                <p>
                  Are you sure you want to delete "{workspaceToDelete.name}"?
                </p>
                <p className={styles.deleteWarning}>
                  This action cannot be undone.
                </p>
                <div className={styles.deleteActions}>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={handleCancelDelete}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={handleConfirmDelete}
                    disabled={deleteLoading}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

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
                  <button
                    className={styles.deleteWorkspaceButton}
                    onClick={e => handleDeleteClick(e, workspace)}
                    title="Delete workspace"
                  >
                    ×
                  </button>
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
