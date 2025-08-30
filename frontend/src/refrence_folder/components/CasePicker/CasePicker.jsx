import { useState, useMemo } from "react";
import { useRunner } from "../../context/RunnerContext";
import styles from "./CasePicker.module.css";

export default function CasePicker() {
  const {
    singleSelectedFileNode,
    casesForSingleFile,
    selectedApis,
    casesForSelectedApi,
    runCases,
  } = useRunner();

  const [sel, setSel] = useState([]);

  const onChange = (e) => {
    const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSel(vals);
  };

  // Source of cases:
  // - If exactly one API is selected -> union of cases for that API
  // - Else if exactly one file selected -> that file's cases
  // - Else -> none
  const caseOptions = useMemo(() => {
    if (selectedApis.length === 1) return casesForSelectedApi;
    if (singleSelectedFileNode) return casesForSingleFile;
    return [];
  }, [selectedApis, casesForSelectedApi, singleSelectedFileNode, casesForSingleFile]);

  const canPickCases = caseOptions.length > 0;

  return (
    <div className={styles.panel}>
      <h3 className={styles.h3}>Case Picker (select exactly one file in tree)</h3>
      <div className={styles.toolbar}>
        <select
          multiple
          size={8}
          style={{ minWidth: 320 }}
          className={styles.select}
          value={sel}
          onChange={onChange}
          disabled={!canPickCases}
        >
          {caseOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <div className={styles.chips}>
          {sel.map((s) => (
            <span key={s} className={styles.chip}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => runCases(sel)} disabled={!canPickCases}>
        Run Selected Case(s)
      </button>
    </div>
  );
}
