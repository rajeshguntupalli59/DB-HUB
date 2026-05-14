import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export default function SetupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/api/auth/setup-required").then(({ setup_required }) => {
      if (!setup_required) navigate("/login");
    });
  }, []);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError("Passwords don't match"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError("");
    setLoading(true);
    try {
      const { access_token } = await api.post("/api/auth/setup", {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      await login(access_token);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">DB Hub</span>
        </div>

        <div className="card p-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-accent text-xs font-bold">1</span>
            </span>
            <h1 className="text-xl font-semibold text-white">Create admin account</h1>
          </div>
          <p className="text-sm text-slate-500 mb-6 ml-7">This is a one-time setup. You'll be the administrator.</p>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Full name</label>
              <input className="input-field" placeholder="Rajesh Guntupalli" value={form.name} onChange={set("name")} required autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input type="email" className="input-field" placeholder="you@example.com" value={form.email} onChange={set("email")} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input type="password" className="input-field" placeholder="Min. 8 characters" value={form.password} onChange={set("password")} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm password</label>
              <input type="password" className="input-field" placeholder="Repeat password" value={form.confirm} onChange={set("confirm")} required />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 mt-2 disabled:opacity-60"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? "Creating account…" : "Create account & continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
