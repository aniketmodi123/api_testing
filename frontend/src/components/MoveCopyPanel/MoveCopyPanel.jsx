import { useEffect, useRef, useState } from 'react';
import { workspaceService } from '../../services/workspaceService';
import { useWorkspace } from '../../store/workspace';
import styles from './MoveCopyPanel.module.css';

/** ---- helpers ---- **/

// Treat anything "folder-like" as a folder, case-insensitive
const isFolderType = node =>
  node &&
  ((typeof node.type === 'string' && node.type.toLowerCase() === 'folder') ||
    Array.isArray(node.children) ||
    Array.isArray(node.items));

// Normalize any incoming shape (raw backend `file_tree` or transformed `collections`) to folders-only
const normalizeToFolders = nodes => {
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const n of nodes) {
    if (!n) continue;

    // Case 1: raw backend folder with `children`
    if (isFolderType(n) && Array.isArray(n.children)) {
      out.push({
        id: n.id,
        name: n.name,
        type: 'folder',
        children: normalizeToFolders(n.children),
      });
      continue;
    }

    // Case 2: transformed collection with `items`
    if (Array.isArray(n.items)) {
      out.push({
        id: n.id,
        name: n.name,
        type: 'folder',
        children: normalizeToFolders(n.items),
      });
      continue;
    }

    // Case 3: plain folder without children/items (leaf folder)
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

// Extract any usable tree array from a service response
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
  fileTree, // optional prop from parent
}) {
  const { workspaces, activeWorkspace } = useWorkspace();

  const [operation, setOperation] = useState('copy');
  const [selectedWorkspace, setSelectedWorkspace] = useState(
    activeWorkspace || null
  );

  // folders-only, normalized, and the only source of truth for the tree
  const [localFolders, setLocalFolders] = useState([]);

  const [selectedFolder, setSelectedFolder] = useState(null);
  const [customName, setCustomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState([]);

  // prevent setState on stale fetches
  const requestSeq = useRef(0);

  /** Load workspace tree (raw) and normalize to folders-only */
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

  /** When the panel opens, decide the data source:
   *  - If parent provided a usable fileTree with folders -> use it.
   *  - Else fetch from the service.
   */
  useEffect(() => {
    if (!isOpen) return;

    setSelectedWorkspace(activeWorkspace || null);
    setCustomName(
      node ? (operation === 'copy' ? `${node.name} (Copy)` : node.name) : ''
    );

    const propHasFolders =
      Array.isArray(fileTree) && normalizeToFolders(fileTree).length > 0;

    if (propHasFolders) {
      setLocalFolders(normalizeToFolders(fileTree));
    } else if (activeWorkspace?.id) {
      loadWorkspaceTree(activeWorkspace.id);
    } else {
      setLocalFolders([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, node, operation, activeWorkspace?.id]);

  /** Expand all top-level folders when localFolders changes */
  useEffect(() => {
    if (Array.isArray(localFolders) && localFolders.length > 0) {
      setExpandedFolders(localFolders.map(f => f.id));
    } else {
      setExpandedFolders([]);
    }
  }, [localFolders]);

  /** Switching workspace -> fetch that workspace’s tree */
  const handleWorkspaceChange = async workspace => {
    setSelectedWorkspace(workspace || null);
    setSelectedFolder(null);
    if (workspace?.id) {
      await loadWorkspaceTree(workspace.id);
    } else {
      setLocalFolders([]);
    }
  };

  /** UI handlers */
  const handleFolderSelect = folder => setSelectedFolder(folder);
  const toggleFolder = id =>
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  /** Utility to find a folder by id inside our normalized tree */
  const findFolderById = (folders, id) => {
    for (const folder of folders || []) {
      if (!folder) continue;
      if (folder.id === id) return folder;
      const found = findFolderById(folder.children, id);
      if (found) return found;
    }
    return null;
  };

  /** Generate unique name among siblings */
  const generateUniqueName = (baseName, existingNames) => {
    if (!existingNames.includes(baseName)) return baseName;
    let counter = 1;
    let next = `${baseName} (${counter})`;
    while (existingNames.includes(next)) {
      counter += 1;
      next = `${baseName} (${counter})`;
    }
    return next;
  };

  /** Confirm move/copy */
  const handleConfirm = async () => {
    if (!selectedWorkspace || !node) return;
    setIsLoading(true);
    try {
      const targetFolderId = selectedFolder?.id || null;
      const finalName = (customName || node.name || '').trim();

      // siblings at target
      let existing = [];
      if (targetFolderId) {
        const folder = findFolderById(localFolders, targetFolderId);
        existing = (folder?.children || []).map(c => c?.name).filter(Boolean);
      } else {
        existing = (localFolders || []).map(c => c?.name).filter(Boolean);
      }

      const uniqueName = generateUniqueName(finalName, existing);

      let result;
      if (operation === 'copy') {
        result = await workspaceService.copyNode(
          node.id,
          selectedWorkspace.id,
          targetFolderId,
          uniqueName
        );
      } else {
        result = await workspaceService.moveNode(
          node.id,
          selectedWorkspace.id,
          targetFolderId,
          uniqueName
        );
      }

      if (
        result?.success === true ||
        result?.response_code === 200 ||
        (result?.data && !result?.error)
      ) {
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

  /** Render folders-only tree */
  const renderFolderTree = (folders = [], level = 0) => {
    if (!Array.isArray(folders) || folders.length === 0) return null;

    return folders.map(folder => {
      if (!folder) return null;
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
            onClick={() => handleFolderSelect(folder)}
          >
            <span
              className={styles.expandIcon}
              onClick={e => {
                e.stopPropagation();
                if (hasSubfolders) toggleFolder(folder.id);
              }}
              title={hasSubfolders ? 'Expand/Collapse' : 'No subfolders'}
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
            <label>Target Folder (optional):</label>
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
            <label>Custom Name (optional):</label>
            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder={node?.name || ''}
            />
          </div>

          <div className={styles.section}>
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
