import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../store/api';
import { useNode } from '../../store/node';
import { useWorkspace } from '../../store/workspace';
import HeaderEditor from '../HeaderEditor/HeaderEditor';
import { Button } from '../common';
import styles from './CollectionTree.module.css';

// Custom Modal Component for confirmations
const ConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'delete',
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{title}</h3>
        </div>
        <div className={styles.modalBody}>
          <p>{message}</p>
        </div>
        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            variant={type === 'delete' ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Recursive component for rendering node items (folders and files)
const NodeItem = ({
  node,
  expandedFolders,
  toggleFolder,
  handleDeleteNode,
  handleSelectRequest,
  selectedItem,
  getMethodColor,
  handleRenameAction,
  handleDuplicateNode,
  handleCreateNewItem,
  handleEditHeaders, // Added this prop
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
      case 'create':
        // Only available for folders
        if (node.type === 'folder') {
          // Set the parent folder ID and toggle it open
          handleCreateNewItem(node.id);
        }
        break;
      case 'rename':
        handleRenameAction(node);
        break;
      case 'duplicate':
        handleDuplicateNode(node);
        break;
      case 'headers':
        // Only available for folders
        if (node.type === 'folder' && handleEditHeaders) {
          // Open the header editor modal for this folder
          handleEditHeaders(node);
        } else {
        }
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
    return (
      <div className={`${styles.subFolder} ${level > 0 ? styles.nested : ''}`}>
        <div
          className={styles.folderHeader}
          onClick={() => toggleFolder(node.id)}
        >
          <span className={styles.expansionIcon}>
            {expandedFolders.includes(node.id) ? '▼' : '▶'}
          </span>
          <span className={styles.folderIcon}>📁</span>
          <span className={styles.folderName}>{node.name}</span>
          <div className={styles.nodeActions}>
            <Button
              variant="secondary"
              size="small"
              onClick={handleMenuClick}
              title="Actions"
            >
              ⋮
            </Button>
            {menuOpen && (
              <div
                className={styles.contextMenu}
                style={{
                  top: `${menuPosition.y}px`,
                  left: `${menuPosition.x}px`,
                }}
                ref={menuRef}
              >
                <div
                  className={`${styles.menuItem} ${styles.createItem}`}
                  onClick={e => handleAction('create', e)}
                >
                  Create
                </div>
                <div
                  className={styles.menuItem}
                  onClick={e => handleAction('rename', e)}
                >
                  Rename
                </div>
                <div
                  className={styles.menuItem}
                  onClick={e => handleAction('duplicate', e)}
                >
                  Duplicate
                </div>
                {node.type === 'folder' && (
                  <div
                    className={`${styles.menuItem} ${styles.headersItem}`}
                    onClick={e => handleAction('headers', e)}
                  >
                    Edit Headers
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
          </div>
        </div>

        {node.children && expandedFolders.includes(node.id) && (
          <div className={styles.folderItems}>
            {node.children.map(childNode => (
              <NodeItem
                key={childNode.id}
                node={childNode}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                handleDeleteNode={handleDeleteNode}
                handleSelectRequest={handleSelectRequest}
                selectedItem={selectedItem}
                getMethodColor={getMethodColor}
                level={level + 1}
                handleRenameAction={handleRenameAction}
                handleDuplicateNode={handleDuplicateNode}
                handleCreateNewItem={handleCreateNewItem}
                handleEditHeaders={handleEditHeaders}
                closeAllMenus={closeAllMenus}
              />
            ))}
          </div>
        )}
      </div>
    );
  } else {
    return (
      <div
        className={`${styles.requestItem} ${selectedItem === node.id ? styles.selected : ''}`}
        onClick={() => handleSelectRequest(node)}
      >
        <span
          className={styles.methodBadge}
          style={{
            backgroundColor: getMethodColor(node.method || 'GET'),
          }}
        >
          {node.method || 'GET'}
        </span>
        <span className={styles.requestName}>{node.name}</span>
        <div className={styles.nodeActions}>
          <Button
            variant="secondary"
            size="small"
            onClick={handleMenuClick}
            title="Actions"
          >
            ⋮
          </Button>
          {menuOpen && (
            <div
              className={styles.contextMenu}
              style={{
                top: `${menuPosition.y}px`,
                left: `${menuPosition.x}px`,
              }}
              ref={menuRef}
            >
              <div
                className={styles.menuItem}
                onClick={e => handleAction('rename', e)}
              >
                Rename
              </div>
              <div
                className={styles.menuItem}
                onClick={e => handleAction('duplicate', e)}
              >
                Duplicate
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
      </div>
    );
  }
};

// Fallback sample data if workspace tree is not available
const sampleCollections = [
  {
    id: 1,
    name: 'API Testing',
    type: 'folder',
    children: [
      {
        id: 'folder-1',
        type: 'folder',
        name: 'Users API',
        children: [
          {
            id: 'req-1',
            type: 'file',
            method: 'GET',
            name: 'Get All Users',
            url: 'https://api.example.com/users',
          },
          {
            id: 'req-2',
            type: 'file',
            method: 'POST',
            name: 'Create User',
            url: 'https://api.example.com/users',
          },
        ],
      },
      {
        id: 'folder-2',
        type: 'folder',
        name: 'Products API',
        children: [
          {
            id: 'req-3',
            type: 'file',
            method: 'GET',
            name: 'Get All Products',
            url: 'https://api.example.com/products',
          },
        ],
      },
      {
        id: 'req-4',
        type: 'file',
        method: 'GET',
        name: 'Health Check',
        url: 'https://api.example.com/health',
      },
    ],
  },
];

export default function CollectionTree({ onSelectRequest }) {
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const {
    nodes,
    loading: nodeLoading,
    fetchNodesByWorkspaceId,
    createFolder,
    createFile,
    updateNode,
    deleteNode,
  } = useNode();
  const { duplicateApi } = useApi();

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

  // Header editor state
  const [isHeaderEditorOpen, setIsHeaderEditorOpen] = useState(false);
  const [currentFolder, setCurrentFolder] = useState(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
    type: 'delete',
  });

  // Fetch nodes when workspace changes
  useEffect(() => {
    if (activeWorkspace) {
      fetchNodesByWorkspaceId(activeWorkspace.id);
    }
  }, [activeWorkspace, fetchNodesByWorkspaceId]);

  // Use actual nodes or fallback to sample data
  const rootNodes =
    nodes.length > 0 ? nodes : activeWorkspace ? [] : sampleCollections;

  const toggleFolder = folderId => {
    setExpandedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  const handleSelectRequest = request => {
    setSelectedItem(request.id);
    onSelectRequest && onSelectRequest(request);
  };

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

  const handleCreateFolder = () => {
    if (newFolderName.trim() && activeWorkspace) {
      const folderName = newFolderName.trim();

      // Directly create the folder without confirmation
      createFolder({
        name: folderName,
        workspace_id: activeWorkspace.id,
        parent_id: null, // Root level folder - use snake_case for API
      });
      setNewFolderName('');
      setIsAddingFolder(false);
    }
  };

  const handleCancelAddFolder = () => {
    setIsAddingFolder(false);
    setNewFolderName('');
  };

  const handleDeleteNode = (nodeId, e) => {
    e.stopPropagation();

    // Find the node name for better UX
    const nodeToDelete = nodes.flat(Infinity).find(n => n.id === nodeId) || {
      name: 'this item',
    };

    // Configure and show the confirmation modal
    setModalConfig({
      title: 'Confirm Deletion',
      message: `Are you sure you want to delete "${nodeToDelete.name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'delete',
      onConfirm: () => {
        // Cancel any ongoing actions
        setIsAddingFolder(false);
        setIsRenaming(false);
        setIsCreatingItem(false);

        // Perform the deletion
        deleteNode(nodeId);

        // Close the modal
        setModalOpen(false);
      },
    });

    setModalOpen(true);
  };

  // Close all menus to ensure only one is open at a time
  const closeAllMenus = () => {
    setMenuUpdateTrigger(prev => prev + 1);
  };

  // Handle rename action
  const handleRenameAction = node => {
    setNodeToRename(node);
    setNewName(node.name);
    setIsRenaming(true);

    // Reset other states
    setIsAddingFolder(false);
    setIsCreatingItem(false);

    closeAllMenus();
  }; // Handle rename submit
  const handleRename = () => {
    if (newName.trim() && nodeToRename) {
      const newNameValue = newName.trim();

      // Directly rename without confirmation
      updateNode(nodeToRename.id, {
        name: newNameValue,
      });
      setIsRenaming(false);
      setNodeToRename(null);
      setNewName('');
    }
  };

  // Handle cancel rename
  const handleCancelRename = () => {
    setIsRenaming(false);
    setNodeToRename(null);
    setNewName('');
  };

  // Handle creating a new item (folder or file)
  const handleCreateNewItem = parentId => {
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
  }; // Handle creating the new item
  const handleCreateItem = () => {
    if (newItemName.trim() && activeWorkspace) {
      const itemName = newItemName.trim();

      // Directly create the item without confirmation
      if (isCreatingFolder) {
        createFolder({
          name: itemName,
          workspace_id: activeWorkspace.id,
          parent_id: parentFolderId,
        });
      } else {
        createFile({
          name: itemName,
          workspace_id: activeWorkspace.id,
          parent_id: parentFolderId,
          method: newApiMethod,
          url: '',
        });
      }
      setNewItemName('');
      setIsCreatingItem(false);
      setParentFolderId(null);
    }
  };

  // Handle canceling item creation
  const handleCancelCreateItem = () => {
    setIsCreatingItem(false);
    setParentFolderId(null);
    setNewItemName('');
  };

  // Handle duplicate API functionality

  // Handle duplicate node
  const handleDuplicateNode = async node => {
    if (activeWorkspace) {
      const duplicateName = `${node.name} (Copy)`;

      try {
        // If this is a file node that contains an API, use the API duplication endpoint
        if (node.type === 'file' && node.id) {
          // Ask for custom API name
          const customName = prompt(
            'Enter a name for the duplicated API:',
            duplicateName
          );

          if (customName === null) {
            // User canceled the prompt
            return;
          }

          // Ask if test cases should be included
          const includeCases = confirm(
            'Include test cases in the duplication?'
          );

          // Call the duplicateApi function
          const result = await duplicateApi(node.id, customName, includeCases);

          if (result && result.response_code === 201) {
            alert(
              `API duplicated successfully to file: ${result.data.new_file_name}`
            );
            // Refresh the node tree to show the new file
            if (activeWorkspace) {
              fetchNodesByWorkspaceId(activeWorkspace.id);
            }
          } else {
            alert('Failed to duplicate API. Please try again.');
          }
        } else {
          // For folder nodes or if API duplication fails, use the standard file/folder duplication
          const duplicateData = {
            name: duplicateName,
            workspace_id: activeWorkspace.id,
            parent_id: node.parent_id,
          };

          if (node.type === 'folder') {
            createFolder(duplicateData);
          } else {
            createFile({
              ...duplicateData,
              method: node.method || 'GET',
              url: node.url || '',
            });
          }
        }
      } catch (err) {
        console.error('Error duplicating node:', err);
        alert(`Error during duplication: ${err.message || 'Unknown error'}`);
      }
    }
  };

  // Handle opening the header editor
  const handleEditHeaders = node => {
    if (node && node.type === 'folder') {
      setCurrentFolder(node);
      setIsHeaderEditorOpen(true);
    } else {
      console.error(
        'Cannot open header editor: Invalid node or not a folder',
        node
      );
    }
  };

  // Handle saving headers
  const handleSaveHeaders = headerData => {
    setIsHeaderEditorOpen(false);
    setCurrentFolder(null);
  }; // Filter nodes based on search text
  const filteredNodes =
    filterText.trim() === ''
      ? rootNodes
      : rootNodes.filter(node =>
          node.name.toLowerCase().includes(filterText.toLowerCase())
        );

  // Method badge color based on HTTP method
  const getMethodColor = method => {
    const methodColors = {
      GET: '#10b981', // Green
      POST: '#f97316', // Orange
      PUT: '#3b82f6', // Blue
      DELETE: '#ef4444', // Red
      PATCH: '#8b5cf6', // Purple
      HEAD: '#6b7280', // Gray
      OPTIONS: '#6b7280', // Gray
    };

    return methodColors[method] || '#6b7280';
  };

  return (
    <div className={styles.collectionTree}>
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
            />
            <div className={styles.newFolderActions}>
              <Button
                variant="primary"
                size="small"
                onClick={handleCreateFolder}
              >
                Create
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCancelAddFolder}
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
            />
            <div className={styles.newFolderActions}>
              <Button variant="primary" size="small" onClick={handleRename}>
                Rename
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCancelRename}
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
              <Button variant="primary" size="small" onClick={handleCreateItem}>
                Create
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCancelCreateItem}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {(nodeLoading || workspaceLoading) && !rootNodes.length ? (
          <div className={styles.loadingState}>
            <p>Loading folders...</p>
          </div>
        ) : filteredNodes.length > 0 ? (
          filteredNodes.map(node => (
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
              handleDuplicateNode={handleDuplicateNode}
              handleCreateNewItem={handleCreateNewItem}
              handleEditHeaders={handleEditHeaders}
              closeAllMenus={menuUpdateTrigger}
            />
          ))
        ) : (
          <div className={styles.emptyState}>
            <p>
              {activeWorkspace ? 'No folders found' : 'No workspace selected'}
            </p>
            {activeWorkspace && (
              <Button variant="primary" onClick={handleAddFolder}>
                Create Folder
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={modalOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalOpen(false)}
      />

      {/* Header Editor Modal */}
      {isHeaderEditorOpen && currentFolder && (
        <div
          className={styles.modalOverlay}
          onClick={e => {
            // Close when clicking on the overlay background, not on the modal itself
            if (e.target === e.currentTarget) {
              setIsHeaderEditorOpen(false);
              setCurrentFolder(null);
            }
          }}
        >
          <HeaderEditor
            folder={currentFolder}
            onClose={() => {
              setIsHeaderEditorOpen(false);
              setCurrentFolder(null);
            }}
            onSave={handleSaveHeaders}
          />
        </div>
      )}
    </div>
  );
}
