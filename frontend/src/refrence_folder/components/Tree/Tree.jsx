import { useMemo, useState } from "react";
import { useRunner } from "../../context/RunnerContext";
import styles from "./Tree.module.css";

function isFileNode(v) {
  return !!(v && v.meta && v.cases);
}

function Folder({ label, parts, node }) {
  const { selectedFolders, toggleFolder } = useRunner();
  const [expanded, setExpanded] = useState(true); // default open (set false to start collapsed)

  // Stable IDs; handy if you later move expansion state to context
  const id = useMemo(() => parts.join("/"), [parts]);

  const checked = selectedFolders.some(
    (p) => JSON.stringify(p) === JSON.stringify(parts)
  );

  const kids = useMemo(() => Object.keys(node || {}).sort(), [node]);

  const toggleExpanded = () => setExpanded((e) => !e);

  return (
    <div className={styles.folder} data-id={id} data-expanded={expanded}>
      <div className={styles.row}>
        {/* Make caret interactive & accessible */}
        <button
          type="button"
          className={`${styles.caret} ${expanded ? styles.open : ""}`}
          aria-label={expanded ? "Collapse folder" : "Expand folder"}
          aria-expanded={expanded}
          onClick={toggleExpanded}
        />
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleFolder(parts)}
          onClick={(e) => e.stopPropagation()}
        />
        {/* Clicking label also toggles expansion */}
        <span
          className={styles.label}
          role="button"
          tabIndex={0}
          onClick={toggleExpanded}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleExpanded();
          }}
        >
          {label}
        </span>
        <span className={styles.muted}>{kids.length} item(s)</span>
      </div>

      {expanded && (
        <div className={styles.children}>
          {kids.map((k) => {
            const v = node[k];
            if (isFileNode(v)) {
              return (
                <File
                  key={k}
                  label={k}
                  meta={v.meta}
                  count={v.cases?.length || 0}
                />
              );
            }
            return <Folder key={k} label={k} parts={[...parts, k]} node={v} />;
          })}
        </div>
      )}
    </div>
  );
}

function File({ label, meta, count }) {
  const { selectedFiles, toggleFile } = useRunner();
  const checked = selectedFiles.includes(meta.service);

  return (
    <div className={styles.file}>
      <div
        className={styles.row}
        onClick={(e) => {
          if (e.target.tagName.toLowerCase() === "input") return;
          toggleFile(meta.service);
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleFile(meta.service)}
        />
        <span className={styles.label}>{label}</span>
        <span className={styles.muted}>{count} case(s)</span>
      </div>
    </div>
  );
}

export default function Tree() {
  const { tree } = useRunner();
  if (!tree)
    return (
      <div className={styles.small}>
        No services discovered. Load Tree to fetch /api/tree.
      </div>
    );
  if (tree.__error)
    return (
      <div className={styles.small}>Failed to load tree. {tree.__error}</div>
    );

  const roots = Object.keys(tree).sort();

  return (
    <div id="tree" className={styles.tree}>
      {roots.map((k) => {
        const v = tree[k];
        if (isFileNode(v)) {
          return (
            <File
              key={k}
              label={k}
              meta={v.meta}
              count={v.cases?.length || 0}
            />
          );
        }
        return <Folder key={k} label={k} parts={[k]} node={v} />;
      })}
    </div>
  );
}
