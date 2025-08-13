import { useRunner } from "../../context/RunnerContext";
import styles from "./Tree.module.css";

function Folder({label, parts, node}){
  const { selectedFolders, toggleFolder } = useRunner();
  const checked = !!selectedFolders.find(p=>JSON.stringify(p)===JSON.stringify(parts));
  const kids = Object.keys(node||{}).sort();

  return (
    <div className={styles.folder}>
      <div className={styles.row}>
        <span className={styles.caret}/>
        <input type="checkbox" checked={checked} onChange={()=>toggleFolder(parts)} />
        <span className={styles.label}>{label}</span>
        <span className={`${styles.muted}`}>{kids.length} item(s)</span>
      </div>
      <div className={styles.children}>
        {kids.map(k=>{
          const v = node[k];
          const isFile = v && v.meta && v.cases;
          if(isFile){
            return <File key={k} label={k} meta={v.meta} count={v.cases?.length||0} />;
          }
          return <Folder key={k} label={k} parts={[...parts, k]} node={v} />;
        })}
      </div>
    </div>
  );
}

function File({label, meta, count}){
  const { selectedFiles, toggleFile } = useRunner();
  const checked = selectedFiles.includes(meta.service);
  return (
    <div className={styles.file}>
      <div className={styles.row} onClick={(e)=>{ if(e.target.tagName.toLowerCase()==='input') return; toggleFile(meta.service); }}>
        <input type="checkbox" checked={checked} onChange={()=>toggleFile(meta.service)} />
        <span className={styles.label}>{label}</span>
        <span className={styles.muted}>{count} case(s)</span>
      </div>
    </div>
  );
}

export default function Tree(){
  const { tree } = useRunner();
  if(!tree) return <div className={styles.small}>No services discovered. Load Tree to fetch /api/tree.</div>;
  if(tree.__error) return <div className={styles.small}>Failed to load tree. {tree.__error}</div>;
  const roots = Object.keys(tree).sort();
  return (
    <div id="tree" className={styles.tree}>
      {roots.map(k=>{
        const v = tree[k];
        const isFile = v && v.meta && v.cases;
        if(isFile){
          return <File key={k} label={k} meta={v.meta} count={v.cases?.length||0} />;
        }
        return <Folder key={k} label={k} parts={[k]} node={v} />;
      })}
    </div>
  );
}
