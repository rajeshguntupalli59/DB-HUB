import { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext";

const BASE = "http://localhost:8000";

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("db_hub_token");
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

const DEFAULT_PORTS = { postgresql: 5432, sqlserver: 1433, mysql: 3306 };

function Spinner({ sm }) {
  return (
    <span className={`inline-block border-2 border-white/20 border-t-white rounded-full animate-spin ${sm ? "w-3.5 h-3.5" : "w-5 h-5"}`} />
  );
}

function DbBadge({ type }) {
  if (type === "postgresql")
    return <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-400 uppercase tracking-wide"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" />PostgreSQL</span>;
  if (type === "mysql")
    return <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 uppercase tracking-wide"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />MySQL</span>;
  return <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400 uppercase tracking-wide"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />SQL Server</span>;
}

function StatusDot({ ok }) {
  if (ok === null || ok === undefined)
    return <span className="w-2 h-2 rounded-full bg-slate-600" title="Not tested" />;
  return ok
    ? <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Connected" />
    : <span className="w-2 h-2 rounded-full bg-red-400" title="Failed" />;
}

function TestResult({ result }) {
  if (!result) return null;
  return result.ok ? (
    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
      Connected · {result.latency_ms}ms latency
    </div>
  ) : (
    <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
      <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <span className="break-all">{result.error}</span>
    </div>
  );
}


// ── Connection form panel ──────────────────────────────────────────────────

function ConnectionPanel({ conn, onClose, onSaved }) {
  const isEdit = !!conn;
  const [form, setForm] = useState({
    name: conn?.name || "",
    db_type: conn?.db_type || "postgresql",
    host: conn?.host || "",
    port: conn?.port || DEFAULT_PORTS["postgresql"],
    database: conn?.database || "",
    username: conn?.username || "",
    password: "",
    ssl: conn?.ssl || false,
  });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    setTestResult(null);
  }

  function setType(type) {
    setForm(f => ({ ...f, db_type: type, port: DEFAULT_PORTS[type] }));
    setTestResult(null);
  }

  async function handleTest() {
    const needsCreds = form.db_type !== "sqlserver";
    if (!form.host || !form.database || (needsCreds && !form.username)) {
      setError("Fill in Host and Database before testing." + (needsCreds ? " Username is also required." : ""));
      return;
    }
    if (!isEdit && !form.password && needsCreds) {
      setError("Enter a password to test.");
      return;
    }
    setTesting(true); setError(""); setTestResult(null);
    try {
      const res = await apiFetch("/api/connections/test", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          password: form.password || "____placeholder____",
        }),
      });
      setTestResult(res);
    } catch (e) {
      setError(e.message);
    } finally { setTesting(false); }
  }

  async function handleSave() {
    const needsCreds = form.db_type !== "sqlserver";
    if (!form.name || !form.host || !form.database || (needsCreds && !form.username)) {
      setError("Name, Host, and Database are required." + (needsCreds ? " Username is also required." : ""));
      return;
    }
    if (!isEdit && !form.password && needsCreds) {
      setError("Password is required.");
      return;
    }
    setSaving(true); setError("");
    try {
      if (isEdit) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await apiFetch(`/api/connections/${conn.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/connections", { method: "POST", body: JSON.stringify(form) });
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-surface-1 border-l border-border flex flex-col shadow-2xl overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">{isEdit ? "Edit Connection" : "Add Connection"}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{isEdit ? `Editing "${conn.name}"` : "Connect a PostgreSQL, SQL Server, or MySQL database"}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 px-6 py-5 space-y-5">

          {/* DB type */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Database Type</label>
            <div className="grid grid-cols-3 gap-2">
              {["postgresql", "mysql", "sqlserver"].map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  disabled={isEdit}
                  className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm font-medium transition ${
                    form.db_type === t
                      ? t === "postgresql"
                        ? "bg-sky-500/10 border-sky-500/40 text-sky-300"
                      : t === "mysql"
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                        : "bg-orange-500/10 border-orange-500/40 text-orange-300"
                      : "border-border text-slate-400 hover:border-slate-500 hover:text-white"
                  } ${isEdit ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    t === "postgresql" ? "bg-sky-400" : t === "mysql" ? "bg-amber-400" : "bg-orange-400"
                  }`} />
                  {t === "postgresql" ? "PostgreSQL" : t === "mysql" ? "MySQL" : "SQL Server"}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Connection Name</label>
            <input
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent transition"
              placeholder="e.g. Production DB, Analytics"
              value={form.name}
              onChange={e => set("name", e.target.value)}
            />
          </div>

          {/* Host + Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Host</label>
              <input
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent transition"
                placeholder={form.db_type === "sqlserver" ? "localhost or server IP" : "localhost or IP"}
                value={form.host}
                onChange={e => set("host", e.target.value)}
              />
              {form.db_type === "sqlserver" && (
                <p className="text-[10px] text-slate-600 mt-1">For named instances (SQLEXPRESS), use host + actual TCP port</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Port</label>
              <input
                type="number"
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent transition"
                value={form.port}
                onChange={e => set("port", parseInt(e.target.value) || DEFAULT_PORTS[form.db_type])}
              />
            </div>
          </div>

          {/* Database */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Database</label>
            <input
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent transition"
              placeholder={form.db_type === "postgresql" ? "postgres" : form.db_type === "mysql" ? "mydb" : "master"}
              value={form.database}
              onChange={e => set("database", e.target.value)}
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Username {form.db_type === "sqlserver" && <span className="text-slate-600 font-normal">(optional — blank for Windows Auth)</span>}
            </label>
            <input
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent transition"
              placeholder={form.db_type === "postgresql" ? "postgres" : form.db_type === "mysql" ? "root" : "Leave blank for Windows Auth"}
              value={form.username}
              onChange={e => set("username", e.target.value)}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Password {isEdit ? <span className="text-slate-600 font-normal">(leave blank to keep current)</span> : form.db_type === "sqlserver" && <span className="text-slate-600 font-normal">(optional for Windows Auth)</span>}
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent transition"
                placeholder={isEdit ? "••••••••" : "Enter password"}
                value={form.password}
                onChange={e => set("password", e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
              >
                {showPass
                  ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {/* SSL */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm text-white font-medium">Require SSL</p>
              <p className="text-xs text-slate-500 mt-0.5">Encrypt the connection</p>
            </div>
            <button
              onClick={() => set("ssl", !form.ssl)}
              className={`w-11 h-6 rounded-full transition-colors relative ${form.ssl ? "bg-accent" : "bg-surface-4"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.ssl ? "left-5.5" : "left-0.5"}`} style={{ left: form.ssl ? "22px" : "2px" }}/>
            </button>
          </div>

          {/* Test result */}
          <TestResult result={testResult} />

          {/* Error */}
          {error && (
            <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">{error}</div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2.5 border border-border hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition"
          >
            {testing ? <Spinner sm /> : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            )}
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-semibold rounded-lg transition"
          >
            {saving && <Spinner sm />}
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Connection"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Connection card ────────────────────────────────────────────────────────

function ConnectionCard({ conn, onEdit, onDelete, onTest }) {
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    await onTest(conn.id);
    setTesting(false);
  }

  const testedAt = conn.last_tested_at
    ? new Date(conn.last_tested_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="card p-5 flex flex-col gap-4 group hover:border-border/80 transition">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <StatusDot ok={conn.last_test_ok} />
            <DbBadge type={conn.db_type} />
          </div>
          <h3 className="text-sm font-semibold text-white truncate">{conn.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">
            {conn.host}:{conn.port} / {conn.database}
          </p>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={() => onEdit(conn)} title="Edit"
            className="p-1.5 text-slate-500 hover:text-white hover:bg-surface-3 rounded-lg transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={() => onDelete(conn)} title="Delete"
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span>User:</span>
          <span className="text-slate-400 font-medium">{conn.username}</span>
          {conn.ssl && <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded text-[10px]">SSL</span>}
        </span>
        {testedAt && (
          <span className={conn.last_test_ok ? "text-emerald-500" : "text-red-500"}>
            {conn.last_test_ok ? "✓" : "✗"} {testedAt}
          </span>
        )}
      </div>

      {/* Test button */}
      <button
        onClick={handleTest}
        disabled={testing}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border hover:border-accent/50 hover:bg-accent/5 text-slate-400 hover:text-accent text-xs font-medium transition"
      >
        {testing ? <Spinner sm /> : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        )}
        {testing ? "Testing…" : "Test Connection"}
      </button>
    </div>
  );
}


// ── Main page ──────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState(null); // null | "add" | conn object
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const data = await apiFetch("/api/connections");
      setConnections(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleTest(id) {
    try {
      const res = await apiFetch(`/api/connections/${id}/test`, { method: "POST" });
      setConnections(cs => cs.map(c => c.id === id ? res.connection : c));
    } catch {}
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/connections/${deleteTarget.id}`, { method: "DELETE" });
      setConnections(cs => cs.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally { setDeleting(false); }
  }

  const total = connections.length;
  const ok = connections.filter(c => c.last_test_ok === true).length;
  const failed = connections.filter(c => c.last_test_ok === false).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Connections</h1>
          <p className="text-slate-500 text-sm">Manage your PostgreSQL and SQL Server database connections</p>
        </div>
        <button
          onClick={() => setPanel("add")}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-semibold rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Connection
        </button>
      </div>

      {/* Stats */}
      {total > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total", value: total, color: "text-white" },
            { label: "Connected", value: ok, color: "text-emerald-400" },
            { label: "Failed", value: failed, color: failed > 0 ? "text-red-400" : "text-slate-500" },
          ].map(s => (
            <div key={s.label} className="card px-5 py-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
            <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
              <path d="M20 12c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
            </svg>
          </div>
          <h3 className="text-white font-semibold mb-2">No connections yet</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-xs">Add your first PostgreSQL or SQL Server connection to get started.</p>
          <button
            onClick={() => setPanel("add")}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-semibold rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Connection
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connections.map(c => (
            <ConnectionCard
              key={c.id}
              conn={c}
              onEdit={setPanel}
              onDelete={setDeleteTarget}
              onTest={handleTest}
            />
          ))}
        </div>
      )}

      {/* Add / Edit panel */}
      {panel !== null && (
        <ConnectionPanel
          conn={panel === "add" ? null : panel}
          onClose={() => setPanel(null)}
          onSaved={() => { setPanel(null); load(); }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </div>
            <h3 className="text-white font-semibold mb-1">Delete connection?</h3>
            <p className="text-slate-400 text-sm mb-6">
              "<span className="text-white">{deleteTarget.name}</span>" will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 border border-border text-slate-300 hover:text-white text-sm font-medium rounded-lg transition">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2">
                {deleting && <Spinner sm />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
