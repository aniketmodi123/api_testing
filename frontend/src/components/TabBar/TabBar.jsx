import { useEffect, useRef, useState } from 'react';
import MethodBadge from '../MethodBadge/MethodBadge';
import styles from './TabBar.module.css';

const STORAGE_KEY = 'polaris_open_tabs';
const MAX_NAME_LEN = 24;

function loadTabs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTabs(tabs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // storage full — ignore
  }
}

export function useTabBar(nodeTree) {
  const [tabs, setTabs] = useState(loadTabs);
  const [activeTabId, setActiveTabId] = useState(null);

  // Validate stored tabs against current node tree
  useEffect(() => {
    if (!nodeTree || !Array.isArray(nodeTree)) return;
    const allFileIds = new Set(
      nodeTree.flatMap(w =>
        w.children?.flatMap(n => gatherFileIds(n)) ?? []
      )
    );
    setTabs(prev => {
      const valid = prev.filter(t => allFileIds.has(t.fileId));
      if (valid.length !== prev.length) saveTabs(valid);
      return valid;
    });
  }, [nodeTree]);

  const openTab = node => {
    if (!node || node.type !== 'file') return;
    setTabs(prev => {
      if (prev.find(t => t.fileId === node.id)) {
        setActiveTabId(node.id);
        return prev;
      }
      const next = [
        ...prev,
        { fileId: node.id, name: node.name, method: node.method || 'GET' },
      ];
      saveTabs(next);
      setActiveTabId(node.id);
      return next;
    });
    setActiveTabId(node.id);
  };

  const closeTab = fileId => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.fileId === fileId);
      const next = prev.filter(t => t.fileId !== fileId);
      saveTabs(next);
      if (activeTabId === fileId) {
        const nextActive = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
        setActiveTabId(nextActive?.fileId ?? null);
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

  return { tabs, activeTabId, openTab, closeTab, setActiveTabId, updateTabMethod };
}

function gatherFileIds(node) {
  if (!node) return [];
  if (node.type === 'file') return [node.id];
  return node.children?.flatMap(gatherFileIds) ?? [];
}

export default function TabBar({ tabs, activeTabId, onSelect, onClose }) {
  const scrollRef = useRef(null);

  return (
    <div className={styles.tabBar} ref={scrollRef}>
      {tabs.map(tab => {
        const isActive = tab.fileId === activeTabId;
        const name = tab.name?.length > MAX_NAME_LEN
          ? tab.name.slice(0, MAX_NAME_LEN) + '…'
          : tab.name;
        return (
          <div
            key={tab.fileId}
            className={`${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => onSelect(tab.fileId)}
            title={tab.name}
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
    </div>
  );
}
