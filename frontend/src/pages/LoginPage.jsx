import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (user) { navigate("/"); return; }
    api.get("/api/auth/setup-required").then(({ setup_required }) => {
      if (setup_required) navigate("/setup");
    });
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { access_token } = await api.post("/api/auth/login", { email, password });
      await login(access_token);
      navigate("/");
    } catch (err) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── LEFT PANEL — Brand ──────────────────────────────────────── */}
      <div style={{
        flex: "0 0 52%",
        background: "#0a0c12",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 56px",
        position: "relative",
        overflow: "hidden",
      }}>

        {/* Grid background */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

        {/* Glow orbs */}
        <div style={{
          position: "absolute", top: "20%", left: "30%",
          width: 400, height: 400,
          background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "15%", right: "10%",
          width: 250, height: 250,
          background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Center hero content */}
        <div style={{ position: "relative" }}>

          {/* Giant brand name — fills the left panel */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{
              fontSize: "clamp(64px, 8vw, 96px)",
              fontWeight: 900,
              letterSpacing: "0.08em",
              lineHeight: 1,
              margin: "0 0 6px",
              background: "linear-gradient(160deg, #ffffff 0%, #c7d2fe 50%, #818cf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              display: "block",
              width: "100%",
            }}>
              DB HUB
            </h2>
            <div style={{ height: 3, width: "100%", background: "linear-gradient(90deg, #6366f1, #a78bfa, transparent)", borderRadius: 2, marginBottom: 20 }} />
          </div>

          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 20, padding: "5px 14px", marginBottom: 24,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1", boxShadow: "0 0 6px #6366f1" }} />
            <span style={{ fontSize: 12, color: "#818cf8", fontWeight: 500 }}>Database Documentation Platform</span>
          </div>

          <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.65, margin: "0 0 32px", maxWidth: 380 }}>
            AI-generated schema docs, visual ER diagrams, and change tracking — all self-hosted on your own server.
          </p>

          {/* Feature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { icon: "docs",    text: "AI-generated documentation for every table" },
              { icon: "erd",     text: "Interactive ER diagrams with FK relationships" },
              { icon: "tracker", text: "Schema change tracking and diff history" },
              { icon: "lock",    text: "Multi-user with roles — data stays on your server" },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FeatureIcon name={icon} />
                </div>
                <span style={{ fontSize: 13, color: "#64748b" }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p style={{ fontSize: 12, color: "#1e293b", position: "relative" }}>
          Self-hosted · PostgreSQL & SQL Server · No data leaves your server
        </p>
      </div>

      {/* ── RIGHT PANEL — Form ──────────────────────────────────────── */}
      <div style={{
        flex: 1,
        background: "#0d0f18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 40px",
      }}>
        <div style={{ width: "100%", maxWidth: 360 }}>

          {/* Form header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{
              fontSize: 26, fontWeight: 700, color: "#f1f5f9",
              letterSpacing: "-0.03em", margin: "0 0 8px",
            }}>
              Sign in
            </h1>
            <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>
              Welcome back. Enter your credentials below.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 20, padding: "11px 14px", borderRadius: 10,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              color: "#f87171", fontSize: 13, lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            <Field label="Email address">
              <input
                type="email"
                style={inputStyle}
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={e => Object.assign(e.target.style, inputBlurStyle)}
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                style={inputStyle}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={e => Object.assign(e.target.style, inputBlurStyle)}
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                width: "100%", padding: "13px 16px",
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                border: "none", borderRadius: 10,
                color: "white", fontSize: 14, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: loading ? 0.7 : 1,
                transition: "opacity 0.15s, transform 0.1s",
                boxShadow: "0 1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 24px rgba(99,102,241,0.35)",
                letterSpacing: "-0.01em",
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = "0.9"; }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = "1"; }}
            >
              {loading && <Spinner />}
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            margin: "28px 0",
          }}>
            <div style={{ flex: 1, height: 1, background: "#1e2433" }} />
            <span style={{ fontSize: 11, color: "#2d3550" }}>SECURE LOGIN</span>
            <div style={{ flex: 1, height: 1, background: "#1e2433" }} />
          </div>

          {/* Trust footer */}
          <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
            {["Self-hosted", "Encrypted", "No telemetry"].map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="11" height="11" fill="none" stroke="#334155" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span style={{ fontSize: 11, color: "#334155" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #2d3550; }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#64748b", marginBottom: 7, letterSpacing: "0.01em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 14, height: 14, flexShrink: 0,
      border: "2px solid rgba(255,255,255,0.25)",
      borderTopColor: "white", borderRadius: "50%",
      display: "inline-block",
      animation: "spin 0.65s linear infinite",
    }} />
  );
}

function DbIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} fill="none" stroke="white" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7
           M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4
           M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  );
}

function FeatureIcon({ name }) {
  const icons = {
    docs: (
      <svg width="14" height="14" fill="none" stroke="#6366f1" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
      </svg>
    ),
    erd: (
      <svg width="14" height="14" fill="none" stroke="#6366f1" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="2" y="3" width="5" height="5" rx="1"/>
        <rect x="17" y="3" width="5" height="5" rx="1"/>
        <rect x="9.5" y="16" width="5" height="5" rx="1"/>
        <path strokeLinecap="round" d="M4.5 8v3m0 0h7m-7 0v3m15-6v3m0 0h-7"/>
      </svg>
    ),
    tracker: (
      <svg width="14" height="14" fill="none" stroke="#6366f1" strokeWidth="1.8" viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    lock: (
      <svg width="14" height="14" fill="none" stroke="#6366f1" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path strokeLinecap="round" d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
  };
  return icons[name] || null;
}

// ── Input styles ──────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "#0a0c12",
  border: "1px solid #1e2433",
  borderRadius: 10, padding: "12px 14px",
  fontSize: 14, color: "#e2e8f0",
  outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
  fontFamily: "inherit",
};

const inputFocusStyle = {
  borderColor: "#4f46e5",
  boxShadow: "0 0 0 3px rgba(99,102,241,0.12)",
};

const inputBlurStyle = {
  borderColor: "#1e2433",
  boxShadow: "none",
};
