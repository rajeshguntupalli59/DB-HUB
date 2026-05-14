import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

const API = "http://localhost:8000";

// ── Module definitions ───────────────────────────────────────────────────────

const MODULES = [
  {
    label: "Team & Access",
    description: "Manage users, roles, and permissions across your organization.",
    href: "/users",
    status: "live",
    accent: "#6366f1",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "Connections",
    description: "Connect PostgreSQL, SQL Server, and MySQL databases with encrypted credentials.",
    href: "/connections",
    status: "live",
    accent: "#10b981",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
    ),
  },
  {
    label: "Schema Browser",
    description: "Explore tables, columns, indexes, and foreign keys in real time.",
    href: "/schema",
    status: "live",
    accent: "#f59e0b",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18" />
      </svg>
    ),
  },
  {
    label: "Documentation",
    description: "AI-generated markdown docs for every table. Export and share with your team.",
    href: "/docs",
    status: "live",
    accent: "#06b6d4",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    label: "ER Diagram",
    description: "Interactive visual map of your schema with draggable tables and relationship lines.",
    href: "/erd",
    status: "live",
    accent: "#8b5cf6",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
        <rect x="2" y="3" width="6" height="6" rx="1" />
        <rect x="16" y="3" width="6" height="6" rx="1" />
        <rect x="9" y="15" width="6" height="6" rx="1" />
        <path strokeLinecap="round" d="M5 9v3m0 0h7m-7 0v3m14-6v3m0 0h-7" />
      </svg>
    ),
  },
  {
    label: "Change Tracker",
    description: "Snapshot your schema over time and diff against any prior state.",
    href: "/tracker",
    status: "live",
    accent: "#f97316",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    label: "AI Assistant",
    description: "Ask questions about your schema, get index suggestions and query help.",
    href: "/assistant",
    status: "live",
    accent: "#ec4899",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
    ),
  },
  {
    label: "Query Optimizer",
    description: "EXPLAIN plans, index advisor, slow query analysis, and SQL anti-pattern rewriter.",
    href: "/optimizer",
    status: "live",
    accent: "#7c3aed",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
];

const LIVE_COUNT = MODULES.filter(m => m.status === "live").length;
const TOTAL_COUNT = MODULES.length;

// ── Greeting ─────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [connCount, setConnCount] = useState(null);
  const [userCount, setUserCount] = useState(null);
  const [activeConns, setActiveConns] = useState(0);

  useEffect(() => {
    const h = { Authorization: `Bearer ${token}` };
    fetch(`${API}/api/connections`, { headers: h })
      .then(r => r.json())
      .then(data => {
        setConnCount(data.length);
        setActiveConns(data.filter(c => c.last_test_ok).length);
      })
      .catch(() => {});
    fetch(`${API}/api/users`, { headers: h })
      .then(r => r.json())
      .then(data => setUserCount(data.length))
      .catch(() => {});
  }, []);

  return (
    <div className="p-8 max-w-6xl">

      {/* Header */}
      <div className="mb-10">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mb-2">
          DB Hub · Database Documentation Platform
        </p>
        <h1 className="text-3xl font-semibold text-white tracking-tight">
          {greeting()}, {user?.name?.split(" ")[0]}
        </h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <StatCard
          label="Connections"
          value={connCount}
          sub={activeConns > 0 ? `${activeConns} reachable` : "None tested yet"}
          subOk={activeConns > 0}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="#10b981" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          }
        />
        <StatCard
          label="Team Members"
          value={userCount}
          sub={user?.role === "admin" ? "You are admin" : `Your role: ${user?.role}`}
          subOk
          icon={
            <svg className="w-4 h-4" fill="none" stroke="#6366f1" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <StatCard
          label="Modules Active"
          value={`${LIVE_COUNT} / ${TOTAL_COUNT}`}
          sub="All modules live"
          subOk={true}
          progress={LIVE_COUNT / TOTAL_COUNT}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="#8b5cf6" strokeWidth="1.8" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          }
        />
      </div>

      {/* Module grid */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Modules</h2>
          <span className="text-xs text-slate-600">{LIVE_COUNT} live</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULES.map(mod => (
            <ModuleCard key={mod.label} {...mod} navigate={navigate} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, subOk, icon, progress }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div className="w-7 h-7 rounded-md bg-surface-3 border border-border flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-semibold text-white mb-1 tabular-nums">
        {value === null ? (
          <span className="text-slate-600">—</span>
        ) : value}
      </div>
      {progress !== undefined && (
        <div className="h-1 bg-surface-3 rounded-full mb-2 overflow-hidden">
          <div
            className="h-1 rounded-full bg-violet-500 transition-all duration-700"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
      <p className={`text-xs ${subOk ? "text-emerald-500" : "text-slate-600"}`}>{sub}</p>
    </div>
  );
}

// ── Module Card ───────────────────────────────────────────────────────────────

function ModuleCard({ label, description, href, status, accent, icon, navigate }) {
  const isLive = status === "live";

  return (
    <div
      onClick={() => isLive && navigate(href)}
      className={`card p-5 group transition-all duration-150 ${
        isLive
          ? "cursor-pointer hover:border-slate-600"
          : "opacity-40 cursor-default"
      }`}
      style={isLive ? { "--accent": accent } : {}}
    >
      <div className="flex items-start justify-between mb-4">
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-150"
          style={{
            background: isLive ? `${accent}18` : "#1c1c28",
            border: `1px solid ${isLive ? `${accent}30` : "#2a2a3d"}`,
            color: isLive ? accent : "#475569",
            width: "36px",
            height: "36px",
          }}
        >
          <div style={{ width: 16, height: 16 }}>{icon}</div>
        </div>

        {/* Badge + Arrow */}
        <div className="flex items-center gap-2">
          {isLive ? (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: `${accent}18`,
                color: accent,
                border: `1px solid ${accent}30`,
              }}
            >
              Live
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-3 text-slate-600 border border-border">
              Soon
            </span>
          )}
          {isLive && (
            <svg
              className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all duration-150"
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Label + description */}
      <p className="text-sm font-semibold text-white mb-1.5 group-hover:text-white transition-colors">{label}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}
