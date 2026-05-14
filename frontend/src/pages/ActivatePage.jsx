import { useState } from "react";

const BASE = "http://localhost:8000";

export default function ActivatePage({ onActivated }) {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleActivate(e) {
    e.preventDefault();
    if (!key.trim()) { setError("Please enter your license key."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BASE}/api/license/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = await res.json();
      if (data.activated) {
        onActivated();
      } else {
        setError(data.error || "Activation failed. Check your key and try again.");
      }
    } catch {
      setError("Could not reach the server. Make sure DB Hub backend is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-indigo-500 flex items-center justify-center shadow-lg shadow-accent/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="3"/><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="12" cy="19" r="3"/>
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-wide text-white">DB HUB</span>
        </div>

        {/* Card */}
        <div className="bg-surface-1 border border-border rounded-2xl p-8 shadow-2xl">
          {/* Lock icon */}
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>

          <h1 className="text-xl font-bold text-white text-center mb-2">Activate DB Hub</h1>
          <p className="text-slate-400 text-sm text-center mb-8 leading-relaxed">
            Enter the license key from your purchase email to unlock DB Hub.
          </p>

          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">License Key</label>
              <input
                type="text"
                value={key}
                onChange={e => { setKey(e.target.value); setError(""); }}
                placeholder="DBHUB-XXXX-XXXX-XXXX-XXXX"
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-white text-sm font-mono placeholder-slate-600 focus:outline-none focus:border-accent transition tracking-wider"
                autoFocus
                spellCheck={false}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-accent hover:bg-accent/90 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-accent/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Activating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  Activate DB Hub
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-600 mt-6 leading-relaxed">
            Don't have a license?{" "}
            <a
              href="https://dbhub.lemonsqueezy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent/80 transition"
            >
              Purchase DB Hub →
            </a>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-700 mt-6">
          DB Hub · Self-hosted database platform
        </p>
      </div>
    </div>
  );
}
