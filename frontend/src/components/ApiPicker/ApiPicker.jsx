import { useRunner } from "../../context/RunnerContext";
import styles from "./ApiPicker.module.css";

export default function ApiPicker() {
  const { apis, runApis, selectedApis, setSelectedApis } = useRunner();

  const onChange = (e) => {
    const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedApis(vals);
  };

  return (
    <div className={styles.panel}>
      <h3 className={styles.h3}>API Picker</h3>
      <div className={styles.toolbar}>
        <select
          multiple
          size={8}
          style={{ minWidth: 320 }}
          className={styles.select}
          value={selectedApis}
          onChange={onChange}
        >
          {apis.map((sig) => (
            <option key={sig} value={sig}>
              {sig}
            </option>
          ))}
        </select>
        <div className={styles.chips}>
          {selectedApis.map((s) => (
            <span key={s} className={styles.chip}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => runApis(selectedApis)}>
        Run Selected API(s)
      </button>
    </div>
  );
}
