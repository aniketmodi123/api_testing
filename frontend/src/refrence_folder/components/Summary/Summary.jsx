import { useRunner } from "../../context/RunnerContext";
import styles from "./Summary.module.css";

export default function Summary(){
  const { report } = useRunner();
  const s = report?.summary;
  if(!s) return null;
  return (
    <div className={styles.summary}>
      <div><b>Total:</b> {s.total}
        &nbsp;|&nbsp;<b>Passed:</b> <span className={styles.ok}>{s.passed}</span>
        &nbsp;|&nbsp;<b>Failed:</b> <span className={styles.bad}>{s.failed}</span>
        &nbsp;|&nbsp;<b>Pass rate:</b> {s.pass_rate}%</div>
    </div>
  );
}
