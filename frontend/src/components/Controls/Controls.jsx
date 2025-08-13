import { useRunner } from "../../context/RunnerContext";
import styles from "./Controls.module.css";

export default function Controls(){
  const { scope, setScope, runScope } = useRunner();

  const help = {
    project: "Runs everything in the repository.",
    folder:  "Check one or more folders in the tree on the left.",
    file:    "Check one or more files in the tree on the left.",
    api:     "Pick one or more API signatures in API Picker.",
    case:    "Select exactly one file in the tree, then pick its cases."
  }[scope];

  return (
    <section>
      <h2 className={styles.h2}>Runner <span className={styles.muted}>(select scope, then Run)</span></h2>
      <div className={styles.controls}>
        <label>Scope:&nbsp;
          <select value={scope} onChange={(e)=>setScope(e.target.value)}>
            <option value="project">Project</option>
            <option value="folder">Folder(s)</option>
            <option value="file">File(s)</option>
            <option value="api">API (method+path)</option>
            <option value="case">Cases (from a single file)</option>
          </select>
        </label>
        <span className={`${styles.small} ${styles.muted}`}>{help}</span>
        <button type="button" className={styles.nowrap} onClick={runScope}>Run</button>
      </div>
    </section>
  );
}
