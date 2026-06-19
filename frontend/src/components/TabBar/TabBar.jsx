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
    const allFileIds = new Set(nodeTree.flatMap(n => gatherFileIds(n)));
    setTabs(prev => {
      const valid = prev.filter(t => isScratchTab(t.fileId) || allFileIds.has(t.fileId));
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

  return { tabs, activeTabId, openTab, openScratchTab, closeTab, setActiveTabId: activateTab, updateTabMethod, updateTabName };
}

function gatherFileIds(node) {
  if (!node) return [];
  if (node.type === 'file') return [node.id];
  return node.children?.flatMap(gatherFileIds) ?? [];
}

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onNewTab }) {
  const scrollRef = useRef(null);

  return (
    <div className={styles.tabBarWrapper}>
      <div className={styles.tabBar} ref={scrollRef}>
        {tabs.map(tab => {
          const isActive = tab.fileId === activeTabId;
          const name = tab.name?.length > MAX_NAME_LEN
            ? tab.name.slice(0, MAX_NAME_LEN) + '…'
            : tab.name;
          return (
            <div
              key={tab.fileId}
              className={`${styles.tab} ${isActive ? styles.active : ''} ${tab.scratch ? styles.scratchTab : ''}`}
              onClick={() => onSelect(tab.fileId)}
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
