import { useEffect, useMemo, useState, useCallback } from "react";
import { useRunner } from "../../context/RunnerContext";
import Tree from "../Tree/Tree";
import {
  fsCreateFolder,
  fsDeleteFolder,
  fsCreateFile,
  fsReadFile,
  fsSaveFile,
  fsDeleteFile,
} from "../../api/fs";
import JsonFloatEditor from "../JsonFloatEditor/JsonFloatEditor";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  const {
    apiBase,
    saveApiBase,
    cfg,
    loadConfig,
    loadTree,
    runProject,
    runSelected,

    tree,
    selectedFolders, // [ ["cis","tariff"], ... ]
    selectedFiles,   // [ "cis/tariff/get_tariff.json", ... ]
  } = useRunner();

  // --- base box ---
  const [draft, setDraft] = useState(apiBase);
  useEffect(() => setDraft(apiBase), [apiBase]);

  const cfgText = useMemo(() => {
    if (!cfg) return "";
    if (cfg.error) return `Error: ${cfg.error}`;
    try { return JSON.stringify(cfg, null, 2); } catch { return String(cfg); }
  }, [cfg]);

  const doSave = () => saveApiBase(draft);

  // --- force remount Tree after reloads to guarantee refresh ---
  const [reloadKey, setReloadKey] = useState(0);
  const refreshTree = useCallback(async () => {
    await loadTree();
    setReloadKey((k) => k + 1);
  }, [loadTree]);

  // ---------- selection helpers ----------
  const singleFolderPath = useMemo(() => {
    if (!selectedFolders || selectedFolders.length !== 1) return "";
    return (selectedFolders[0] || []).join("/");
  }, [selectedFolders]);

  const singleFilePath = useMemo(() => {
    if (!selectedFiles || selectedFiles.length !== 1) return "";
    return selectedFiles[0];
  }, [selectedFiles]);

  // ---------- toast ----------
  const [toast, setToast] = useState("");
  const showToast = (msg) => {
    setToast(String(msg || ""));
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(""), 2500);
  };

  // ---------- name modal for folder creation ----------
  const [nameOpen, setNameOpen] = useState(false);
  const [namePath, setNamePath] = useState(""); // where to create folder
  const [nameValue, setNameValue] = useState("");

  const openNameModal = (folderPath) => {
    setNamePath(folderPath || "");
    setNameValue("");
    setNameOpen(true);
  };
  const closeNameModal = () => setNameOpen(false);
  const validName = (v) => /^[A-Za-z0-9._-]+$/.test(v || "");
  const saveFolderName = async () => {
    if (!validName(nameValue)) {
      showToast("Use letters, numbers, dot, underscore, or dash.");
      return;
    }
    const full = namePath ? `${namePath}/${nameValue}` : nameValue;
    try {
      await fsCreateFolder(apiBase, full);
      await refreshTree();
      setNameOpen(false);
      showToast(`Created folder: ${full}`);
    } catch (e) {
      showToast(e);
    }
  };

  // ---------- floating JSON editor ----------
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create"); // "create" | "edit"
  const [editorFolder, setEditorFolder] = useState("");   // for create
  const [editorFile, setEditorFile] = useState("");       // for edit
  const [editorInitial, setEditorInitial] = useState("");

  // allow JSON anywhere (root or any folder)
  function addJsonAt(folderPath) {
    setEditorMode("create");
    setEditorFolder(folderPath || "");
    setEditorInitial("{\n  \"meta\": {},\n  \"cases\": []\n}\n");
    setEditorOpen(true);
  }

  async function editSelectedJson() {
    if (!singleFilePath) {
      showToast("Select exactly one JSON file.");
      return;
    }
    try {
      const { content } = await fsReadFile(apiBase, singleFilePath);
      setEditorMode("edit");
      setEditorFile(singleFilePath);
      setEditorInitial(content || "{\n  \"meta\": {},\n  \"cases\": []\n}\n");
      setEditorOpen(true);
    } catch (e) {
      showToast(e);
    }
  }

  async function deleteSelectedFolder() {
    if (!singleFolderPath) {
      showToast("Select exactly one folder.");
      return;
    }
    if (!window.confirm(`Delete folder recursively?\n${singleFolderPath}`)) return;
    try {
      await fsDeleteFolder(apiBase, singleFolderPath, true);
      await refreshTree();
      showToast(`Deleted: ${singleFolderPath}`);
    } catch (e) {
      showToast(e);
    }
  }

  async function deleteSelectedFile() {
    if (!singleFilePath) {
      showToast("Select exactly one file.");
      return;
    }
    if (!window.confirm(`Delete file?\n${singleFilePath}`)) return;
    try {
      await fsDeleteFile(apiBase, singleFilePath);
      await refreshTree();
      showToast(`Deleted: ${singleFilePath}`);
    } catch (e) {
      showToast(e);
    }
  }

  async function handleEditorSave(fullPath, content) {
    try {
      if (!content || !content.trim()) {
        showToast("JSON cannot be empty.");
        return;
      }
      if (editorMode === "create") {
        await fsCreateFile(apiBase, fullPath, content, true); // strict JSON
      } else {
        await fsSaveFile(apiBase, fullPath, content, true);   // strict JSON
      }
      await refreshTree();
      showToast("Saved.");
    } catch (e) {
      showToast(e);
    }
  }

  return (
    <div>
      <h1 className={styles.h1}>Services</h1>

      {/* base + controls */}
      <div className={styles.panel} style={{ marginBottom: 10 }}>
        <div className={styles.inline + " " + styles.w100}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                doSave();
              }
            }}
            placeholder="Backend base (e.g. http://192.168.1.8:8000)"
            className={styles.w100}
            autoComplete="off"
            spellCheck={false}
          />
        <button type="button" onClick={doSave}>Save</button>
        </div>
        <div className={`${styles.small} ${styles.muted}`} style={{ marginTop: 6 }}>
          {apiBase
            ? `Using backend: ${apiBase}`
            : "Backend not set. Set to your FastAPI server (e.g. http://192.168.1.8:8000)."}
        </div>
        <div className={styles.toolbar} style={{ marginTop: 8 }}>
          <button type="button" onClick={refreshTree}>Load Tree</button>
          <button type="button" onClick={loadConfig}>Load Config</button>
        </div>
        {cfg && <pre className={styles.json} style={{ marginTop: 6 }}>{cfgText}</pre>}
      </div>

      {/* file system actions */}
      <div className={styles.panel} style={{ marginBottom: 10 }}>
        <div className={styles.small} style={{ marginBottom: 6 }}>
          <b>File actions</b>
        </div>

        {/* Root actions */}
        <div className={styles.toolbar}>
          <button type="button" onClick={() => openNameModal("")}>
            + Folder (root)
          </button>
          {/* JSON allowed at root now */}
          <button type="button" onClick={() => addJsonAt("")}>
            + JSON (root)
          </button>
        </div>

        {/* Contextual (single folder selected) */}
        <div className={styles.small} style={{ marginTop: 4, marginBottom: 4 }}>
          Selected folder: {singleFolderPath ? <code>{singleFolderPath}</code> : "(select exactly one)"}
        </div>
        <div className={styles.toolbar}>
          <button
            type="button"
            disabled={!singleFolderPath}
            onClick={() => openNameModal(singleFolderPath)}
          >
            + Folder in selected
          </button>

          {/* JSON allowed at any folder level */}
          <button
            type="button"
            disabled={!singleFolderPath}
            onClick={() => addJsonAt(singleFolderPath)}
          >
            + JSON in selected
          </button>

          <button
            type="button"
            disabled={!singleFolderPath}
            onClick={deleteSelectedFolder}
          >
            Delete selected folder
          </button>
        </div>

        {/* Contextual (single file selected) */}
        <div className={styles.small} style={{ marginTop: 8, marginBottom: 4 }}>
          Selected file: {singleFilePath ? <code>{singleFilePath}</code> : "(select exactly one)"}
        </div>
        <div className={styles.toolbar}>
          <button type="button" disabled={!singleFilePath} onClick={editSelectedJson}>
            Edit selected JSON
          </button>
          <button type="button" disabled={!singleFilePath} onClick={deleteSelectedFile}>
            Delete selected JSON
          </button>
        </div>
      </div>

      {/* tree (scrollable) */}
      <div className={styles.treeScroll} key={reloadKey}>
        <Tree />
      </div>

      {/* run buttons */}
      <div className={styles.toolbar}>
        <button type="button" onClick={runProject}>Run Project</button>
        <button type="button" onClick={runSelected}>Run Selected</button>
      </div>

      {/* tips */}
      <div className={`${styles.panel} ${styles.small}`}>
        <div><b>Tips</b></div>
        <div>✓ Click a card title or its Request/Response to open a full-screen reader (left: Request, right: Response)</div>
        <div>✓ Hold <b>SHIFT</b> while clicking to expand inline instead</div>
      </div>

      {/* floating JSON editor */}
      <JsonFloatEditor
        open={editorOpen}
        mode={editorMode}
        folderPath={editorFolder}
        filePath={editorFile}
        initial={editorInitial}
        onSave={handleEditorSave}
        onClose={() => setEditorOpen(false)}
      />

      {/* simple toast */}
      {toast && (
        <div style={{
          marginTop: 8, background: "#1b2335", color: "#cbd5e1",
          border: "1px solid #32405c", borderRadius: 8, padding: "8px 12px"
        }}>
          {toast}
        </div>
      )}

      {/* name modal for folder creation */}
      {nameOpen && (
        <div style={overlayStyle} onClick={closeNameModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
              <div style={{fontWeight:600}}>Create folder</div>
              <button onClick={closeNameModal} style={iconBtnStyle}>✖</button>
            </div>
            <div className={styles.small} style={{marginBottom:6}}>
              Parent: {namePath ? <code>{namePath}</code> : <em>(root)</em>}
            </div>
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="e.g., tariff"
              style={inputStyle}
            />
            <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:10}}>
              <button onClick={closeNameModal} style={btnSecondary}>Cancel</button>
              <button onClick={saveFolderName} style={btnPrimary} disabled={!validName(nameValue)}>
                Create
              </button>
            </div>
            {!validName(nameValue) && nameValue && (
              <div className={styles.small} style={{color:"#ff6b6b", marginTop:6}}>
                Allowed: letters, numbers, dot, underscore, dash.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* inline styles for the tiny folder-name modal */
const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
};
const modalStyle = {
  width: "min(420px, 92vw)", background: "#0e1320", color: "#fff",
  borderRadius: 14, boxShadow: "0 10px 40px rgba(0,0,0,.5)", padding: 16,
};
const iconBtnStyle = { border: "none", background: "transparent", color: "#aaa", fontSize: 18, cursor: "pointer" };
const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #243",
  background: "#0a0f1a", color: "#fff"
};
const btnSecondary = { padding: "8px 12px", borderRadius: 10, background: "#1b2335", color: "#cbd5e1", border: "1px solid #32405c", cursor: "pointer" };
const btnPrimary   = { padding: "8px 12px", borderRadius: 10, background: "#2563eb", color: "#fff", border: "none", cursor: "pointer" };
