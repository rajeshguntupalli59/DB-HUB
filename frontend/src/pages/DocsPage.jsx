import { useState, useEffect } from "react";

const BASE = "http://localhost:8000";
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("db_hub_token");
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Request failed");
  return res.json();
}

function Spinner({ sm }) {
  return <span className={`inline-block border-2 border-white/20 border-t-white rounded-full animate-spin ${sm ? "w-3.5 h-3.5" : "w-5 h-5"}`} />;
}

// ── Markdown renderer ──────────────────────────────────────────────────────
function Markdown({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Table
    if (line.startsWith("|") && lines[i + 1]?.match(/^\|[-| :]+\|$/)) {
      const headers = line.split("|").slice(1, -1).map(h => h.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").slice(1, -1).map(c => c.trim()));
        i++;
      }
      out.push(
        <div key={i} className="overflow-x-auto my-5 rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-surface-2">
              <tr>{headers.map((h, j) => <th key={j} className="px-4 py-2.5 text-left text-slate-400 font-semibold uppercase tracking-wide text-[10px]">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-t border-border hover:bg-surface-2 transition">
                  {row.map((cell, ci) => (
                    <td key={ci} className={`px-4 py-2.5 ${ci === 0 ? "font-mono text-white font-medium" : ci === 2 ? (cell === "Yes" ? "text-red-400" : "text-slate-500") : "text-slate-300"}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { code.push(lines[i]); i++; }
      out.push(
        <div key={i} className="my-4 rounded-xl overflow-hidden border border-border">
          {lang && <div className="px-4 py-1.5 bg-surface-3 text-[10px] text-slate-500 font-mono uppercase tracking-wider border-b border-border">{lang}</div>}
          <pre className="bg-gray-950 px-4 py-4 text-xs text-emerald-300 font-mono overflow-x-auto leading-relaxed">{code.join("\n")}</pre>
        </div>
      );
      i++; continue;
    }

    if (line.startsWith("## ")) { out.push(<h2 key={i} className="text-xl font-bold text-white mt-10 mb-3 flex items-center gap-2"><span className="w-1 h-6 rounded-full bg-accent inline-block"></span>{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith("### ")) { out.push(<h3 key={i} className="text-sm font-semibold text-slate-300 mt-7 mb-3 uppercase tracking-wider">{line.slice(4)}</h3>); i++; continue; }
    if (line.startsWith("> ")) { out.push(<blockquote key={i} className="border-l-2 border-accent pl-4 text-slate-300 text-sm italic my-3">{line.slice(2)}</blockquote>); i++; continue; }
    if (line.startsWith("- ")) { out.push(<li key={i} className="text-slate-300 text-sm ml-4 list-disc leading-relaxed my-1">{line.slice(2)}</li>); i++; continue; }
    if (line.startsWith("---")) { out.push(<hr key={i} className="border-border my-6" />); i++; continue; }
    if (line.trim() === "") { out.push(<div key={i} className="h-2" />); i++; continue; }
    out.push(<p key={i} className="text-slate-300 text-sm leading-relaxed">{line}</p>);
    i++;
  }
  return <div className="space-y-1">{out}</div>;
}


// ── Main page ──────────────────────────────────────────────────────────────
export default function DocsPage() {
  const [connections, setConnections] = useState([]);
  const [selectedConn, setSelectedConn] = useState(null);
  const [tables, setTables] = useState([]);
  const [docs, setDocs] = useState({});          // key: "schema.table"
  const [selectedTable, setSelectedTable] = useState(null);
  const [docContent, setDocContent] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [generating, setGenerating] = useState({}); // key: "schema.table" → true
  const [genProgress, setGenProgress] = useState(null); // {done, total}
  const [loadingTables, setLoadingTables] = useState(false);

  useEffect(() => {
    apiFetch("/api/connections").then(data => {
      setConnections(data);
      if (data.length === 1) selectConn(data[0]);
    });
  }, []);

  async function selectConn(conn) {
    setSelectedConn(conn);
    setSelectedTable(null);
    setDocContent(null);
    setTables([]);
    setDocs({});
    setLoadingTables(true);
    try {
      const [tbls, savedDocs] = await Promise.all([
        apiFetch(`/api/schema/${conn.id}/tables`),
        apiFetch(`/api/docs/${conn.id}`),
      ]);
      setTables(tbls);
      const map = {};
      for (const d of savedDocs) map[`${d.schema}.${d.table}`] = d;
      setDocs(map);
    } finally { setLoadingTables(false); }
  }

  async function loadDoc(conn, t) {
    setSelectedTable(t);
    setDocContent(null);
    const key = `${t.schema}.${t.name}`;
    if (docs[key]) {
      setDocContent(docs[key].content || null);
      // fetch full content if not yet loaded
      if (!docs[key].content) {
        setLoadingDoc(true);
        try {
          const d = await apiFetch(`/api/docs/${conn.id}/${t.schema}/${t.name}`);
          if (d) { setDocContent(d.content); setDocs(prev => ({ ...prev, [key]: d })); }
        } finally { setLoadingDoc(false); }
      }
    }
  }

  async function generateOne(t) {
    if (!selectedConn) return;
    const key = `${t.schema}.${t.name}`;
    setGenerating(g => ({ ...g, [key]: true }));
    try {
      const d = await apiFetch(`/api/docs/${selectedConn.id}/generate/${t.schema}/${t.name}`, { method: "POST" });
      setDocs(prev => ({ ...prev, [key]: d }));
      if (selectedTable?.name === t.name && selectedTable?.schema === t.schema) setDocContent(d.content);
    } finally {
      setGenerating(g => { const n = { ...g }; delete n[key]; return n; });
    }
  }

  async function generateAll() {
    if (!selectedConn || tables.length === 0) return;
    const undone = tables.filter(t => !docs[`${t.schema}.${t.name}`]);
    if (undone.length === 0) return;
    setGenProgress({ done: 0, total: undone.length });
    for (let i = 0; i < undone.length; i++) {
      await generateOne(undone[i]);
      setGenProgress({ done: i + 1, total: undone.length });
    }
    setGenProgress(null);
  }

  async function deleteDoc(t) {
    if (!selectedConn) return;
    const key = `${t.schema}.${t.name}`;
    await apiFetch(`/api/docs/${selectedConn.id}/${t.schema}/${t.name}`, { method: "DELETE" });
    setDocs(prev => { const n = { ...prev }; delete n[key]; return n; });
    if (selectedTable?.name === t.name) setDocContent(null);
  }

  function exportMd() {
    window.open(`${BASE}/api/docs/${selectedConn.id}/export.md?token=${localStorage.getItem("db_hub_token")}`, "_blank");
  }

  const docCount = Object.keys(docs).length;
  const totalCount = tables.length;

  return (
    <div className="flex h-full min-h-screen">

      {/* ── Left sidebar ── */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-surface-1">

        {/* Connection picker */}
        <div className="px-3 py-4 border-b border-border">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2 px-1">Connection</p>
          {connections.map(c => (
            <button key={c.id} onClick={() => selectConn(c)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs font-medium transition ${
                selectedConn?.id === c.id ? "bg-accent/10 text-accent" : "text-slate-400 hover:text-white hover:bg-surface-3"
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.db_type === "postgresql" ? "bg-sky-400" : "bg-orange-400"}`}></span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>

        {/* Generate all */}
        {selectedConn && tables.length > 0 && (
          <div className="px-3 py-3 border-b border-border space-y-2">
            {genProgress ? (
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                  <span>Generating…</span>
                  <span>{genProgress.done}/{genProgress.total}</span>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(genProgress.done / genProgress.total) * 100}%` }} />
                </div>
              </div>
            ) : (
              <button onClick={generateAll} disabled={docCount === totalCount}
                className="w-full flex items-center justify-center gap-2 py-2 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                {docCount === totalCount ? "All Documented" : `Generate All (${totalCount - docCount} left)`}
              </button>
            )}
            {docCount > 0 && (
              <button onClick={exportMd}
                className="w-full flex items-center justify-center gap-2 py-1.5 border border-border hover:border-slate-500 text-slate-400 hover:text-white text-xs font-medium rounded-lg transition">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Markdown
              </button>
            )}
          </div>
        )}

        {/* Table list */}
        <div className="flex-1 overflow-y-auto py-2">
          {!selectedConn ? (
            <p className="text-xs text-slate-600 px-4 mt-4">Select a connection.</p>
          ) : loadingTables ? (
            <div className="flex justify-center mt-8"><Spinner /></div>
          ) : tables.length === 0 ? (
            <p className="text-xs text-slate-600 px-4 mt-4">No tables found.</p>
          ) : (
            tables.map(t => {
              const key = `${t.schema}.${t.name}`;
              const isDocumented = !!docs[key];
              const isGenerating = !!generating[key];
              const isSelected = selectedTable?.name === t.name && selectedTable?.schema === t.schema;
              return (
                <button key={key} onClick={() => loadDoc(selectedConn, t)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition group ${
                    isSelected ? "bg-accent/10 text-accent" : "text-slate-400 hover:text-white hover:bg-surface-3"
                  }`}>
                  {isGenerating
                    ? <Spinner sm />
                    : isDocumented
                    ? <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Documented" />
                    : <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0 group-hover:bg-slate-500 transition" />
                  }
                  <span className="flex-1 font-mono truncate">{t.name}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        {tables.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <p className="text-[10px] text-slate-600">{docCount} of {totalCount} documented</p>
          </div>
        )}
      </div>

      {/* ── Right: doc viewer ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-surface-0 overflow-y-auto">
        {selectedTable ? (
          <>
            {/* Doc toolbar */}
            <div className="sticky top-0 z-10 bg-surface-1/95 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs text-slate-500 font-mono">{selectedTable.schema}</p>
                <p className="text-sm font-bold text-white font-mono">{selectedTable.name}</p>
              </div>
              <div className="flex items-center gap-2">
                {docs[`${selectedTable.schema}.${selectedTable.name}`] && (
                  <button onClick={() => deleteDoc(selectedTable)}
                    className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Delete doc">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                )}
                <button
                  onClick={() => generateOne(selectedTable)}
                  disabled={!!generating[`${selectedTable.schema}.${selectedTable.name}`]}
                  className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition">
                  {generating[`${selectedTable.schema}.${selectedTable.name}`]
                    ? <><Spinner sm /> Generating…</>
                    : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                      {docs[`${selectedTable.schema}.${selectedTable.name}`] ? "Regenerate" : "Generate Docs"}
                    </>
                  }
                </button>
              </div>
            </div>

            {/* Doc content */}
            <div className="flex-1 px-10 py-8 max-w-4xl mx-auto w-full">
              {loadingDoc ? (
                <div className="flex justify-center py-20"><Spinner /></div>
              ) : docContent ? (
                <Markdown text={docContent} />
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
                    <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold mb-2">No documentation yet</h3>
                  <p className="text-slate-500 text-sm mb-5 max-w-xs">Click "Generate Docs" to have Claude AI write documentation for this table.</p>
                  <button onClick={() => generateOne(selectedTable)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-semibold rounded-lg transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    Generate Docs
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2">
              {selectedConn ? "Select a table to document" : "Select a connection"}
            </h3>
            <p className="text-slate-500 text-sm max-w-xs">
              {selectedConn
                ? "Pick a table from the sidebar, then generate AI documentation or use Generate All."
                : "Choose a connection from the sidebar to start documenting your schema."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
