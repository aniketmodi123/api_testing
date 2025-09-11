import { useEffect, useRef, useState } from 'react';
import { workspaceService } from '../../services/workspaceService';
import { useNode } from '../../store/node';
import { useWorkspace } from '../../store/workspace';
import styles from './MoveCopyPanel.module.css';

/** ---- helpers ---- **/

const isFolderType = node =>
  node &&
  ((typeof node.type === 'string' && node.type.toLowerCase() === 'folder') ||
    Array.isArray(node.children) ||
    Array.isArray(node.items));

const normalizeToFolders = nodes => {
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const n of nodes) {
    if (!n) continue;

    if (isFolderType(n) && Array.isArray(n.children)) {
      out.push({
        id: n.id,
        name: n.name,
        type: 'folder',
        children: normalizeToFolders(n.children),
      });
      continue;
    }

    if (Array.isArray(n.items)) {
      out.push({
        id: n.id,
        name: n.name,
        type: 'folder',
        children: normalizeToFolders(n.items),
      });
      continue;
    }

    if (isFolderType(n)) {
      out.push({
        id: n.id,
        name: n.name,
        type: 'folder',
        children: [],
      });
    }
  }
  return out;
};

const extractTreeFromResponse = resp => {
  if (!resp) return [];
  if (Array.isArray(resp?.data?.file_tree)) return resp.data.file_tree;
  if (Array.isArray(resp?.file_tree)) return resp.file_tree;
  if (Array.isArray(resp?.data?.collections)) return resp.data.collections;
  if (Array.isArray(resp?.collections)) return resp.collections;
  return [];
};

/** ---- component ---- **/

export default function MoveCopyPanel({
  isOpen,
  onClose,
  node,
  onMoveCopyComplete,
}) {
  const { workspaces, activeWorkspace } = useWorkspace();
  const { deleteNode } = useNode();

  const [operation, setOperation] = useState('copy');
  const [selectedWorkspace, setSelectedWorkspace] = useState(
    activeWorkspace || null
  );
  const [localFolders, setLocalFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [customName, setCustomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState([]);

  const requestSeq = useRef(0);

  const loadWorkspaceTree = async workspaceId => {
    if (!workspaceId) return;
    const mySeq = ++requestSeq.current;
    try {
      const response = await workspaceService.getWorkspaceTree(workspaceId);
      const raw = extractTreeFromResponse(response);
      const foldersOnly = normalizeToFolders(raw);
      if (requestSeq.current === mySeq) {
        setLocalFolders(foldersOnly);
      }
    } catch (err) {
      console.error('MoveCopyPanel: failed to load workspace tree', err);
      if (requestSeq.current === mySeq) {
        setLocalFolders([]);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    setSelectedWorkspace(activeWorkspace || null);
    setCustomName(
      node ? (operation === 'copy' ? `${node.name} (Copy)` : node.name) : ''
    );

    // Always fetch the latest folder tree from the workspace tree API
    const fetchFolders = async () => {
      if (activeWorkspace?.id) {
        try {
          const response = await workspaceService.getWorkspaceTree(
            activeWorkspace.id
          );
          // Only use nodes where type == 'folder'
          const raw = extractTreeFromResponse(response);
          const foldersOnly = normalizeToFolders(raw).filter(
            f => f.type === 'folder'
          );
          setLocalFolders(foldersOnly);
        } catch (err) {
          setLocalFolders([]);
        }
      } else {
        setLocalFolders([]);
      }
    };
    fetchFolders();
  }, [isOpen, node, operation, activeWorkspace?.id]);

  useEffect(() => {
    if (Array.isArray(localFolders) && localFolders.length > 0) {
      setExpandedFolders(localFolders.map(f => f.id));
    } else {
      setExpandedFolders([]);
    }
  }, [localFolders]);

  // highlight only the immediate parent folder
  useEffect(() => {
    if (!isOpen || !node?.parent_id) return;
    const directParent = findFolderById(localFolders, node.parent_id);
    if (directParent) {
      setSelectedFolder(directParent);
      if (!expandedFolders.includes(directParent.id)) {
        setExpandedFolders(prev => [...prev, directParent.id]);
      }
    }
  }, [isOpen, node, localFolders]);

  const handleWorkspaceChange = async workspace => {
    setSelectedWorkspace(workspace || null);
    setSelectedFolder(null);
    if (workspace?.id) {
      await loadWorkspaceTree(workspace.id);
    } else {
      setLocalFolders([]);
    }
  };

  const handleFolderSelect = folder => setSelectedFolder(folder);
  const toggleFolder = id =>
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const findFolderById = (folders, id) => {
    for (const folder of folders || []) {
      if (!folder) continue;
      if (folder.id === id) return folder;
      const found = findFolderById(folder.children, id);
      if (found) return found;
    }
    return null;
  };

  const generateUniqueName = (baseName, existingNames) => {
    if (!existingNames.includes(baseName)) return baseName;
    let counter = 1;
    let next = `${baseName} (Copy)`;
    while (existingNames.includes(next)) {
      counter += 1;
      next = `${baseName} (Copy ${counter})`;
    }
    return next;
  };

  const handleConfirm = async () => {
    if (!selectedWorkspace || !node) return;
    setIsLoading(true);
    try {
      const targetFolderId = selectedFolder?.id || null;
      const finalName = (customName || node.name || '').trim();

      let existing = [];
      if (targetFolderId) {
        const folder = findFolderById(localFolders, targetFolderId);
        existing = (folder?.children || []).map(c => c?.name).filter(Boolean);
      } else {
        existing = (localFolders || []).map(c => c?.name).filter(Boolean);
      }

      let result;
      let backendError = '';

      if (operation === 'copy') {
        const uniqueName = generateUniqueName(finalName, existing);
        result = await workspaceService.copyNode(
          node.id,
          selectedWorkspace.id,
          targetFolderId,
          uniqueName
        );
        backendError = result?.error_message || result?.message || '';
        if (
          result?.success ||
          result?.response_code === 200 ||
          result?.response_code === 201 ||
          (result?.data && !result?.error)
        ) {
          onMoveCopyComplete?.({ updatedWorkspaceTree: result?.data });
          onClose();
        } else {
          throw new Error(backendError || 'copy failed');
        }
      } else {
        // MOVE: use backend move API directly, response is full workspace tree
        result = await workspaceService.moveNode(
          node.id,
          selectedWorkspace.id,
          targetFolderId,
          finalName
        );
        backendError = result?.error_message || result?.message || '';
        if (
          result?.success ||
          result?.response_code === 200 ||
          result?.response_code === 201 ||
          (result?.data && !result?.error)
        ) {
          onMoveCopyComplete?.({ updatedWorkspaceTree: result?.data });
          onClose();
        } else {
          throw new Error(backendError || 'move failed');
        }
      }
    } catch (err) {
      console.error(`Error ${operation}ing node:`, err);
      alert(err.message || `Failed to ${operation} ${node?.type || 'item'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderFolderTree = (folders = [], level = 0) => {
    if (!Array.isArray(folders) || folders.length === 0) return null;

    // Only show nodes where type is 'folder'
    return folders
      .filter(
        folder =>
          folder &&
          (folder.type === 'folder' ||
            (folder.type && folder.type.toLowerCase() === 'folder'))
      )
      .map(folder => {
        const children = Array.isArray(folder.children) ? folder.children : [];
        const hasSubfolders = children.some(isFolderType);

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
              onClick={e => {
                e.stopPropagation();
                handleFolderSelect(folder);
              }}
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
                {renderFolderTree(children.filter(isFolderType), level + 1)}
              </div>
            )}
          </div>
        );
      });
  };

  if (!isOpen) return null;

  const isSameLocationMove =
    operation === 'move' &&
    (selectedFolder?.id || null) === (node?.parent_id || null);

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
                const id = parseInt(e.target.value, 10);
                const ws = workspaces.find(w => w.id === id);
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
            <label>Target Folder:</label>
            <div className={styles.folderTree}>
              {renderFolderTree(localFolders)}
              {(!Array.isArray(localFolders) || localFolders.length === 0) && (
                <div style={{ color: '#888', marginLeft: 20 }}>
                  No folders found. Create a folder in your workspace first.
                </div>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <label>
              {operation === 'copy' ? 'Custom Name (optional):' : 'Name:'}
            </label>
            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder={node?.name || ''}
              disabled={operation === 'move'}
            />
          </div>

          <div className={styles.section}>
            <button
              className={styles.confirmButton}
              onClick={handleConfirm}
              disabled={isLoading || isSameLocationMove}
              title={isSameLocationMove ? "Can't move to same location" : ''}
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
