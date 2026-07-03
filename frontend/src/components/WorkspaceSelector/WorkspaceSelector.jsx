import { useEffect, useRef, useState } from 'react';
import lookingGif from '../../assets/looking.gif';
import { useWorkspace } from '../../store/workspace';
import MembersPanel from '../Workspace/MembersPanel';
import { RoleBadge } from '../common';
import styles from './WorkspaceSelector.module.css';

// Postman-style "people" glyph used for workspace rows + trigger
function WorkspaceIcon({ className }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function GridIcon({ className }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// Format an ISO/date string into a short readable date; falls back to raw value
function formatCreatedAt(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function WorkspaceSelector() {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    loading,
    shouldLoadWorkspaces,
  } = useWorkspace();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Edit (rename) state
  const [workspaceToEdit, setWorkspaceToEdit] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  // Detail pane: workspace currently hovered in the list (falls back to active)
  const [hoveredWorkspace, setHoveredWorkspace] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = async id => {
    try {
      await navigator.clipboard.writeText(String(id));
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch (err) {
      console.error('Failed to copy workspace id:', err);
    }
  };

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

  const handleEditClick = (e, workspace) => {
    e.stopPropagation(); // Prevent workspace selection
    setWorkspaceToEdit(workspace);
    setEditName(workspace.name);
    setEditDescription(workspace.description || '');
  };

  const handleUpdateWorkspace = async e => {
    e.preventDefault();
    if (!workspaceToEdit || !editName.trim()) return;

    try {
      await updateWorkspace(workspaceToEdit.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setWorkspaceToEdit(null);
      setEditName('');
      setEditDescription('');
    } catch (err) {
      console.error('Failed to update workspace:', err);
    }
  };

  const handleCancelEdit = () => {
    setWorkspaceToEdit(null);
    setEditName('');
    setEditDescription('');
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

  // Filter workspaces by search query (case-insensitive)
  const filteredWorkspaces = workspaces.filter(w =>
    w.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <div className={styles.workspaceSelector}>
      <button
        className={styles.selectorButton}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <WorkspaceIcon className={styles.triggerIcon} />
        <span className={styles.workspaceName}>
          {activeWorkspace ? activeWorkspace.name : 'Select Workspace'}
        </span>
        {activeWorkspace?.is_shared && (
          <RoleBadge role={activeWorkspace.member_role || 'viewer'} />
        )}
        <ChevronIcon className={styles.dropdownIcon} />
      </button>
      {activeWorkspace && (
        <button
          className={styles.membersToggleBtn}
          title="Workspace members"
          onClick={() => setShowMembers(v => !v)}
        >
          👥
        </button>
      )}

      {showMembers && activeWorkspace && (
        <div className={styles.membersPanelPopover}>
          <MembersPanel
            workspaceId={activeWorkspace.id}
            isOwner={!activeWorkspace.is_shared}
          />
        </div>
      )}

      {isDropdownOpen && (
        <div ref={dropdownRef} className={styles.dropdown}>
          {!isCreating && !workspaceToEdit && (
            <div className={styles.dropdownHeader}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search workspaces..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button
                className={styles.createTopButton}
                onClick={() => setIsCreating(true)}
                disabled={loading}
              >
                Create
              </button>
            </div>
          )}

          {workspaceToEdit && (
            <form
              className={styles.createForm}
              onSubmit={handleUpdateWorkspace}
            >
              <input
                type="text"
                placeholder="Workspace name"
                className={styles.createInput}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                autoFocus
                required
              />
              <textarea
                placeholder="Description (optional)"
                className={styles.createInput}
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={2}
              />
              <div className={styles.createActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancelEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.createButton}
                  disabled={!editName.trim() || loading}
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}

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
                    color: '#fff', // intentional — fixed dark scrim overlay, not a themed surface
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

          {!isCreating && !workspaceToEdit && (
            <>
              <div className={styles.dropdownBody}>
                <div
                  className={styles.workspaceList}
                  onMouseLeave={() => setHoveredWorkspace(null)}
                >
                  {loading && !workspaces.length ? (
                    <div className={styles.loadingItem}>
                      Loading workspaces...
                    </div>
                  ) : filteredWorkspaces.length > 0 ? (
                    filteredWorkspaces.map(workspace => (
                      <div
                        key={workspace.id}
                        className={`${styles.workspaceItem} ${activeWorkspace?.id === workspace.id ? styles.active : ''}`}
                        onClick={() => handleSelect(workspace)}
                        onMouseEnter={() => setHoveredWorkspace(workspace)}
                      >
                        <WorkspaceIcon className={styles.itemIcon} />
                        <span className={styles.workspaceItemName}>
                          {workspace.name}
                        </span>
                        {activeWorkspace?.id === workspace.id && (
                          <span className={styles.activeTag}>ACTIVE</span>
                        )}
                        {workspace.is_shared && (
                          <RoleBadge role={workspace.member_role || 'viewer'} />
                        )}
                        {!workspace.is_shared && (
                          <div className={styles.itemActions}>
                            <button
                              className={styles.itemActionBtn}
                              onClick={e => handleEditClick(e, workspace)}
                              title="Rename workspace"
                            >
                              <EditIcon />
                            </button>
                            <button
                              className={styles.deleteWorkspaceButton}
                              onClick={e => handleDeleteClick(e, workspace)}
                              title="Delete workspace"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className={styles.emptyItem}>No workspaces found</div>
                  )}
                </div>

                {(() => {
                  const detail = hoveredWorkspace || activeWorkspace;
                  if (!detail) {
                    return (
                      <div className={styles.detailPane}>
                        <div className={styles.detailEmpty}>
                          Select a workspace to see its details
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className={styles.detailPane}>
                      <div className={styles.detailHeader}>
                        <WorkspaceIcon className={styles.detailIcon} />
                        <span className={styles.detailName}>{detail.name}</span>
                        {detail.is_shared && (
                          <RoleBadge role={detail.member_role || 'viewer'} />
                        )}
                      </div>

                      {detail.description && (
                        <p className={styles.detailDescription}>
                          {detail.description}
                        </p>
                      )}

                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Created by</span>
                        <span className={styles.metaValue}>
                          {detail.is_shared
                            ? `Shared (${detail.member_role || 'viewer'})`
                            : 'You'}
                        </span>
                      </div>

                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Created</span>
                        <span className={styles.metaValue}>
                          {formatCreatedAt(detail.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* <div className={styles.dropdownFooter}>
                <button
                  className={styles.viewAllButton}
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <GridIcon className={styles.footerIcon} />
                  View all workspaces
                </button>
              </div> */}
            </>
          )}
        </div>
      )}
    </div>
  );
}
