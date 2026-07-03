import { useEffect, useRef, useState } from 'react';
import MethodBadge from '../MethodBadge/MethodBadge';
import styles from './TabBar.module.css';

const STORAGE_KEY = 'apipilot_open_tabs';
const ACTIVE_TAB_KEY = 'apipilot_active_tab';
const MAX_NAME_LEN = 24;

export const isScratchTab = id => typeof id === 'string' && id.startsWith('scratch-');

function newScratchId() {
  return `scratch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadTabs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Scratch tabs are ephemeral — drop them on reload
    return raw ? JSON.parse(raw).filter(t => !isScratchTab(t.fileId)) : [];
  } catch {
    return [];
  }
}

function saveTabs(tabs) {
  try {
    // Never persist scratch tabs
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.filter(t => !isScratchTab(t.fileId))));
  } catch {}
}

function loadActiveTabId() {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY) || null;
  } catch {
    return null;
  }
}

function saveActiveTabId(id) {
  try {
    if (id && !isScratchTab(id)) {
      localStorage.setItem(ACTIVE_TAB_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_TAB_KEY);
    }
  } catch {}
}

export function useTabBar(nodeTree) {
  const [tabs, setTabs] = useState(loadTabs);
  const [activeTabId, setActiveTabId] = useState(loadActiveTabId);

  // Validate stored tabs against current node tree (scratch tabs always pass)
  useEffect(() => {
    if (!nodeTree || !Array.isArray(nodeTree)) return;
    // Normalize ids to string — localStorage round-trips can flip number<->string,
    // and the panel resolves the active tab with a loose compare too.
    const allFileIds = new Set(nodeTree.flatMap(n => gatherFileIds(n)).map(String));
    setTabs(prev => {
      const valid = prev.filter(t => isScratchTab(t.fileId) || allFileIds.has(String(t.fileId)));
      if (valid.length !== prev.length) saveTabs(valid);
      return valid;
    });
  }, [nodeTree]);

  const activateTab = id => {
    setActiveTabId(id);
    saveActiveTabId(id);
  };

  const openTab = node => {
    if (!node || node.type !== 'file') return;
    setTabs(prev => {
      if (prev.find(t => t.fileId === node.id)) {
        activateTab(node.id);
        return prev;
      }
      const next = [
        ...prev,
        { fileId: node.id, name: node.name, method: node.method || 'GET' },
      ];
      saveTabs(next);
      activateTab(node.id);
      return next;
    });
    activateTab(node.id);
  };

  const openScratchTab = () => {
    const id = newScratchId();
    setTabs(prev => {
      const next = [...prev, { fileId: id, name: 'New Request', method: 'GET', scratch: true }];
      saveTabs(next);
      activateTab(id);
      return next;
    });
    activateTab(id);
    return id;
  };

  const closeTab = fileId => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.fileId === fileId);
      const next = prev.filter(t => t.fileId !== fileId);
      saveTabs(next);
      if (activeTabId === fileId) {
        const nextActive = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
        activateTab(nextActive?.fileId ?? null);
      }
      return next;
    });
  };

  const updateTabMethod = (fileId, method) => {
    setTabs(prev => {
      const next = prev.map(t => t.fileId === fileId ? { ...t, method } : t);
      saveTabs(next);
      return next;
    });
  };

  const updateTabName = (fileId, name) => {
    setTabs(prev => {
      const next = prev.map(t => t.fileId === fileId ? { ...t, name } : t);
      saveTabs(next);
      return next;
    });
  };

  const reorderTab = (fromId, toId) => {
    if (fromId === toId) return;
    setTabs(prev => {
      const from = prev.findIndex(t => t.fileId === fromId);
      const to = prev.findIndex(t => t.fileId === toId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      saveTabs(next);
      return next;
    });
  };

  return { tabs, activeTabId, openTab, openScratchTab, closeTab, setActiveTabId: activateTab, updateTabMethod, updateTabName, reorderTab };
}

function gatherFileIds(node) {
  if (!node) return [];
  if (node.type === 'file') return [node.id];
  return node.children?.flatMap(gatherFileIds) ?? [];
}

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab, onReorder }) {
  const scrollRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Translate vertical wheel into horizontal scroll so tabs slide with a normal mouse wheel.
  const handleWheel = e => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
  };

  const handleDragStart = (e, fileId) => {
    setDraggingId(fileId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, fileId) => {
    if (draggingId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (fileId !== dragOverId) setDragOverId(fileId);
  };

  const handleDrop = (e, fileId) => {
    e.preventDefault();
    if (draggingId != null && draggingId !== fileId) onReorder?.(draggingId, fileId);
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  // Middle mouse button closes the tab.
  const handleAuxClick = (e, fileId) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose(fileId);
    }
  };

  return (
    <div className={styles.tabBarWrapper}>
      <div className={styles.tabBar} ref={scrollRef} onWheel={handleWheel}>
        {tabs.map(tab => {
          const isActive = tab.fileId === activeTabId;
          const name = tab.name?.length > MAX_NAME_LEN
            ? tab.name.slice(0, MAX_NAME_LEN) + '…'
            : tab.name;
          return (
            <div
              key={tab.fileId}
              className={`${styles.tab} ${isActive ? styles.active : ''} ${tab.scratch ? styles.scratchTab : ''} ${draggingId === tab.fileId ? styles.dragging : ''} ${dragOverId === tab.fileId && draggingId !== tab.fileId ? styles.dragOver : ''}`}
              draggable
              onDragStart={e => handleDragStart(e, tab.fileId)}
              onDragOver={e => handleDragOver(e, tab.fileId)}
              onDrop={e => handleDrop(e, tab.fileId)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelect(tab.fileId)}
              onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}
              onAuxClick={e => handleAuxClick(e, tab.fileId)}
              title={tab.scratch ? 'Unsaved scratch request' : tab.name}
            >
              <MethodBadge method={tab.method || 'GET'} size="sm" />
              <span className={styles.tabName}>{name}</span>
              <button
                className={styles.closeBtn}
                onClick={e => {
                  e.stopPropagation();
                  onClose(tab.fileId);
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          );
        })}
        {onNewTab && (
          <button className={styles.newTabBtn} onClick={onNewTab} title="New request">
            +
          </button>
        )}
      </div>
    </div>
  );
}
