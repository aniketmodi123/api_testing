import React, { useEffect, useMemo, useState } from "react";
import { useRunner } from "../../context/RunnerContext";
import styles from "./ApiPicker.module.css"; // optional; remove if you don't use it

// tiny helpers for signature building
const pathOnly = (u) => (u || "").split("?", 1)[0];
const sigOf = (m, e) => `${(m || "GET").toUpperCase()} ${pathOnly(e)}`.trim();

// fetch a file's JSON doc from backend fs API
async function fetchFileDoc(apiBase, fileRel) {
  const res = await fetch(`${apiBase}/api/fs/files/${encodeURIComponent(fileRel)}`, {
    cache: "no-store",
    mode: "cors",
  });
  if (!res.ok) throw new Error(`Read failed ${res.status} for ${fileRel}`);
  const { content } = await res.json();
  let doc;
  try {
    doc = JSON.parse(content || "{}");
  } catch {
    doc = {};
  }
  // normalize shapes
  if (!doc || typeof doc !== "object") doc = {};
  if (!doc.meta || typeof doc.meta !== "object") doc.meta = {};
  if (!Array.isArray(doc.cases)) doc.cases = [];
  return doc;
}

// return the case names in doc that match the provided signature
function caseNamesMatchingSig(doc, signature) {
  const defM = (doc.meta?.method || "GET").toUpperCase();
  const defE = doc.meta?.endpoint || "";
  const names = [];
  for (const c of doc.cases || []) {
    if (!c || typeof c !== "object") continue;
    const m = (c.method || defM).toUpperCase();
    const e = c.endpoint ?? defE;
    const s = sigOf(m, e);
    if (s === signature && typeof c.name === "string") names.push(c.name);
  }
  return names;
}

export default function ApiPicker() {
  const {
    apiBase,
    apiMap,         // Map(signature => Set(fileRel))
    tree,           // for existence/refresh logic
    setReport,      // to show run results
  } = useRunner();

  // Build stable groups from apiMap
  const groups = useMemo(() => {
    const arr = [];
    (apiMap ? Array.from(apiMap.entries()) : []).forEach(([sig, filesSet]) => {
      const files = Array.from(filesSet || []);
      files.sort();
      arr.push({ sig, files });
    });
    arr.sort((a, b) => a.sig.localeCompare(b.sig));
    return arr;
  }, [apiMap]);

  // UI state
  const [open, setOpen] = useState(() => new Set()); // expanded signatures
  const [q, setQ] = useState("");                    // search
  const [selectedSigs, setSelectedSigs] = useState(new Set()); // parent selections
  // pairs: signature -> Set(files)
  const [selectedPairs, setSelectedPairs] = useState(() => new Map());

  // filter groups by search
  const filteredGroups = useMemo(() => {
    const needle = (q || "").toLowerCase();
    if (!needle) return groups;
    return groups.filter(({ sig, files }) => {
      if (sig.toLowerCase().includes(needle)) return true;
      return files.some((f) => f.toLowerCase().includes(needle));
    });
  }, [q, groups]);

  // toggle expand
  const toggleOpen = (sig) => {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(sig)) n.delete(sig);
      else n.add(sig);
      return n;
    });
  };

  // toggle parent signature selection
  const toggleSig = (sig) => {
    setSelectedSigs((prev) => {
      const n = new Set(prev);
      if (n.has(sig)) {
        n.delete(sig);
      } else {
        n.add(sig);
        // if parent selected, drop any per-file selections under it (avoid duplicates)
        setSelectedPairs((mp) => {
          const m2 = new Map(mp);
          m2.delete(sig);
          return m2;
        });
      }
      return n;
    });
  };

  // toggle pair (sig+file) selection
  const togglePair = (sig, file) => {
    // if parent is selected, unselect it; we're going per-file
    setSelectedSigs((prev) => {
      const n = new Set(prev);
      if (n.has(sig)) n.delete(sig);
      return n;
    });
    setSelectedPairs((mp) => {
      const m2 = new Map(mp);
      const s = new Set(m2.get(sig) || []);
      if (s.has(file)) s.delete(file);
      else s.add(file);
      if (s.size) m2.set(sig, s);
      else m2.delete(sig);
      return m2;
    });
  };

  // "Run Selected" logic
  const runSelection = async () => {
    if (!apiBase) {
      alert("Set backend base first.");
      return;
    }

    // 1) Parent selections -> a single API filter
    const apiSigs = Array.from(selectedSigs.values());
    const filters = [];
    if (apiSigs.length) {
      filters.push({ scope: "api", api_signatures: apiSigs });
    }

    // 2) File-specific selections -> case filters per file
    //    We need to read each file doc and pick only cases that match chosen signatures.
    // Build map: fileRel -> Set(signatures wanted for this file)
    const byFile = new Map();
    for (const [sig, filesSet] of selectedPairs.entries()) {
      if (selectedSigs.has(sig)) continue; // parent already covers it
      for (const f of filesSet.values()) {
        if (!byFile.has(f)) byFile.set(f, new Set());
        byFile.get(f).add(sig);
      }
    }

    if (byFile.size) {
      // fetch all required files
      const entries = Array.from(byFile.entries()); // [ [fileRel, Set(sigs)], ... ]
      const docs = await Promise.all(
        entries.map(([fileRel]) => fetchFileDoc(apiBase, fileRel).then((doc) => [fileRel, doc]))
      );

      // build case filters per file
      for (const [fileRel, doc] of docs) {
        const sigsWanted = byFile.get(fileRel) || new Set();
        const caseNames = new Set();
        for (const sig of sigsWanted.values()) {
          caseNamesMatchingSig(doc, sig).forEach((n) => caseNames.add(n));
        }
        if (caseNames.size) {
          filters.push({
            scope: "case",
            case_file: fileRel,
            case_names: Array.from(caseNames.values()),
          });
        }
      }
    }

    if (!filters.length) {
      alert("Select APIs (parent) or API-per-file items to run.");
      return;
    }

    // POST /api/run (reuse your backend and report UI)
    try {
      const res = await fetch(`${apiBase}/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, concurrency: 4 }),
        cache: "no-store",
        mode: "cors",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setReport({ error: `Run failed (HTTP ${res.status}). ${txt}` });
        return;
      }
      setReport(await res.json());
    } catch (err) {
      setReport({ error: String(err) });
    }
  };

  return (
    <div className={styles.wrap || ""}>
      <div className={styles.header || ""}>
        <h3 style={{ margin: 0 }}>APIs</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runSelection} disabled={!selectedSigs.size && !selectedPairs.size}>
            Run Selected
          </button>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search (signature or file)"
        className={styles.search || ""}
      />

      <div className={styles.list || ""}>
        {!filteredGroups.length ? (
          <div className={styles.empty || ""}>No API signatures found.</div>
        ) : (
          filteredGroups.map(({ sig, files }) => {
            const isOpen = open.has(sig);
            const parentChecked = selectedSigs.has(sig);
            const selectedFilesForSig = selectedPairs.get(sig) || new Set();
            return (
              <div key={sig} className={styles.group || ""}>
                <div className={styles.sigRow || ""}>
                  <label className={styles.row || ""} title={sig}>
                    <input
                      type="checkbox"
                      checked={parentChecked}
                      onChange={() => toggleSig(sig)}
                    />
                    <span style={{ fontWeight: 600 }}>{sig}</span>
                  </label>
                  <div className={styles.right || ""}>
                    <span className={styles.tag || ""}>{files.length} file{files.length>1?"s":""}</span>
                    <button className={styles.iconBtn || ""} onClick={() => toggleOpen(sig)}>
                      {isOpen ? "▾" : "▸"}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className={styles.files || ""}>
                    {files.map((f) => {
                      const checked = selectedFilesForSig.has(f);
                      return (
                        <label key={sig + "::" + f} className={styles.fileRow || ""} title={f}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePair(sig, f)}
                          />
                          <span className={styles.fileName || ""}>{f}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
