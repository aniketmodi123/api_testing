import { useRunner } from "../../context/RunnerContext";
import styles from "./CaseCard.module.css";

function pretty(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function CaseCard({ item }) {
  const { setFocusItem } = useRunner();
  const ok = !!item.ok;
  return (
    <div className={styles.card}>
      <h3 className={styles.h3}>
        <span className={styles.cardTitle} onClick={() => setFocusItem(item)}>
          {item.case} {ok ? <span className={styles.ok}>PASS</span> : <span className={styles.bad}>FAIL</span>}
        </span>
        <span className={styles.tag}>{item.api?.signature || ""}</span>
        <button type="button" className={styles.btnFocus} onClick={() => setFocusItem(item)}>
          Focus
        </button>
      </h3>
      <div className={styles.meta}>
        status: <b className={ok ? styles.ok : styles.bad}>{item.status_code}</b>
        &nbsp;·&nbsp; duration: {item.duration_ms} ms
      </div>

      {item.failures && item.failures.length > 0 && (
        <div className={styles.fail}>• {item.failures.join("\n• ")}</div>
      )}

      <details data-kind="request">
        <summary
          onClick={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              setFocusItem(item);
            }
          }}
        >
          Request
        </summary>
        <pre className={styles.json}>{pretty(item.request)}</pre>
      </details>
      <details data-kind="response">
        <summary
          onClick={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              setFocusItem(item);
            }
          }}
        >
          Response
        </summary>
        <pre className={styles.json}>{pretty(item.response)}</pre>
      </details>
    </div>
  );
}
