import { useState, useEffect, useRef } from "react";

const BASE = "http://localhost:8000";

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

function Spinner({ sm }) {
  return <span className={`inline-block border-2 border-white/20 border-t-white rounded-full animate-spin ${sm ? "w-3.5 h-3.5" : "w-5 h-5"}`} />;
}

function DbBadge({ type }) {
  if (type === "postgresql") return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/25 text-sky-400 uppercase">PG</span>;
  if (type === "mysql")      return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-amber-400 uppercase">MySQL</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/15 border border-orange-500/25 text-orange-400 uppercase">MSSQL</span>;
}

function SeverityBadge({ level }) {
  const map = { high: "text-red-400 bg-red-500/10 border-red-500/25", medium: "text-amber-400 bg-amber-500/10 border-amber-500/25", low: "text-sky-400 bg-sky-500/10 border-sky-500/25" };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${map[level] || map.low}`}>{level}</span>;
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-xs px-2 py-1 rounded border border-border text-slate-400 hover:text-white hover:border-slate-500 transition">
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── SQL Editor ────────────────────────────────────────────────────────────────
function SqlEditor({ value, onChange, placeholder, rows = 6 }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || "SELECT ..."}
      rows={rows}
      spellCheck={false}
      className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-accent transition resize-y"
    />
  );
}

// ── Plan Node (recursive tree) ────────────────────────────────────────────────
function PlanNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const nt = node["Node Type"] || "Node";
  const cost = node["Total Cost"];
  const rows = node["Plan Rows"] || node["Actual Rows"];
  const rel = node["Relation Name"];
  const children = node["Plans"] || [];
  const desc = node["Description"];

  const costColor = cost > 10000 ? "text-red-400" : cost > 1000 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className={`${depth > 0 ? "ml-5 border-l border-border/50 pl-3 mt-1" : ""}`}>
      <div
        className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-white/[0.03] cursor-pointer group"
        onClick={() => children.length > 0 && setOpen(o => !o)}
      >
        {children.length > 0 && (
          <svg className={`w-3 h-3 mt-0.5 text-slate-500 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        )}
        {children.length === 0 && <span className="w-3 h-3 shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="font-mono font-semibold text-sm text-violet-300">{nt}</span>
          {rel && <span className="ml-2 text-xs text-slate-400">on <span className="text-white">{rel}</span></span>}
          {node["Key"] && <span className="ml-2 text-xs text-sky-400">via {node["Key"]}</span>}
          <div className="flex items-center gap-3 mt-0.5">
            {cost != null && <span className={`text-xs font-mono ${costColor}`}>cost={typeof cost === "number" ? cost.toFixed(2) : cost}</span>}
            {rows != null && <span className="text-xs font-mono text-slate-400">rows≈{rows}</span>}
          </div>
          {desc && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-lg">{String(desc).slice(0, 200)}</p>}
        </div>
      </div>
      {open && children.map((child, i) => <PlanNode key={i} node={child} depth={depth + 1} />)}
    </div>
  );
}

// ── EXPLAIN TAB ───────────────────────────────────────────────────────────────
function ExplainTab({ connId }) {
  const [sql, setSql] = useState("");
  const [analyze, setAnalyze] = useState(false);
  const [buffers, setBuffers] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (!sql.trim()) return setError("Enter a SQL query.");
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await apiFetch(`/api/optimizer/${connId}/explain`, { method: "POST", body: JSON.stringify({ sql, analyze, buffers }) });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const plan = result?.plan?.[0]?.Plan;
  const summary = result?.summary;
  const warnings = summary?.warnings || [];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">SQL Query</label>
        <SqlEditor value={sql} onChange={setSql} placeholder="SELECT u.*, o.total FROM users u JOIN orders o ON o.user_id = u.id WHERE u.id = 1" />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-violet-500" checked={analyze} onChange={e => setAnalyze(e.target.checked)} />
          <span className="text-sm text-slate-300">ANALYZE (executes query)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-violet-500" checked={buffers} onChange={e => setBuffers(e.target.checked)} />
          <span className="text-sm text-slate-300">BUFFERS</span>
        </label>
        <button onClick={run} disabled={loading}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
          {loading ? <Spinner sm /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>}
          Run EXPLAIN
        </button>
      </div>
      {error && <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">{error}</div>}

      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Cost", value: summary?.total_cost != null ? Number(summary.total_cost).toFixed(2) : "—" },
              { label: "Node Type", value: summary?.node_type || "—" },
              { label: "Plan Rows", value: summary?.plan_rows ?? "—" },
              { label: "Actual Time", value: summary?.actual_total_time != null ? `${Number(summary.actual_total_time).toFixed(2)}ms` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-2 border border-border rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-sm font-semibold text-white mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Warnings</p>
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                  <svg className="w-3.5 h-3.5 mt-0.5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  <p className="text-xs text-amber-300">{w.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Plan tree */}
          <div className="bg-surface-2 border border-border rounded-lg p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Execution Plan</p>
            {plan ? <PlanNode node={plan} /> : <p className="text-sm text-slate-500">No plan data returned.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── INDEX ADVISOR TAB ─────────────────────────────────────────────────────────
function IndexTab({ connId }) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (!sql.trim()) return setError("Enter a SQL query.");
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await apiFetch(`/api/optimizer/${connId}/indexes`, { method: "POST", body: JSON.stringify({ sql }) });
      setResult(r.recommendations);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const benefitColor = b => b === "High" ? "text-red-400" : b?.startsWith("Medium") ? "text-amber-400" : "text-sky-400";

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">SQL Query to Analyze</label>
        <SqlEditor value={sql} onChange={setSql} placeholder="SELECT * FROM orders WHERE user_id = 1 ORDER BY created_at DESC" />
      </div>
      <button onClick={run} disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
        {loading ? <Spinner sm /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
        Analyze Indexes
      </button>
      {error && <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">{error}</div>}

      {result && (
        result.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/8 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            No missing indexes detected for this query.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{result.length} recommendation{result.length !== 1 ? "s" : ""} found</p>
            {result.map((rec, i) => (
              <div key={i} className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{rec.table}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{rec.reason}</p>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${benefitColor(rec.estimated_benefit)}`}>
                    {rec.estimated_benefit}
                  </span>
                </div>
                {rec.columns?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {rec.columns.map(c => (
                      <span key={c} className="text-[11px] font-mono px-2 py-0.5 bg-violet-500/10 border border-violet-500/25 text-violet-300 rounded">{c}</span>
                    ))}
                  </div>
                )}
                {rec.ddl && (
                  <div className="flex items-start gap-2">
                    <pre className="flex-1 text-xs font-mono text-emerald-300 bg-surface-3 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap">{rec.ddl}</pre>
                    <CopyBtn text={rec.ddl} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── SLOW QUERIES TAB ──────────────────────────────────────────────────────────
function SlowTab({ connId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(20);

  async function load() {
    setLoading(true); setError(""); setData(null);
    try {
      const r = await apiFetch(`/api/optimizer/${connId}/slow-queries?limit=${limit}`);
      setData(r.queries);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (connId) load(); }, [connId]);

  const fmt = (v, suffix = "") => v == null ? "—" : `${Number(v).toFixed(2)}${suffix}`;

  const hasError = data?.[0]?.error;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={limit} onChange={e => setLimit(Number(e.target.value))}
          className="bg-surface-2 border border-border text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-accent">
          {[10, 20, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
          {loading ? <Spinner sm /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
          Refresh
        </button>
      </div>
      {error && <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">{error}</div>}

      {data && hasError && (
        <div className="px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-lg text-sm text-amber-300">{data[0].error}</div>
      )}

      {data && !hasError && data.length === 0 && (
        <div className="px-4 py-3 bg-surface-2 border border-border rounded-lg text-sm text-slate-400">No queries recorded yet.</div>
      )}

      {data && !hasError && data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                {["Query", "Calls", "Mean (ms)", "Total (ms)", "Min", "Max", "Rows", "Cache Hit%"].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-slate-400 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-mono text-xs text-slate-300 truncate" title={row.query}>{(row.query || "").slice(0, 80)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300 tabular-nums">{row.calls}</td>
                  <td className="px-4 py-3 font-mono text-amber-300 tabular-nums">{fmt(row.mean_time_ms)}</td>
                  <td className="px-4 py-3 font-mono text-slate-400 tabular-nums">{fmt(row.total_time_ms)}</td>
                  <td className="px-4 py-3 font-mono text-slate-400 tabular-nums">{fmt(row.min_time_ms)}</td>
                  <td className="px-4 py-3 font-mono text-slate-400 tabular-nums">{fmt(row.max_time_ms)}</td>
                  <td className="px-4 py-3 text-slate-400 tabular-nums">{row.row_count ?? row.rows ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400 tabular-nums">{row.hit_percent != null ? `${Number(row.hit_percent).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── REWRITER TAB ──────────────────────────────────────────────────────────────
function RewriterTab() {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (!sql.trim()) return setError("Enter a SQL query.");
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await apiFetch(`/api/optimizer/rewrite`, { method: "POST", body: JSON.stringify({ sql }) });
      setResult(r.suggestions);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">SQL Query to Review</label>
        <SqlEditor value={sql} onChange={setSql} placeholder="SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@gmail.com')" rows={7} />
      </div>
      <button onClick={run} disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
        {loading ? <Spinner sm /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>}
        Analyze SQL
      </button>
      {error && <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">{error}</div>}

      {result && (
        result.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/8 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            No anti-patterns detected. Query looks good!
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">{result.length} issue{result.length !== 1 ? "s" : ""} found</p>
            {result.map((s, i) => (
              <div key={i} className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <SeverityBadge level={s.severity} />
                  <p className="text-sm text-white">{s.issue}</p>
                </div>
                <p className="text-xs text-slate-400">{s.suggestion}</p>
                {s.rewritten_sql && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-1.5">Suggested rewrite:</p>
                    <div className="flex items-start gap-2">
                      <pre className="flex-1 text-xs font-mono text-emerald-300 bg-surface-3 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap">{s.rewritten_sql}</pre>
                      <CopyBtn text={s.rewritten_sql} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "explain",  label: "EXPLAIN",       icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { id: "indexes",  label: "Index Advisor", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
  { id: "slow",     label: "Slow Queries",  icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "rewriter", label: "Rewriter",      icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
];

export default function OptimizerPage() {
  const [connections, setConnections] = useState([]);
  const [connId, setConnId] = useState(null);
  const [activeConn, setActiveConn] = useState(null);
  const [tab, setTab] = useState("explain");

  useEffect(() => {
    apiFetch("/api/connections").then(data => {
      setConnections(data);
      if (data.length > 0 && !connId) { setConnId(data[0].id); setActiveConn(data[0]); }
    }).catch(() => {});
  }, []);

  function selectConn(id) {
    const c = connections.find(x => x.id === Number(id));
    setConnId(Number(id)); setActiveConn(c);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-base font-semibold text-white">Query Optimizer</h1>
          <p className="text-xs text-slate-500 mt-0.5">EXPLAIN visualizer · Index advisor · Slow queries · Query rewriter</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {activeConn && <DbBadge type={activeConn.db_type} />}
          <select value={connId || ""} onChange={e => selectConn(e.target.value)}
            className="bg-surface-2 border border-border text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-accent">
            <option value="" disabled>Select connection</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* No connection state */}
      {!connId && (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            <p className="text-sm">Select a database connection to start optimizing</p>
          </div>
        </div>
      )}

      {connId && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border shrink-0 px-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                  tab === t.id ? "border-violet-500 text-white" : "border-transparent text-slate-400 hover:text-white"
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d={t.icon}/></svg>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === "explain"  && <ExplainTab  connId={connId} />}
            {tab === "indexes"  && <IndexTab    connId={connId} />}
            {tab === "slow"     && <SlowTab     connId={connId} />}
            {tab === "rewriter" && <RewriterTab />}
          </div>
        </div>
      )}
    </div>
  );
}
