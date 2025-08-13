import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from "react";

const RunnerCtx = createContext(null);

const STORAGE_KEY = "apiBase";

function cleanBase(v) {
  return (v || "").trim().replace(/\/+$/, "");
}

function readApiBase() {
  try {
    const qs = new URLSearchParams(window.location.search);
    const fromQS = qs.get("api_base");
    const fromLS = window.localStorage.getItem(STORAGE_KEY);
    const cookie = document.cookie
      .split("; ")
      .find((x) => x.startsWith("api_base="));
    const fromCookie = cookie ? decodeURIComponent(cookie.split("=")[1]) : "";
    const sameOrigin =
      window.location.origin && /^https?:\/\//i.test(window.location.origin)
        ? window.location.origin
        : "";
    return cleanBase(fromQS || fromLS || fromCookie || sameOrigin || "");
  } catch {
    return "";
  }
}

function writeApiBase(base) {
  const clean = cleanBase(base);
  try {
    window.localStorage.setItem(STORAGE_KEY, clean);
  } catch {}
  try {
    document.cookie = `api_base=${encodeURIComponent(
      clean
    )}; path=/; max-age=${60 * 60 * 24 * 365}`;
  } catch {}
  try {
    const url = new URL(window.location.href);
    if (clean) url.searchParams.set("api_base", clean);
    else url.searchParams.delete("api_base");
    window.history.replaceState({}, "", url);
  } catch {}
  return clean;
}

function indexApis(tree) {
  const map = new Map();
  (function walk(n) {
    Object.keys(n || {}).forEach((k) => {
      const v = n[k];
      if (v && v.meta && v.cases) {
        (v.apis || []).forEach((sig) => {
          if (!map.has(sig)) map.set(sig, new Set());
          map.get(sig).add(v.meta.service);
        });
      } else if (v && typeof v === "object") {
        walk(v);
      }
    });
  })(tree || {});
  return map;
}

function listAllApis(tree) {
  const apis = new Set();
  (function walk(n) {
    Object.keys(n || {}).forEach((k) => {
      const v = n[k];
      if (v && v.meta && v.cases) {
        (v.apis || []).forEach((sig) => apis.add(sig));
      } else if (v && typeof v === "object") {
        walk(v);
      }
    });
  })(tree || {});
  return Array.from(apis).sort();
}

export function RunnerProvider({ children }) {
  const [apiBase, setApiBase] = useState("");
  const [cfg, setCfg] = useState(null);
  const [tree, setTree] = useState(null);
  const [apiMap, setApiMap] = useState(new Map());
  const [scope, setScope] = useState("project");

  const [selectedFolders, setSelectedFolders] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [report, setReport] = useState(null);
  const [focusItem, setFocusItem] = useState(null);

  // APIs selection (for case listing by API)
  const [selectedApis, setSelectedApis] = useState([]);

  // ---- Init base from URL/localStorage/cookie/origin
  useEffect(() => {
    setApiBase(readApiBase());
  }, []);

  // ---- Whenever apiBase changes, persist it everywhere
  useEffect(() => {
    writeApiBase(apiBase);
  }, [apiBase]);

  // Also expose an explicit "save" that persists and sets state
  const saveApiBase = useCallback((val) => {
    const clean = writeApiBase(val);
    setApiBase(clean);
  }, []);

  const apis = useMemo(() => listAllApis(tree || {}), [tree]);

  const singleSelectedFileNode = useMemo(() => {
    if (!tree) return null;
    if (selectedFiles.length !== 1) return null;
    const parts = selectedFiles[0].split("/");
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) node = node?.[parts[i]];
    return node?.[parts[parts.length - 1]] || null;
  }, [tree, selectedFiles]);

  const casesForSingleFile = useMemo(() => {
    return singleSelectedFileNode?.cases || [];
  }, [singleSelectedFileNode]);

  useEffect(() => {
    setApiMap(indexApis(tree || {}));
  }, [tree]);

  const casesForSelectedApi = useMemo(() => {
    if (!tree) return [];
    if (selectedApis.length !== 1) return [];
    const sig = selectedApis[0];
    const files = Array.from((apiMap.get(sig) || new Set()).values());
    const names = new Set();
    files.forEach((f) => {
      const parts = f.split("/");
      let node = tree;
      for (let i = 0; i < parts.length - 1; i++) node = node?.[parts[i]];
      const fileNode = node?.[parts[parts.length - 1]];
      (fileNode?.cases || []).forEach((c) => names.add(c));
    });
    return Array.from(names);
  }, [tree, apiMap, selectedApis]);

  const loadConfig = useCallback(async () => {
    if (!apiBase) {
      setCfg({ error: "Set backend base first." });
      return;
    }
    try {
      const res = await fetch(`${apiBase}/config`, {
        cache: "no-store",
        redirect: "follow",
        mode: "cors",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCfg(await res.json());
    } catch (err) {
      setCfg({ error: String(err) });
    }
  }, [apiBase]);

  const loadTree = useCallback(async () => {
    if (!apiBase) {
      setTree(null);
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/tree`, {
        cache: "no-store",
        redirect: "follow",
        mode: "cors",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTree(data.tree || {});
    } catch (err) {
      setTree({ __error: String(err) });
    }
  }, [apiBase]);

  const expandApisToFileFilters = useCallback(
    (apiSigs) => {
      const filters = [];
      const seen = new Set();
      apiSigs.forEach((sig) => {
        const files = apiMap.get(sig);
        if (!files) return;
        files.forEach((f) => {
          if (seen.has(f)) return;
          seen.add(f);
          filters.push({ scope: "file", file_service: f });
        });
      });
      return filters;
    },
    [apiMap]
  );

  const runWithFilters = useCallback(
    async (filters) => {
      if (!apiBase) {
        alert("Set backend base first.");
        return;
      }
      setReport(null);
      try {
        const res = await fetch(`${apiBase}/api/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters, concurrency: 4 }),
          cache: "no-store",
          redirect: "follow",
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
    },
    [apiBase]
  );

  const runProject = () => runWithFilters([{ scope: "project" }]);
  const runSelected = () => {
    const filters = [];
    selectedFolders.forEach((parts) =>
      filters.push({ scope: "folder", folder_parts: parts })
    );
    selectedFiles.forEach((f) =>
      filters.push({ scope: "file", file_service: f })
    );
    if (!filters.length)
      return alert(
        "Check some folders/files on the left, or use Run Project."
      );
    runWithFilters(filters);
  };
  const runScope = () => {
    if (scope === "project") return runProject();
    if (scope === "folder") {
      if (!selectedFolders.length) return alert("Select at least one folder.");
      return runWithFilters(
        selectedFolders.map((parts) => ({ scope: "folder", folder_parts: parts }))
      );
    }
    if (scope === "file") {
      if (!selectedFiles.length) return alert("Select at least one file.");
      return runWithFilters(
        selectedFiles.map((f) => ({ scope: "file", file_service: f }))
      );
    }
    if (scope === "api") {
      return alert("Use 'Run Selected API(s)' button.");
    }
    if (scope === "case") {
      if (!singleSelectedFileNode)
        return alert("Select exactly one file in the tree to pick cases.");
      return alert("Use 'Run Selected Case(s)' button.");
    }
  };

  const runApis = (apiSigs) => {
    const filters = expandApisToFileFilters(apiSigs);
    if (!filters.length)
      return alert(
        "No files mapped to the selected API(s). Check /api/tree payload for 'apis' per file."
      );
    runWithFilters(filters);
  };

  const runCases = (caseNames) => {
    if (!singleSelectedFileNode)
      return alert("Select exactly one file in the tree.");
    if (!caseNames?.length) return alert("Pick one or more cases.");
    runWithFilters([
      {
        scope: "case",
        case_file: singleSelectedFileNode.meta.service,
        case_names: caseNames,
      },
    ]);
  };

  const toggleFolder = (parts) => {
    setSelectedFolders((prev) => {
      const key = JSON.stringify(parts);
      const has = prev.find((p) => JSON.stringify(p) === key);
      if (has) return prev.filter((p) => JSON.stringify(p) !== key);
      return [...prev, parts];
    });
  };
  const toggleFile = (service) => {
    setSelectedFiles((prev) => {
      const has = prev.includes(service);
      if (has) return prev.filter((p) => p !== service);
      return [...prev, service];
    });
  };

  const value = {
    apiBase,
    setApiBase,
    saveApiBase, // <- call this on Save
    cfg,
    setCfg,
    loadConfig,
    tree,
    setTree,
    loadTree,
    apis,
    apiMap,
    scope,
    setScope,

    selectedFolders,
    selectedFiles,
    toggleFolder,
    toggleFile,

    report,
    setReport,
    focusItem,
    setFocusItem,

    singleSelectedFileNode,
    casesForSingleFile,

    selectedApis,
    setSelectedApis,
    casesForSelectedApi,

    runProject,
    runSelected,
    runScope,
    runApis,
    runCases,
  };

  return <RunnerCtx.Provider value={value}>{children}</RunnerCtx.Provider>;
}

export const useRunner = () => useContext(RunnerCtx);
