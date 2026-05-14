import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

function RoleBadge({ role }) {
  const styles = {
    admin: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
    editor: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    viewer: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  };
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${styles[role] || styles.viewer} capitalize`}>
      {role}
    </span>
  );
}

function StatusDot({ active }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? "bg-emerald-400" : "bg-slate-600"}`} />
      <span className={`text-xs ${active ? "text-slate-300" : "text-slate-600"}`}>{active ? "Active" : "Suspended"}</span>
    </span>
  );
}

function Avatar({ name }) {
  return (
    <div className="w-8 h-8 rounded-full bg-surface-4 border border-border flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-semibold text-slate-300">{name?.charAt(0).toUpperCase()}</span>
    </div>
  );
}

function InvitePanel({ onClose, onInvited }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "viewer" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const firstRef = useRef();

  useEffect(() => { firstRef.current?.focus(); }, []);

  function set(field) { return (e) => setForm((f) => ({ ...f, [field]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError("");
    setLoading(true);
    try {
      const user = await api.post("/api/users", form);
      onInvited(user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface-1 border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-white">Invite team member</h2>
            <p className="text-xs text-slate-500 mt-0.5">They'll be able to log in immediately.</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-6 space-y-5">
          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Full name</label>
            <input ref={firstRef} className="input-field" placeholder="Jane Smith" value={form.name} onChange={set("name")} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address</label>
            <input type="email" className="input-field" placeholder="jane@company.com" value={form.email} onChange={set("email")} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Temporary password</label>
            <input type="password" className="input-field" placeholder="Min. 8 characters" value={form.password} onChange={set("password")} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Role</label>
            <div className="space-y-2">
              {[
                { value: "viewer", label: "Viewer", desc: "Can view schema documentation only" },
                { value: "editor", label: "Editor", desc: "Can edit descriptions and annotations" },
                { value: "admin", label: "Admin", desc: "Full access including team management" },
              ].map((r) => (
                <label
                  key={r.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors duration-100 ${
                    form.role === r.value
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={form.role === r.value}
                    onChange={set("role")}
                    className="mt-0.5 accent-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{r.label}</p>
                    <p className="text-xs text-slate-500">{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </form>

        {/* Footer actions */}
        <div className="border-t border-border px-6 py-4 flex items-center gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-60"
          >
            {loading && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {loading ? "Inviting…" : "Invite member"}
          </button>
        </div>
      </div>
    </>
  );
}

function EditRoleMenu({ user, onUpdate, onClose }) {
  return (
    <div className="absolute right-0 top-8 z-30 bg-surface-2 border border-border rounded-xl shadow-2xl py-1 w-40">
      {["admin", "editor", "viewer"].map((role) => (
        <button
          key={role}
          onClick={() => { onUpdate(user.id, { role }); onClose(); }}
          className={`w-full text-left px-3 py-2 text-sm transition-colors capitalize ${
            user.role === role ? "text-accent font-medium" : "text-slate-300 hover:bg-surface-3"
          }`}
        >
          {user.role === role && <span className="mr-1.5">✓</span>}
          {role}
        </button>
      ))}
      <div className="border-t border-border mt-1 pt-1">
        <button
          onClick={() => { onUpdate(user.id, { is_active: !user.is_active }); onClose(); }}
          className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-surface-3 transition-colors"
        >
          {user.is_active ? "Suspend" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);

  useEffect(() => {
    api.get("/api/users").then(setUsers).finally(() => setLoading(false));
  }, []);

  function handleInvited(newUser) {
    setUsers((prev) => [...prev, newUser]);
  }

  async function handleUpdate(id, changes) {
    try {
      const updated = await api.put(`/api/users/${id}`, changes);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remove this user? This cannot be undone.")) return;
    try {
      await api.delete(`/api/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Team</h1>
          <p className="text-slate-500 text-sm">Manage who has access to this DB Hub instance.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Invite member
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total members", value: users.length },
          { label: "Active", value: users.filter((u) => u.is_active).length },
          { label: "Admins", value: users.filter((u) => u.role === "admin").length },
        ].map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <p className="text-2xl font-semibold text-white">{loading ? "—" : stat.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium text-white">Members</span>
          <span className="text-xs text-slate-500">{users.length} total</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-widest px-5 py-3">Member</th>
                <th className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-widest px-4 py-3">Role</th>
                <th className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-widest px-4 py-3">Status</th>
                <th className="text-left text-[11px] font-semibold text-slate-600 uppercase tracking-widest px-4 py-3">Joined</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-2/40 transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} />
                      <div>
                        <p className="text-sm font-medium text-white leading-none mb-1">
                          {u.name}
                          {u.id === currentUser?.id && (
                            <span className="ml-2 text-[10px] text-slate-500 font-normal">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusDot active={u.is_active} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-slate-500">
                      {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3.5">
                      <div className="relative flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {u.id !== currentUser?.id && (
                          <>
                            <button
                              onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                              className="btn-ghost px-2 py-1 text-xs"
                            >
                              Change role
                            </button>
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="text-slate-600 hover:text-red-400 transition-colors px-2 py-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                            {menuOpen === u.id && (
                              <EditRoleMenu
                                user={u}
                                onUpdate={handleUpdate}
                                onClose={() => setMenuOpen(null)}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showInvite && <InvitePanel onClose={() => setShowInvite(false)} onInvited={handleInvited} />}
    </div>
  );
}
