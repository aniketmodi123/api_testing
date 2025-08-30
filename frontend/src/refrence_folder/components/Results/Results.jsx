import { useRunner } from "../../context/RunnerContext";
import CaseCard from "../CaseCard/CaseCard";
import styles from "./Results.module.css";

export default function Results(){
  const { report, singleSelectedFileNode } = useRunner();
  if(!report) return (
    <div>
      <h2 className={styles.h2}>Results <span className={styles.muted}></span></h2>
      <div className={styles.small + " " + styles.muted}>Run something to see results here.</div>
    </div>
  );

  if(report.error) return (
    <div>
      <h2 className={styles.h2}>Results</h2>
      <div className={styles.panel}>{report.error}</div>
    </div>
  );

  let list = report.flat || [];
  if(singleSelectedFileNode){
    const parts = singleSelectedFileNode.meta.service.split("/");
    let node = report.by_folder || {};
    for(let i=0;i<parts.length-1;i++){ node = node?.[parts[i]] || {}; }
    const file = node?.[parts[parts.length-1]];
    list = file?.cases || [];
  }

  return (
    <div>
      <h2 className={styles.h2}>Results <span className={styles.muted}></span></h2>
      <div className={styles.cases}>
        {list.map((c, i)=> <CaseCard key={i} item={c} />)}
      </div>
    </div>
  );
}
