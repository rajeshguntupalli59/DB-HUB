import { useState, useEffect, useMemo } from "react";

const BASE = "http://localhost:8000";
async function apiFetch(path) {
  const token = localStorage.getItem("db_hub_token");
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Request failed");
  return res.json();
}

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />;
}

function PkBadge() {
  return (
    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 uppercase tracking-wide">PK</span>
  );
}

function DbBadge({ type }) {
  return type === "postgresql" ? (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400">PostgreSQL</span>
  ) : (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400">SQL Server</span>
  );
}


// ── Column type pill ───────────────────────────────────────────────────────

function TypePill({ type }) {
  const t = (type || "").toLowerCase();
  const cls =
    t.includes("int") || t.includes("serial") || t.includes("numeric") || t.includes("float") || t.includes("double") || t.includes("decimal")
      ? "text-blue-400 bg-blue-500/8 border-blue-500/15"
      : t.includes("char") || t.includes("text") || t.includes("varchar") || t.includes("nvar")
      ? "text-emerald-400 bg-emerald-500/8 border-emerald-500/15"
      : t.includes("bool")
      ? "text-purple-400 bg-purple-500/8 border-purple-500/15"
      : t.includes("date") || t.includes("time") || t.includes("timestamp")
      ? "text-orange-400 bg-orange-500/8 border-orange-500/15"
      : t.includes("json") || t.includes("xml") || t.includes("array")
      ? "text-pink-400 bg-pink-500/8 border-pink-500/15"
      : "text-slate-400 bg-slate-500/8 border-slate-500/15";
  return (
    <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border ${cls}`}>{type}</span>
  );
}


// ── Table detail panel ─────────────────────────────────────────────────────

function TableDetail({ connId, schema, table, dbType }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("columns");
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError(""); setData(null); setTab("columns");
    apiFetch(`/api/schema/${connId}/tables/${schema}/${table}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connId, schema, table]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-slate-500 gap-3">
      <Spinner /> Loading schema…
    </div>
  );
  if (error) return (
    <div className="flex-1 flex items-center justify-center text-red-400 text-sm px-8 text-center">{error}</div>
  );
  if (!data) return null;

  const tabs = [
    { id: "columns", label: "Columns", count: data.columns.length },
    { id: "indexes", label: "Indexes", count: data.indexes.length },
    { id: "fkeys",   label: "Foreign Keys", count: data.foreign_keys.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Table header */}
      <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <DbBadge type={dbType} />
          <span className="text-xs text-slate-600 font-mono">{schema}</span>
        </div>
        <h2 className="text-lg font-bold text-white font-mono">{table}</h2>
        <p className="text-xs text-slate-500 mt-1">
          {data.columns.length} columns · {data.indexes.length} indexes · {data.foreign_keys.length} foreign keys
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border px-6 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition -mb-px ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-slate-500 hover:text-white"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.id ? "bg-accent/15 text-accent" : "bg-surface-3 text-slate-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "columns" && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-1 border-b border-border">
              <tr>
                {["#", "Column", "Type", "Nullable", "Default"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.columns.map((col, i) => (
                <tr key={col.name} className={`border-b border-border/50 hover:bg-surface-2 transition ${i % 2 === 0 ? "" : "bg-surface-0/30"}`}>
                  <td className="px-4 py-3 text-slate-600 font-mono">{col.position}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-white">{col.name}</span>
                      {col.is_pk && <PkBadge />}
                    </div>
                  </td>
                  <td className="px-4 py-3"><TypePill type={col.type} /></td>
                  <td className="px-4 py-3">
                    {col.nullable
                      ? <span className="text-slate-500">null</span>
                      : <span className="text-red-400 font-medium">not null</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-500 truncate max-w-xs">
                    {col.default || <span className="text-slate-700">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "indexes" && (
          data.indexes.length === 0
            ? <div className="flex items-center justify-center h-32 text-slate-600 text-sm">No indexes</div>
            : <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-1 border-b border-border">
                  <tr>
                    {["Index Name", "Columns", "Type"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.indexes.map((idx, i) => (
                    <tr key={idx.name} className={`border-b border-border/50 hover:bg-surface-2 transition ${i % 2 === 0 ? "" : "bg-surface-0/30"}`}>
                      <td className="px-4 py-3 font-mono font-medium text-white">{idx.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{idx.columns.join(", ")}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {idx.primary && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 uppercase">Primary</span>}
                          {idx.unique && !idx.primary && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/25 text-blue-400 uppercase">Unique</span>}
                          {!idx.unique && !idx.primary && <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 border border-border text-slate-500 uppercase">Index</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}

        {tab === "fkeys" && (
          data.foreign_keys.length === 0
            ? <div className="flex items-center justify-center h-32 text-slate-600 text-sm">No foreign keys</div>
            : <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-1 border-b border-border">
                  <tr>
                    {["Column", "References", "Constraint"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.foreign_keys.map((fk, i) => (
                    <tr key={fk.constraint} className={`border-b border-border/50 hover:bg-surface-2 transition ${i % 2 === 0 ? "" : "bg-surface-0/30"}`}>
                      <td className="px-4 py-3 font-mono font-medium text-white">{fk.column}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">
                        <span className="text-slate-500">{fk.ref_schema}.</span>{fk.ref_table}
                        <span className="text-slate-600">.</span>
                        <span className="text-blue-300">{fk.ref_column}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">{fk.constraint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}
      </div>
    </div>
  );
}


// ── Main page ──────────────────────────────────────────────────────────────

export default function SchemaPage() {
  const [connections, setConnections] = useState([]);
  const [selectedConn, setSelectedConn] = useState(null);
  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [search, setSearch] = useState("");
  const [tableError, setTableError] = useState("");

  useEffect(() => {
    apiFetch("/api/connections").then(data => {
      setConnections(data);
      if (data.length === 1) selectConn(data[0]);
    });
  }, []);

  async function selectConn(conn) {
    setSelectedConn(conn);
    setSelectedTable(null);
    setSearch("");
    setTables([]);
    setTableError("");
    setLoadingTables(true);
    try {
      const data = await apiFetch(`/api/schema/${conn.id}/tables`);
      setTables(data);
    } catch (e) {
      setTableError(e.message);
    } finally {
      setLoadingTables(false);
    }
  }

  // Group tables by schema
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tables.filter(t => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q));
  }, [tables, search]);

  const grouped = useMemo(() => {
    const map = {};
    for (const t of filtered) {
      if (!map[t.schema]) map[t.schema] = [];
      map[t.schema].push(t);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex h-full min-h-screen">

      {/* ── Left sidebar: connection + table list ── */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-surface-1">

        {/* Connection selector */}
        <div className="px-3 py-4 border-b border-border">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2 px-1">Connection</p>
          {connections.length === 0 ? (
            <p className="text-xs text-slate-600 px-1">No connections saved.</p>
          ) : (
            <div className="space-y-0.5">
              {connections.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectConn(c)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs font-medium transition ${
                    selectedConn?.id === c.id
                      ? "bg-accent/10 text-accent"
                      : "text-slate-400 hover:text-white hover:bg-surface-3"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.db_type === "postgresql" ? "bg-sky-400" : "bg-orange-400"}`}></span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        {selectedConn && (
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                className="w-full bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-accent transition"
                placeholder="Filter tables…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Table list */}
        <div className="flex-1 overflow-y-auto py-2">
          {!selectedConn ? (
            <p className="text-xs text-slate-600 px-4 mt-4">Select a connection to browse tables.</p>
          ) : loadingTables ? (
            <div className="flex justify-center mt-8"><Spinner /></div>
          ) : tableError ? (
            <p className="text-xs text-red-400 px-4 mt-4">{tableError}</p>
          ) : tables.length === 0 ? (
            <p className="text-xs text-slate-600 px-4 mt-4">No tables found.</p>
          ) : (
            Object.entries(grouped).map(([schema, tbls]) => (
              <div key={schema} className="mb-2">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-4 py-1.5">{schema}</p>
                {tbls.map(t => (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTable(t)}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-1.5 text-xs transition ${
                      selectedTable?.name === t.name && selectedTable?.schema === t.schema
                        ? "bg-accent/10 text-accent"
                        : "text-slate-400 hover:text-white hover:bg-surface-3"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <svg className="w-3 h-3 shrink-0 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M3 9h18M3 15h18M9 3v18"/>
                      </svg>
                      <span className="truncate font-mono">{t.name}</span>
                    </span>
                    {t.row_estimate > 0 && (
                      <span className="text-[9px] text-slate-600 shrink-0 tabular-nums">
                        {t.row_estimate.toLocaleString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer: table count */}
        {tables.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <p className="text-[10px] text-slate-600">{filtered.length} of {tables.length} tables</p>
          </div>
        )}
      </div>

      {/* ── Right: table detail ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-surface-0">
        {selectedTable ? (
          <TableDetail
            connId={selectedConn.id}
            schema={selectedTable.schema}
            table={selectedTable.name}
            dbType={selectedConn.db_type}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M3 15h18M9 3v18"/>
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2">
              {selectedConn ? "Select a table" : "Select a connection"}
            </h3>
            <p className="text-slate-500 text-sm max-w-xs">
              {selectedConn
                ? "Click any table in the sidebar to view its columns, indexes, and foreign keys."
                : "Choose a saved connection from the sidebar to start browsing its schema."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
