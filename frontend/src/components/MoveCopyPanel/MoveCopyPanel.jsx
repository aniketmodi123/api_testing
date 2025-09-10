import { useEffect, useState } from 'react';
import { workspaceService } from '../../services/workspaceService';
import { useWorkspace } from '../../store/workspace';
import styles from './MoveCopyPanel.module.css';

// MoveCopyPanel: modal to move/copy nodes between workspaces/folders
export default function MoveCopyPanel({
  isOpen,
  onClose,
  node,
  onMoveCopyComplete,
  fileTree,
}) {
  const { workspaces, activeWorkspace } = useWorkspace();
  const [operation, setOperation] = useState('copy');
  const [selectedWorkspace, setSelectedWorkspace] = useState(
    activeWorkspace || null
  );
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [customName, setCustomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState([]);
  const [localFileTree, setLocalFileTree] = useState(fileTree || []);

  useEffect(() => setLocalFileTree(fileTree || []), [fileTree]);

  useEffect(() => {
    if (isOpen && node) {
      setSelectedWorkspace(activeWorkspace);
      setCustomName(operation === 'copy' ? `${node.name} (Copy)` : node.name);
      if (activeWorkspace?.id) loadWorkspaceTree(activeWorkspace.id);
    }
  }, [isOpen, node, activeWorkspace, operation]);

  useEffect(() => {
    if (localFileTree && localFileTree.length > 0) {
      const rootFolderIds = localFileTree
        .filter(f => f.type === 'folder')
        .map(f => f.id);
      setExpandedFolders(rootFolderIds);
    }
  }, [localFileTree]);

  const loadWorkspaceTree = async workspaceId => {
    if (!workspaceId) return;
    try {
      const response = await workspaceService.getWorkspaceTree(workspaceId);

      // Normalize different response shapes and wrap into a synthetic workspace root
      if (response?.data) {
        const ws = response.data;
        // Use only the workspace's file_tree as the top-level nodes (folders)
        const tree = Array.isArray(ws.file_tree) ? ws.file_tree : [];
        setLocalFileTree(tree);
      } else if (response?.file_tree) {
        // fallback: response itself contains file_tree
        setLocalFileTree(
          Array.isArray(response.file_tree) ? response.file_tree : []
        );
      } else {
        setLocalFileTree([]);
      }
    } catch (err) {
      console.error('MoveCopyPanel: failed to load workspace tree', err);
    }
  };

  const generateUniqueName = (baseName, existingNames) => {
    if (!existingNames.includes(baseName)) return baseName;
    let counter = 1;
    let newName = `${baseName} (${counter})`;
    while (existingNames.includes(newName)) {
      counter++;
      newName = `${baseName} (${counter})`;
    }
    return newName;
  };

  const findFolderById = (folders, id) => {
    if (!folders) return null;
    for (const folder of folders) {
      if (folder.id === id) return folder;
      if (folder.children && folder.children.length > 0) {
        const found = findFolderById(folder.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const handleWorkspaceChange = async workspace => {
    setSelectedWorkspace(workspace);
    if (workspace?.id) await loadWorkspaceTree(workspace.id);
    else setLocalFileTree([]);
    setSelectedFolder(null);
  };

  const handleFolderSelect = folder => setSelectedFolder(folder);
  const toggleFolder = id =>
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleConfirm = async () => {
    if (!selectedWorkspace || !node) return;
    setIsLoading(true);
    try {
      const targetFolderId = selectedFolder?.id || null;
      const finalName = customName.trim() || node.name;

      let existingItems = [];
      if (targetFolderId) {
        const folder = findFolderById(localFileTree, targetFolderId);
        existingItems =
          folder && folder.children
            ? folder.children.map(item => item.name)
            : [];
      } else {
        existingItems = (localFileTree || []).map(item => item.name);
      }

      const uniqueName = generateUniqueName(finalName, existingItems);
      let result;
      if (operation === 'copy')
        result = await workspaceService.copyNode(
          node.id,
          selectedWorkspace.id,
          targetFolderId,
          uniqueName
        );
      else
        result = await workspaceService.moveNode(
          node.id,
          selectedWorkspace.id,
          targetFolderId,
          uniqueName
        );

      if (result?.success) {
        onMoveCopyComplete?.();
        onClose();
      } else {
        throw new Error(result?.message || `${operation} failed`);
      }
    } catch (err) {
      console.error(`Error ${operation}ing node:`, err);
      alert(`Failed to ${operation} ${node?.type || 'item'}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderFolderTree = (folders = [], level = 0) => {
    if (!folders || folders.length === 0) return null;

    return folders
      .filter(node => node && node.type === 'folder')
      .map(folder => {
        const children = Array.isArray(folder.children) ? folder.children : [];
        const hasSubfolders = children.some(c => c && c.type === 'folder');

        return (
          <div
            key={folder.id}
            className={styles.folderItem}
            style={{ marginLeft: `${level * 16}px` }}
          >
            <div
              className={`${styles.folderHeader} ${
                selectedFolder?.id === folder.id ? styles.selected : ''
              }`}
              onClick={() => handleFolderSelect(folder)}
            >
              <span
                className={styles.expandIcon}
                onClick={e => {
                  e.stopPropagation();
                  if (hasSubfolders) toggleFolder(folder.id);
                }}
              >
                {hasSubfolders
                  ? expandedFolders.includes(folder.id)
                    ? '▼'
                    : '▶'
                  : '•'}
              </span>

              <span className={styles.folderName}>{folder.name}</span>
            </div>

            {hasSubfolders && expandedFolders.includes(folder.id) && (
              <div className={styles.subFolders}>
                {renderFolderTree(children, level + 1)}
              </div>
            )}
          </div>
        );
      });
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3>
            {operation === 'copy' ? 'Copy' : 'Move'}{' '}
            {node?.type === 'folder' ? 'Folder' : 'API'}
          </h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.operationToggle}>
            <label>
              <input
                type="radio"
                value="copy"
                checked={operation === 'copy'}
                onChange={e => setOperation(e.target.value)}
              />{' '}
              Copy
            </label>
            <label>
              <input
                type="radio"
                value="move"
                checked={operation === 'move'}
                onChange={e => setOperation(e.target.value)}
              />{' '}
              Move
            </label>
          </div>

          <div className={styles.section}>
            <label>Target Workspace:</label>
            <select
              value={selectedWorkspace?.id || ''}
              onChange={e => {
                const ws = workspaces.find(
                  w => w.id === parseInt(e.target.value)
                );
                handleWorkspaceChange(ws);
              }}
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.section}>
            <label>Target Folder (optional):</label>
            <div className={styles.folderTree}>
              {renderFolderTree(localFileTree)}
              {(!localFileTree ||
                localFileTree.filter(item => item.type === 'folder').length ===
                  0) && (
                <div style={{ color: '#888', marginLeft: 20 }}>
                  No folders found. Create a folder in your workspace first.
                </div>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <label>Custom Name (optional):</label>
            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder={node?.name || ''}
            />
          </div>

          <div className={styles.footer}>
            <button
              className={styles.confirmButton}
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading
                ? 'Processing...'
                : operation === 'copy'
                  ? 'Copy'
                  : 'Move'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
