import React, { useEffect, useMemo, useState } from "react";

export default function JsonFloatEditor({
  open,
  mode,                // "create" | "edit"
  folderPath = "",     // for create (e.g., "cis/tariff")
  filePath = "",       // for edit   (e.g., "cis/tariff/get_tariff.json")
  initial = "{\n  \"meta\": {},\n  \"cases\": []\n}\n",
  onSave,              // async (filePath, content) => void
  onClose,
}) {
  const [filename, setFilename] = useState("");
  const [content, setContent]   = useState(initial);
  const [err, setErr]           = useState("");

  useEffect(() => {
    setContent(initial || "");
    setErr("");
    if (mode === "create") setFilename("new_spec.json");
  }, [open, initial, mode]);

  const fullPath = useMemo(() => {
    if (mode === "edit") return filePath;
    const base = (folderPath || "").replace(/\/+$/,"");
    const name = (filename || "").trim();
    return base ? `${base}/${name}` : name;
  }, [mode, folderPath, filePath, filename]);

  const validate = () => {
    if (!content || !content.trim()) return "JSON content cannot be empty.";
    try { JSON.parse(content); } catch (e) { return `Invalid JSON: ${e.message}`; }
    if (mode === "create") {
      if (!filename.trim()) return "Filename is required.";
      if (!/\.json$/i.test(filename.trim())) return "Filename must end with .json";
      if (/[\\/]/.test(filename)) return "Filename must not contain path separators.";
    }
    return "";
  };

  useEffect(() => { setErr(validate()); /* eslint-disable-next-line */ }, [content, filename]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{fontWeight: 600}}>
            {mode === "edit" ? "Edit JSON" : "Create JSON file"}
          </div>
          <button onClick={onClose} style={styles.iconBtn}>✖</button>
        </div>

        <div style={{marginBottom: 8, fontSize: 12, color: "#999"}}>
          {mode === "edit" ? fullPath : (folderPath ? `Folder: ${folderPath}` : "Folder: /")}
        </div>

        {mode === "create" && (
          <div style={{marginBottom: 8}}>
            <label style={styles.label}>Filename (.json)</label>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="e.g., get_user.json"
              style={styles.input}
            />
          </div>
        )}

        <label style={styles.label}>JSON</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          style={styles.textarea}
        />

        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.btnSecondary}>Cancel</button>
          <button
            onClick={async () => {
              const e = validate();
              if (e) { setErr(e); return; }
              await onSave(fullPath, content);
              onClose();
            }}
            disabled={!!err}
            style={{...styles.btnPrimary, opacity: err ? 0.5 : 1}}
          >Save</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50
  },
  card: {
    width: "min(900px, 92vw)", maxHeight: "86vh",
    background: "#0e1320", color: "#fff", borderRadius: 14,
    boxShadow: "0 10px 40px rgba(0,0,0,.5)", padding: 16,
    display: "flex", flexDirection: "column"
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  iconBtn: { border: "none", background: "transparent", color: "#aaa", fontSize: 18, cursor: "pointer" },
  label: { display: "block", marginBottom: 6, fontSize: 12, color: "#bbb" },
  input: {
    width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #243", background: "#0a0f1a", color: "#fff"
  },
  textarea: {
    width: "100%", minHeight: 300, borderRadius: 10,
    border: "1px solid #243", background: "#0a0f1a", color: "#fff",
    padding: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 13, lineHeight: 1.45, resize: "vertical"
  },
  error: { color: "#ff6b6b", fontSize: 12, marginTop: 8 },
  footer: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 },
  btnSecondary: { padding: "8px 12px", borderRadius: 10, background: "#1b2335", color: "#cbd5e1", border: "1px solid #32405c", cursor: "pointer" },
  btnPrimary: { padding: "8px 12px", borderRadius: 10, background: "#2563eb", color: "#fff", border: "none", cursor: "pointer" }
};
