import { useEffect, useMemo, useState } from "react";
import { useRunner } from "../../context/RunnerContext";
import Tree from "../Tree/Tree";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  const {
    apiBase,
    setApiBase,
    saveApiBase,   // <- new explicit saver
    cfg,
    loadConfig,
    loadTree,
    runProject,
    runSelected,
  } = useRunner();

  // separate input draft so typing doesn’t fight with state
  const [draft, setDraft] = useState(apiBase);
  useEffect(() => setDraft(apiBase), [apiBase]);

  const cfgText = useMemo(() => {
    if (!cfg) return "";
    if (cfg.error) return `Error: ${cfg.error}`;
    try {
      return JSON.stringify(cfg, null, 2);
    } catch {
      return String(cfg);
    }
  }, [cfg]);

  const doSave = () => {
    saveApiBase(draft);
  };

  return (
    <div>
      <h1 className={styles.h1}>Services</h1>

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
            placeholder="Backend base (e.g. http://localhost:8765)"
            className={styles.w100}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={doSave}>
            Save
          </button>
        </div>
        <div className={`${styles.small} ${styles.muted}`} style={{ marginTop: 6 }}>
          {apiBase
            ? `Using backend: ${apiBase}`
            : "Backend not set. Set to your FastAPI server (e.g. http://localhost:8765)."}
        </div>
        <div className={styles.toolbar} style={{ marginTop: 8 }}>
          <button type="button" onClick={loadTree}>
            Load Tree
          </button>
          <button type="button" onClick={loadConfig}>
            Load Config
          </button>
        </div>
        {cfg && <pre className={styles.json} style={{ marginTop: 6 }}>{cfgText}</pre>}
      </div>

      <Tree />

      <div className={styles.toolbar}>
        <button type="button" onClick={runProject}>
          Run Project
        </button>
        <button type="button" onClick={runSelected}>
          Run Selected
        </button>
      </div>

      <div className={`${styles.panel} ${styles.small}`}>
        <div><b>Tips</b></div>
        <div>✓ Click a card title or its Request/Response to open a full-screen reader (left: Request, right: Response)</div>
        <div>✓ Hold <b>SHIFT</b> while clicking to expand inline instead</div>
      </div>
    </div>
  );
}
