import { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";

const API = "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Diff display ──────────────────────────────────────────────────────────────

function DiffBadge({ added = 0, dropped = 0, modified = 0 }) {
  const total = added + dropped + modified;
  if (total === 0) return <span className="text-xs text-slate-600">No changes</span>;
  return (
    <div className="flex items-center gap-2">
      {added > 0 && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">+{added}</span>}
      {dropped > 0 && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-500/12 text-red-400 border border-red-500/20">-{dropped}</span>}
      {modified > 0 && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/12 text-amber-400 border border-amber-500/20">~{modified}</span>}
    </div>
  );
}

function ChangePill({ type, children }) {
  const styles = {
    added:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dropped:  "bg-red-500/10 text-red-400 border-red-500/20",
    modified: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${styles[type]}`}>
      {children}
    </span>
  );
}

function DiffView({ diff, from, to }) {
  if (!diff) return null;
  const { added_tables = [], dropped_tables = [], modified_tables = [] } = diff;
  const hasChanges = added_tables.length + dropped_tables.length + modified_tables.length > 0;

  return (
    <div className="flex-1 min-w-0 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 card p-3 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">From</p>
          <p className="text-xs font-medium text-slate-300">{from.label || `Snapshot #${from.id}`}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">{fmtDate(from.taken_at)}</p>
        </div>
        <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1 card p-3 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">To</p>
          <p className="text-xs font-medium text-slate-300">{to.label || `Snapshot #${to.id}`}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">{fmtDate(to.taken_at)}</p>
        </div>
      </div>

      {!hasChanges && (
        <div className="card p-8 text-center">
          <svg className="w-8 h-8 text-emerald-500 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-white mb-1">No schema changes</p>
          <p className="text-xs text-slate-600">The schema is identical between these two snapshots.</p>
        </div>
      )}

      {/* Added tables */}
      {added_tables.length > 0 && (
        <Section title="Added Tables" count={added_tables.length} type="added">
          {added_tables.map(t => (
            <div key={t} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
              <ChangePill type="added">NEW</ChangePill>
              <span className="text-sm font-mono text-emerald-300">{t}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Dropped tables */}
      {dropped_tables.length > 0 && (
        <Section title="Dropped Tables" count={dropped_tables.length} type="dropped">
          {dropped_tables.map(t => (
            <div key={t} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
              <ChangePill type="dropped">DROPPED</ChangePill>
              <span className="text-sm font-mono text-red-300">{t}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Modified tables */}
      {modified_tables.map(t => (
        <Section
          key={`${t.schema}.${t.name}`}
          title={`${t.schema}.${t.name}`}
          type="modified"
          mono
        >
          {/* Added columns */}
          {(t.added_columns || []).map(c => (
            <ChangeRow key={c.name} type="added" label={c.name} detail={c.type} prefix="+ column" />
          ))}
          {/* Dropped columns */}
          {(t.dropped_columns || []).map(name => (
            <ChangeRow key={name} type="dropped" label={name} prefix="- column" />
          ))}
          {/* Modified columns */}
          {(t.modified_columns || []).map(c => (
            <div key={c.name} className="py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-2 mb-1">
                <ChangePill type="modified">CHANGED</ChangePill>
                <span className="text-xs font-mono text-amber-200">{c.name}</span>
              </div>
              {Object.entries(c.changes).map(([field, { old: oldV, new: newV }]) => (
                <div key={field} className="flex items-center gap-2 ml-14 mt-0.5">
                  <span className="text-[10px] text-slate-600 w-12">{field}</span>
                  <span className="text-[11px] font-mono text-red-400 line-through">{String(oldV)}</span>
                  <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  <span className="text-[11px] font-mono text-emerald-400">{String(newV)}</span>
                </div>
              ))}
            </div>
          ))}
          {/* Indexes */}
          {(t.added_indexes || []).map(ix => (
            <ChangeRow key={ix.name} type="added" label={ix.name} detail={ix.columns?.join(", ")} prefix="+ index" />
          ))}
          {(t.dropped_indexes || []).map(name => (
            <ChangeRow key={name} type="dropped" label={name} prefix="- index" />
          ))}
          {/* FKs */}
          {(t.added_foreign_keys || []).map(fk => (
            <ChangeRow key={fk.constraint} type="added" label={fk.column} detail={`→ ${fk.ref_schema}.${fk.ref_table}.${fk.ref_column}`} prefix="+ FK" />
          ))}
          {(t.dropped_foreign_keys || []).map(name => (
            <ChangeRow key={name} type="dropped" label={name} prefix="- FK" />
          ))}
        </Section>
      ))}
    </div>
  );
}

function Section({ title, count, type, children, mono }) {
  const colors = { added: "text-emerald-400", dropped: "text-red-400", modified: "text-amber-400" };
  return (
    <div className="card mb-4 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2">
        <span className={`text-xs font-semibold ${mono ? "font-mono text-white" : colors[type] || "text-white"}`}>{title}</span>
        {count !== undefined && (
          <span className="text-[10px] text-slate-600 ml-auto">{count} table{count !== 1 ? "s" : ""}</span>
        )}
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

function ChangeRow({ type, label, detail, prefix }) {
  const textColors = { added: "text-emerald-300", dropped: "text-red-300", modified: "text-amber-300" };
  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-0">
      <ChangePill type={type}>{prefix}</ChangePill>
      <span className={`text-xs font-mono ${textColors[type]}`}>{label}</span>
      {detail && <span className="text-xs text-slate-600 ml-auto">{detail}</span>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [connections, setConnections] = useState([]);
  const [selectedConn, setSelectedConn] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [taking, setTaking] = useState(false);
  const [label, setLabel] = useState("");
  const [showLabelInput, setShowLabelInput] = useState(false);

  const [selectedA, setSelectedA] = useState(null);
  const [selectedB, setSelectedB] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Load connections
  useEffect(() => {
    fetch(`${API}/api/connections`, { headers })
      .then(r => r.json())
      .then(data => {
        setConnections(data);
        if (data.length === 1) setSelectedConn(data[0]);
      });
  }, []);

  // Load snapshots when connection changes
  useEffect(() => {
    if (!selectedConn) { setSnapshots([]); return; }
    loadSnapshots();
  }, [selectedConn]);

  function loadSnapshots() {
    fetch(`${API}/api/tracker/${selectedConn.id}/snapshots`, { headers })
      .then(r => r.json())
      .then(data => {
        setSnapshots(data);
        // Auto-select latest two for diff
        if (data.length >= 2) {
          setSelectedA(data[1]);
          setSelectedB(data[0]);
        } else {
          setSelectedA(null);
          setSelectedB(null);
          setDiffData(null);
        }
      });
  }

  function takeSnapshot() {
    setTaking(true);
    const url = label.trim()
      ? `${API}/api/tracker/${selectedConn.id}/snapshot?label=${encodeURIComponent(label.trim())}`
      : `${API}/api/tracker/${selectedConn.id}/snapshot`;
    fetch(url, { method: "POST", headers })
      .then(r => r.json())
      .then(() => {
        setLabel("");
        setShowLabelInput(false);
        loadSnapshots();
      })
      .finally(() => setTaking(false));
  }

  function deleteSnapshot(id) {
    fetch(`${API}/api/tracker/${selectedConn.id}/snapshots/${id}`, { method: "DELETE", headers })
      .then(() => loadSnapshots());
  }

  function runDiff() {
    if (!selectedA || !selectedB) return;
    setDiffLoading(true);
    fetch(`${API}/api/tracker/${selectedConn.id}/diff/${selectedA.id}/${selectedB.id}`, { headers })
      .then(r => r.json())
      .then(data => { setDiffData(data); setDiffLoading(false); })
      .catch(() => setDiffLoading(false));
  }

  const diffSummary = diffData?.diff
    ? {
        added: diffData.diff.added_tables?.length || 0,
        dropped: diffData.diff.dropped_tables?.length || 0,
        modified: diffData.diff.modified_tables?.length || 0,
      }
    : null;

  return (
    <div className="flex h-screen overflow-hidden">

      {/* Left panel — snapshots */}
      <aside className="w-72 flex-shrink-0 border-r border-border flex flex-col bg-surface-1">
        {/* Header */}
        <div className="px-4 py-4 border-b border-border">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3">Change Tracker</p>

          {/* Connection picker */}
          <select
            value={selectedConn?.id || ""}
            onChange={e => {
              const c = connections.find(c => c.id === Number(e.target.value));
              setSelectedConn(c || null);
            }}
            className="input-field text-xs mb-3"
          >
            <option value="">Select connection…</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Take snapshot */}
          {selectedConn && (
            <div>
              {showLabelInput ? (
                <div className="flex gap-2">
                  <input
                    className="input-field text-xs flex-1"
                    placeholder="Label (optional)"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && takeSnapshot()}
                    autoFocus
                  />
                  <button
                    onClick={takeSnapshot}
                    disabled={taking}
                    className="btn-primary text-xs px-3 flex-shrink-0"
                  >
                    {taking ? "…" : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLabelInput(true)}
                  className="btn-primary w-full text-xs flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Take Snapshot
                </button>
              )}
            </div>
          )}
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto">
          {!selectedConn ? (
            <p className="text-xs text-slate-600 p-4">Select a connection to view snapshots.</p>
          ) : snapshots.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-slate-600 mb-1">No snapshots yet</p>
              <p className="text-[10px] text-slate-700">Take a snapshot to start tracking changes.</p>
            </div>
          ) : (
            <div className="py-2">
              {snapshots.map((s, i) => {
                const isFrom = selectedA?.id === s.id;
                const isTo = selectedB?.id === s.id;
                return (
                  <div
                    key={s.id}
                    className={`px-4 py-3 border-b border-border cursor-pointer transition-colors duration-100 hover:bg-surface-2 ${
                      isFrom || isTo ? "bg-surface-3" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex gap-1">
                        {isFrom && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-700 text-slate-300">FROM</span>}
                        {isTo && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-accent/20 text-accent">TO</span>}
                      </div>
                      {i === 0 && !isFrom && !isTo && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400">LATEST</span>
                      )}
                      <span className="text-xs text-slate-600 ml-auto">{s.table_count} tables</span>
                    </div>
                    <p className="text-xs font-medium text-white truncate mb-0.5">
                      {s.label || `Snapshot #${s.id}`}
                    </p>
                    <p className="text-[10px] text-slate-600">{relTime(s.taken_at)}</p>

                    {/* Select as A or B */}
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedA(s); setDiffData(null); }}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          isFrom
                            ? "bg-slate-700 text-slate-300 border-slate-600"
                            : "text-slate-600 border-border hover:text-slate-400 hover:border-slate-500"
                        }`}
                      >
                        From
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedB(s); setDiffData(null); }}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          isTo
                            ? "bg-accent/20 text-accent border-accent/30"
                            : "text-slate-600 border-border hover:text-slate-400 hover:border-slate-500"
                        }`}
                      >
                        To
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteSnapshot(s.id); }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-border text-slate-700 hover:text-red-400 hover:border-red-500/30 transition-colors ml-auto"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Right panel — diff view */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        {selectedA && selectedB && selectedA.id !== selectedB.id && (
          <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-surface-1 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono text-slate-400">{selectedA.label || `#${selectedA.id}`}</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-mono text-white">{selectedB.label || `#${selectedB.id}`}</span>
            </div>
            {diffSummary && <DiffBadge {...diffSummary} />}
            <button
              onClick={runDiff}
              disabled={diffLoading}
              className="btn-primary text-xs ml-auto"
            >
              {diffLoading ? "Comparing…" : diffData ? "Refresh Diff" : "Compare →"}
            </button>
          </div>
        )}

        {/* Content */}
        {!selectedConn ? (
          <EmptyState icon="📊" title="Select a connection" sub="Choose a database connection to start tracking schema changes." />
        ) : snapshots.length < 2 ? (
          <EmptyState
            icon="📸"
            title={snapshots.length === 0 ? "No snapshots yet" : "Need one more snapshot"}
            sub={snapshots.length === 0
              ? "Take your first snapshot to capture the current schema state."
              : "Take a second snapshot after making schema changes to see a diff."
            }
          />
        ) : !diffData ? (
          <EmptyState icon="⚡" title="Ready to compare" sub="Select two snapshots on the left and click Compare to see what changed." />
        ) : (
          <DiffView diff={diffData.diff} from={diffData.from} to={diffData.to} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="text-xs text-slate-600 max-w-xs leading-relaxed">{sub}</p>
    </div>
  );
}
