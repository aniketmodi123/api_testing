import { useRunner } from "../../context/RunnerContext";
import styles from "./FocusModal.module.css";

function pretty(obj){ try{return JSON.stringify(obj, null, 2);}catch{return String(obj);} }

export default function FocusModal(){
  const { focusItem, setFocusItem } = useRunner();
  if(!focusItem) return null;

  const ok = !!focusItem.ok;
  return (
    <>
      <div className={`${styles.backdrop} ${styles.open}`} onClick={()=>setFocusItem(null)} />
      <div className={`${styles.modal} ${styles.open}`} role="dialog" aria-modal="true" aria-labelledby="focus-title">
        <div className={styles.head}>
          <div>
            <h3 id="focus-title" className={styles.title}>
              {focusItem.case} {focusItem.api?.signature ? ` — ${focusItem.api.signature}` : ""}
            </h3>
            <div className={styles.meta}>
              status: {focusItem.status_code} · duration: {focusItem.duration_ms} ms · {ok?'PASS':'FAIL'}
            </div>
          </div>
          <div className={styles.btns}>
            <button className={styles.btnGhost} onClick={()=>setFocusItem(null)}>Close</button>
          </div>
        </div>

        {(focusItem.failures && focusItem.failures.length>0) && (
          <div className={styles.fail}>• {focusItem.failures.join("\n• ")}</div>
        )}

        <div className={styles.cols}>
          <div className={styles.col}>
            <div className={styles.sectionTitle}>Request</div>
            <pre className={styles.json}>{pretty(focusItem.request)}</pre>
          </div>
          <div className={styles.col}>
            <div className={styles.sectionTitle}>Response</div>
            <pre className={styles.json}>{pretty(focusItem.response)}</pre>
          </div>
        </div>
      </div>
    </>
  );
}
