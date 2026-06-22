import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNode } from '../../store/node';
import { useWorkspace } from '../../store/workspace';
import { toPostmanCollection } from '../../utils/importExport';
import { Button } from '../common';
import ConfirmModal from '../ConfirmModal/ConfirmModal';
import ImportFileModal from '../ImportExport/ImportFileModal';
import LookingLoader from '../LookingLoader/LookingLoader';
import MoveCopyPanel from '../MoveCopyPanel';
import styles from './CollectionTree.module.css';

// HTTP method → CSS color variable. Module-scoped so it is a stable reference
// (keeps getMethodColor's useCallback identity stable across renders).
const METHOD_CSS_VAR = {
  GET:     '--viz-method-get',
  POST:    '--viz-method-post',
  PUT:     '--viz-method-put',
  DELETE:  '--viz-method-delete',
  PATCH:   '--viz-method-patch',
  HEAD:    '--viz-method-head',
  OPTIONS: '--viz-method-options',
};

// Recursive component for rendering node items (folders and files).
// Memoized so an unchanged node (stable object ref via structural sharing in the
// workspace store) skips re-render when a sibling/unrelated node mutates.
const NodeItem = memo(({
  node,
  expandedFolders,
  toggleFolder,
  handleDeleteNode,
  handleSelectRequest,
  selectedItem,
  getMethodColor,
  handleRenameAction,
  handleMoveCopyAction,
  handleCreateNewItem,
  handleExportFolder,
  handleImportCollection,
  closeAllMenus,
  level = 0,
}) => {
  // Maximum depth to prevent infinite recursion
  const MAX_LEVEL = 10;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuRef]);

  // Close this menu when another menu opens
  useEffect(() => {
    if (closeAllMenus) {
      setMenuOpen(false);
    }
  }, [closeAllMenus]);

  const handleMenuClick = e => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.right,
      y: rect.top,
    });
    setMenuOpen(prev => !prev);
  };

  const handleAction = (action, e) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent any default actions
    setMenuOpen(false);

    switch (action) {
      case 'createfolder':
        // Open the create item form for this folder
        handleCreateNewItem(node.id);
        break;
      case 'rename':
        handleRenameAction(node);
        break;
      case 'moveorcopy':
        handleMoveCopyAction(node);
        break;
      case 'export':
        if (handleExportFolder) handleExportFolder(node);
        break;
      case 'importcollection':
        if (handleImportCollection) handleImportCollection(node);
        break;
      case 'delete':
        handleDeleteNode(node.id, e);
        break;
      default:
        break;
    }
  };

  if (level > MAX_LEVEL) return null;

  if (node.type === 'folder') {
    const isExpanded = expandedFolders.includes(node.id);
    return (
      <div className={styles.nodeWrapper}>
        <div
          className={`${styles.nodeRow} ${styles.folderRow} ${selectedItem === node.id || selectedItem?.id === node.id ? styles.selected : ''}`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={() => { toggleFolder(node.id); handleSelectRequest(node); }}
          onContextMenu={handleMenuClick}
        >
          <span
            className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
          >
            ▶
          </span>
          <span className={styles.folderIcon}>📁</span>
          <span className={styles.nodeName}>{node.name}</span>
          <div
            className={styles.nodeActions}
            onClick={e => e.stopPropagation()}
          >
            <button
              className={styles.nodeActionBtn}
              title="More options"
              onClick={handleMenuClick}
            >
              ···
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            ref={menuRef}
            className={styles.contextMenu}
            style={{
              position: 'fixed',
              top: menuPosition.y,
              left: menuPosition.x,
              zIndex: 1000,
            }}
          >
            <div
              className={`${styles.menuItem} ${styles.createItem}`}
              onClick={e => handleAction('createfolder', e)}
            >
              Create Folder
            </div>
            <div
              className={styles.menuItem}
              onClick={e => handleAction('rename', e)}
            >
              Rename
            </div>
            <div
              className={styles.menuItem}
              onClick={e => handleAction('moveorcopy', e)}
            >
              Move/Copy
            </div>
            {node.type === 'folder' && (
              <div
                className={styles.menuItem}
                onClick={e => handleAction('export', e)}
              >
                Export as Postman
              </div>
            )}
            {node.type === 'folder' && (
              <div
                className={styles.menuItem}
                onClick={e => handleAction('importcollection', e)}
              >
                Import Collection
              </div>
            )}
            <div
              className={styles.menuItem}
              onClick={e => handleAction('delete', e)}
            >
              Delete
            </div>
          </div>
        )}

        {isExpanded && node.children && node.children.length > 0 && (
          <div className={styles.children}>
            {node.children.map(childNode => (
              <NodeItem
                key={childNode.id}
                node={childNode}
                level={level + 1}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                handleDeleteNode={handleDeleteNode}
                handleSelectRequest={handleSelectRequest}
                selectedItem={selectedItem}
                getMethodColor={getMethodColor}
                handleRenameAction={handleRenameAction}
                handleMoveCopyAction={handleMoveCopyAction}
                handleCreateNewItem={handleCreateNewItem}
                handleExportFolder={handleExportFolder}
                handleImportCollection={handleImportCollection}
                closeAllMenus={closeAllMenus}
              />
            ))}
          </div>
        )}
      </div>
    );
  } else {
    return (
      <div className={styles.nodeWrapper}>
        <div
          className={`${styles.nodeRow} ${styles.fileRow} ${selectedItem === node.id || selectedItem?.id === node.id ? styles.selected : ''}`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={() => handleSelectRequest(node)}
          onContextMenu={handleMenuClick}
        >
          <span
            className={styles.methodBadge}
            style={{ color: getMethodColor(node.method) }}
          >
            {(node.method || 'GET').toUpperCase().slice(0, 3)}
          </span>
          <span className={styles.nodeName}>{node.name}</span>
          <div
            className={styles.nodeActions}
            onClick={e => e.stopPropagation()}
          >
            <button
              className={styles.nodeActionBtn}
              title="More options"
              onClick={handleMenuClick}
            >
              ···
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            ref={menuRef}
            className={styles.contextMenu}
            style={{
              position: 'fixed',
              top: menuPosition.y,
              left: menuPosition.x,
              zIndex: 1000,
            }}
          >
            <div
              className={styles.menuItem}
              onClick={e => handleAction('rename', e)}
            >
              Rename
            </div>
            <div
              className={styles.menuItem}
              onClick={e => handleAction('moveorcopy', e)}
            >
              Move/Copy
            </div>
            <div
              className={styles.menuItem}
              onClick={e => handleAction('delete', e)}
            >
              Delete
            </div>
          </div>
        )}
      </div>
    );
  }
});
NodeItem.displayName = 'NodeItem';

export default function CollectionTree({ onSelectRequest }) {
  // Local loading state for API calls
  const [apiLoading, setApiLoading] = useState(false);
  const {
    activeWorkspace,
    workspaceTree,
    loading: workspaceLoading,
    refreshWorkspaces, // <-- add this
    setWorkspaceTree,
  } = useWorkspace();
  const {
    nodes,
    loading: nodeLoading,
    fetchNodesByWorkspaceId,
    createFolder,
    createFile,
    updateNode,
    deleteNode,
  } = useNode();

  const [expandedFolders, setExpandedFolders] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [filterText, setFilterText] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [nodeToRename, setNodeToRename] = useState(null);
  const [newName, setNewName] = useState('');
  const [menuUpdateTrigger, setMenuUpdateTrigger] = useState(0);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(true);
  const [parentFolderId, setParentFolderId] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [newApiMethod, setNewApiMethod] = useState('GET');

  // Import/Export state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
    type: 'delete',
    loading: false,
  });

  // Move/Copy panel state
  const [isMoveCopyPanelOpen, setIsMoveCopyPanelOpen] = useState(false);
  const [moveCopyNode, setMoveCopyNode] = useState(null);

  // Fetch nodes when workspace changes
  // No need to re-fetch nodes after move/copy/delete; use API response instead

  // Use workspace tree data (file_tree) if available, otherwise fallback to nodes or sample data
  const rootNodes =
    workspaceTree?.file_tree ||
    (nodes.length > 0 ? nodes : activeWorkspace ? [] : []);

  const toggleFolder = useCallback(folderId => {
    setExpandedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  }, []);

  const handleSelectRequest = useCallback(
    request => {
      setSelectedItem(request.id);
      onSelectRequest && onSelectRequest(request);
    },
    [onSelectRequest]
  );

  // This function is no longer used but kept for future reference
  const isActionInProgress = () => {
    return false; // Disabling this check to allow multiple actions
  };

  const handleAddFolder = () => {
    setIsAddingFolder(true);
    // Reset other states
    setIsRenaming(false);
    setIsCreatingItem(false);
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim() && activeWorkspace) {
      const folderName = newFolderName.trim();
      setApiLoading(true);
      try {
        await createFolder({
          name: folderName,
          workspace_id: activeWorkspace.id,
          parent_id: null, // Root level folder - use snake_case for API
        });
        setNewFolderName('');
        setIsAddingFolder(false);
      } finally {
        setApiLoading(false);
      }
    }
  };

  const handleCancelAddFolder = () => {
    setIsAddingFolder(false);
    setNewFolderName('');
  };

  const [deleteLoading, setDeleteLoading] = useState(false);
  const handleDeleteNode = useCallback(
    (nodeId, e) => {
      e.stopPropagation();

      // Find the node name for better UX
      const nodeToDelete = nodes.flat(Infinity).find(n => n.id === nodeId) || {
        name: 'this item',
      };

      setModalConfig({
        nodeName: nodeToDelete.name,
        nodeId,
      });
      setModalOpen(true);
    },
    [nodes]
  );

  // Close all menus to ensure only one is open at a time
  const closeAllMenus = useCallback(() => {
    setMenuUpdateTrigger(prev => prev + 1);
  }, []);

  // Handle rename action
  const handleRenameAction = useCallback(
    node => {
      setNodeToRename(node);
      setNewName(node.name);
      setIsRenaming(true);

      // Reset other states
      setIsAddingFolder(false);
      setIsCreatingItem(false);

      closeAllMenus();
    },
    [closeAllMenus]
  ); // Handle rename submit
  const handleRename = async () => {
    if (newName.trim() && nodeToRename) {
      const newNameValue = newName.trim();
      setApiLoading(true);
      try {
        const result = await updateNode(nodeToRename.id, {
          name: newNameValue,
        });
        // If the API returns the updated tree, update it here
        if (result?.data?.file_tree && typeof setWorkspaceTree === 'function') {
          setWorkspaceTree({ ...result.data });
        } else if (typeof refreshWorkspaces === 'function') {
          // Fallback: force refresh if available
          await refreshWorkspaces();
        }
        setIsRenaming(false);
        setNodeToRename(null);
        setNewName('');
      } finally {
        setApiLoading(false);
      }
    }
  };

  // Handle cancel rename
  const handleCancelRename = () => {
    setIsRenaming(false);
    setNodeToRename(null);
    setNewName('');
  };

  // Handle creating a new item (folder or file)
  const handleCreateNewItem = useCallback(
    parentId => {
      // Expand the parent folder
      if (!expandedFolders.includes(parentId)) {
        toggleFolder(parentId);
      }

      setParentFolderId(parentId);
      setNewItemName('');
      setIsCreatingItem(true);
      setIsCreatingFolder(true); // Default to folder

      // Reset other states
      setIsAddingFolder(false);
      setIsRenaming(false);

      closeAllMenus();
    },
    [expandedFolders, toggleFolder, closeAllMenus]
  ); // Handle creating the new item
  const handleCreateItem = async () => {
    if (newItemName.trim() && activeWorkspace) {
      const itemName = newItemName.trim();
      setApiLoading(true);
      // Helper to update tree from API response and preserve expanded state
      const handleApiResponse = result => {
        if (result?.data?.file_tree && typeof setWorkspaceTree === 'function') {
          setWorkspaceTree({ ...result.data });
          setExpandedFolders(prev => {
            const expanded = new Set(prev);
            if (parentFolderId) {
              expanded.add(parentFolderId);
            }
            return [...expanded];
          });
        }
        setNewItemName('');
        setIsCreatingItem(false);
        setParentFolderId(null);
      };
      try {
        if (isCreatingFolder) {
          const result = await createFolder({
            name: itemName,
            workspace_id: activeWorkspace.id,
            parent_id: parentFolderId,
          });
          handleApiResponse(result);
        } else {
          const result = await createFile({
            name: itemName,
            workspace_id: activeWorkspace.id,
            parent_id: parentFolderId,
            method: newApiMethod,
            url: '',
          });
          handleApiResponse(result);
        }
      } finally {
        setApiLoading(false);
      }
    }
  };

  // Handle canceling item creation
  const handleCancelCreateItem = () => {
    setIsCreatingItem(false);
    setParentFolderId(null);
    setNewItemName('');
  };

  // Handle Move/Copy action
  const handleMoveCopyAction = useCallback(node => {
    setMoveCopyNode(node);
    setIsMoveCopyPanelOpen(true);
  }, []);

  // Export a folder subtree as Postman v2.1 JSON download
  const handleExportFolder = useCallback(node => {
    const subtree = [node];
    const collection = toPostmanCollection(subtree, node.name);
    const blob = new Blob([JSON.stringify(collection, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${node.name.replace(/\s+/g, '_')}_postman.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Open import modal
  const handleImportCollection = useCallback(() => {
    setIsImportModalOpen(true);
  }, []);

  // Filter nodes based on search text
  const filteredNodes =
    filterText.trim() === ''
      ? rootNodes
      : rootNodes.filter(node =>
          node.name.toLowerCase().includes(filterText.toLowerCase())
        );

  const getMethodColor = useCallback(method => {
    const varName = METHOD_CSS_VAR[method];
    if (!varName) return 'var(--text-muted)';
    return `var(${varName})`;
  }, []);

  // Helper to force refresh and wait before closing Move/Copy panel
  const refreshAndWait = async () => {
    // No longer needed: tree is updated from API response after create/move/copy/delete
    return Promise.resolve();
  };

  return (
    <div className={styles.collectionTreeRoot}>
      <div className={styles.header}>
        <input
          type="text"
          placeholder="Filter"
          className={styles.filterInput}
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        <Button
          variant="primary"
          size="small"
          onClick={handleAddFolder}
          title="Add new folder"
        >
          +
        </Button>
      </div>

      <div className={`${styles.treeContainer} scrollable`}>
        {isAddingFolder && (
          <div className={styles.newFolderForm}>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              autoFocus
              className={styles.newFolderInput}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateFolder();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancelAddFolder();
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  // Focus the first button (Create)
                  const form = e.target.closest('div');
                  const btns = form?.querySelectorAll('button');
                  if (btns && btns.length > 0) btns[0].focus();
                }
              }}
            />
            <div className={styles.newFolderActions}>
              <Button
                variant="primary"
                size="small"
                onClick={handleCreateFolder}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    // Focus Cancel
                    e.preventDefault();
                    e.target.parentNode.querySelectorAll('button')[1].focus();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateFolder();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelAddFolder();
                  }
                }}
              >
                Create
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCancelAddFolder}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    // Focus Create
                    e.preventDefault();
                    e.target.parentNode.querySelectorAll('button')[0].focus();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCancelAddFolder();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelAddFolder();
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isRenaming && (
          <div className={styles.newFolderForm}>
            <input
              type="text"
              placeholder="New name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
              className={styles.newFolderInput}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancelRename();
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  // Focus the first button (Rename)
                  const form = e.target.closest('div');
                  const btns = form?.querySelectorAll('button');
                  if (btns && btns.length > 0) btns[0].focus();
                }
              }}
            />
            <div className={styles.newFolderActions}>
              <Button
                variant="primary"
                size="small"
                onClick={handleRename}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    // Focus Cancel
                    e.preventDefault();
                    e.target.parentNode.querySelectorAll('button')[1].focus();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelRename();
                  }
                }}
              >
                Rename
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCancelRename}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    // Focus Rename
                    e.preventDefault();
                    e.target.parentNode.querySelectorAll('button')[0].focus();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCancelRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelRename();
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isCreatingItem && (
          <div className={styles.newFolderForm}>
            <div className={styles.itemTypeSelector}>
              <Button
                variant={isCreatingFolder ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setIsCreatingFolder(true)}
              >
                Folder
              </Button>
              <Button
                variant={!isCreatingFolder ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setIsCreatingFolder(false)}
              >
                API Request
              </Button>
            </div>

            <input
              type="text"
              placeholder={isCreatingFolder ? 'Folder name' : 'API name'}
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              autoFocus
              className={styles.newFolderInput}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateItem();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancelCreateItem();
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  // Focus the first button (Create)
                  const form = e.target.closest('div');
                  const btns = form?.querySelectorAll('button');
                  if (btns && btns.length > 0) btns[0].focus();
                }
              }}
            />

            {!isCreatingFolder && (
              <div className={styles.methodSelector}>
                <select
                  value={newApiMethod}
                  onChange={e => setNewApiMethod(e.target.value)}
                  className={styles.methodDropdown}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                  <option value="HEAD">HEAD</option>
                  <option value="OPTIONS">OPTIONS</option>
                </select>
              </div>
            )}

            <div className={styles.newFolderActions}>
              <Button
                variant="primary"
                size="small"
                onClick={handleCreateItem}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    // Focus Cancel
                    e.preventDefault();
                    e.target.parentNode.querySelectorAll('button')[1].focus();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateItem();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelCreateItem();
                  }
                }}
              >
                Create
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCancelCreateItem}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    // Focus Create
                    e.preventDefault();
                    e.target.parentNode.querySelectorAll('button')[0].focus();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCancelCreateItem();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelCreateItem();
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {filteredNodes.length > 0
          ? filteredNodes.map(node => (
              <NodeItem
                key={node.id}
                node={node}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                handleDeleteNode={handleDeleteNode}
                handleSelectRequest={handleSelectRequest}
                selectedItem={selectedItem}
                getMethodColor={getMethodColor}
                handleRenameAction={handleRenameAction}
                handleMoveCopyAction={handleMoveCopyAction}
                handleCreateNewItem={handleCreateNewItem}
                handleExportFolder={handleExportFolder}
                handleImportCollection={handleImportCollection}
                closeAllMenus={menuUpdateTrigger}
              />
            ))
          : null}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={modalOpen}
        title="Delete Item"
        message={
          <>
            Are you sure you want to delete the item{' '}
            <strong>"{modalConfig?.nodeName}"</strong>?
          </>
        }
        warn_message="This action cannot be undone. All data in this item will be permanently deleted."
        confirmText={deleteLoading ? 'Deleting...' : 'Delete Item'}
        cancelText="Cancel"
        type="delete"
        loading={deleteLoading}
        onCancel={() => setModalOpen(false)}
        onConfirm={async () => {
          setDeleteLoading(true);
          setApiLoading(true);
          setIsAddingFolder(false);
          setIsRenaming(false);
          setIsCreatingItem(false);
          try {
            const { deleteNodeAndGetTree } = await import(
              '../../services/deleteNodeAndGetTree.js'
            );
            const result = await deleteNodeAndGetTree(modalConfig.nodeId);
            if (result?.data) {
              if (typeof setWorkspaceTree === 'function') {
                setWorkspaceTree(result.data);
              }
              setSelectedItem(null);
            }
          } catch (err) {
            alert('Failed to delete node. ' + (err?.message || ''));
          }
          setDeleteLoading(false);
          setApiLoading(false);
          setModalOpen(false);
        }}
      />
      {/* API Loader Overlay */}
      {apiLoading && (
        <div style={{ position: 'fixed', zIndex: 9999, inset: 0 }}>
          <LookingLoader overlay text="Loading..." />
        </div>
      )}

      {/* Import Collection Modal */}
      {isImportModalOpen && (
        <ImportFileModal
          workspaceId={activeWorkspace?.id}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => refreshWorkspaces()}
        />
      )}

      {/* Move/Copy Panel */}
      <MoveCopyPanel
        isOpen={isMoveCopyPanelOpen}
        onClose={() => {
          setIsMoveCopyPanelOpen(false);
          setMoveCopyNode(null);
        }}
        node={moveCopyNode}
        onMoveCopyComplete={({ updatedWorkspaceTree }) => {
          setSelectedItem(null);
          if (updatedWorkspaceTree && typeof setWorkspaceTree === 'function') {
            setWorkspaceTree(updatedWorkspaceTree);
          }
        }}
        fileTree={workspaceTree?.file_tree || []}
      />
    </div>
  );
}
