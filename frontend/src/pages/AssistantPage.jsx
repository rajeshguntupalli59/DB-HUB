import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";

// ── Markdown renderer (reuse pattern from DocsPage) ──────────────────────────

function Markdown({ text }) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      out.push(
        <div key={i} style={{ position: "relative", margin: "10px 0" }}>
          {lang && <span style={{ position: "absolute", top: 8, right: 10, fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{lang}</span>}
          <pre style={{ background: "#0a0c12", border: "1px solid #1e2433", borderRadius: 8, padding: "14px 16px", margin: 0, overflowX: "auto", fontSize: 12, lineHeight: 1.7, color: "#a5f3fc", fontFamily: "JetBrains Mono, monospace" }}>
            <code>{code.join("\n")}</code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    if (line.startsWith("### ")) { out.push(<h3 key={i} style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: "14px 0 6px", letterSpacing: "-0.01em" }}>{line.slice(4)}</h3>); i++; continue; }
    if (line.startsWith("## "))  { out.push(<h2 key={i} style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px", letterSpacing: "-0.02em" }}>{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith("# "))   { out.push(<h1 key={i} style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9", margin: "16px 0 8px" }}>{line.slice(2)}</h1>); i++; continue; }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(<li key={i} style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 3 }}>{inlineFormat(lines[i].slice(2))}</li>);
        i++;
      }
      out.push(<ul key={`ul-${i}`} style={{ paddingLeft: 18, margin: "6px 0" }}>{items}</ul>);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i} style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 3 }}>{inlineFormat(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      out.push(<ol key={`ol-${i}`} style={{ paddingLeft: 18, margin: "6px 0" }}>{items}</ol>);
      continue;
    }

    if (line.startsWith("> ")) {
      out.push(<blockquote key={i} style={{ borderLeft: "3px solid #6366f1", paddingLeft: 12, margin: "8px 0", color: "#64748b", fontSize: 13, fontStyle: "italic" }}>{line.slice(2)}</blockquote>);
      i++; continue;
    }

    if (line.trim() === "") { out.push(<div key={i} style={{ height: 8 }} />); i++; continue; }

    out.push(<p key={i} style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.65, margin: "4px 0" }}>{inlineFormat(line)}</p>);
    i++;
  }
  return <div>{out}</div>;
}

function inlineFormat(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} style={{ color: "#e2e8f0", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i} style={{ color: "#cbd5e1" }}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} style={{ background: "#1e2433", color: "#a5f3fc", borderRadius: 4, padding: "1px 5px", fontSize: "0.9em", fontFamily: "monospace" }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

// ── Quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Explain schema", prompt: "Give me an overview of this database schema. What is it used for and how do the tables relate to each other?" },
  { label: "Suggest indexes", prompt: "Which indexes are missing from this schema? Suggest the most impactful ones based on foreign keys and likely query patterns." },
  { label: "Find redundancies", prompt: "Are there any redundant columns, missing constraints, or design issues in this schema I should know about?" },
  { label: "Write a sample query", prompt: "Write a practical SQL query that joins the main tables together and would be useful in a real application." },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [connections, setConnections] = useState([]);
  const [selectedConn, setSelectedConn] = useState(null);
  const [tables, setTables] = useState([]);
  const [focusedTable, setFocusedTable] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/connections`, { headers })
      .then(r => r.json())
      .then(data => {
        setConnections(data);
        if (data.length === 1) setSelectedConn(data[0]);
      });
  }, []);

  useEffect(() => {
    if (!selectedConn) { setTables([]); setMessages([]); setFocusedTable(""); return; }
    fetch(`${API}/api/schema/${selectedConn.id}/tables`, { headers })
      .then(r => r.json())
      .then(data => setTables(data))
      .catch(() => {});
    setMessages([]);
    setFocusedTable("");
  }, [selectedConn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text) {
    const userMsg = text || input.trim();
    if (!userMsg || !selectedConn || loading) return;
    setInput("");

    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/assistant/${selectedConn.id}/chat`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, table: focusedTable || null, history }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── Left sidebar ──────────────────────────────────────────── */}
      <aside style={{
        width: 256, flexShrink: 0,
        borderRight: "1px solid #1e2433",
        background: "#0d0f18",
        display: "flex", flexDirection: "column",
        padding: "16px 0",
      }}>
        <div style={{ padding: "0 16px 16px", borderBottom: "1px solid #1e2433" }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            AI ASSISTANT
          </p>

          {/* Connection */}
          <select
            value={selectedConn?.id || ""}
            onChange={e => setSelectedConn(connections.find(c => c.id === Number(e.target.value)) || null)}
            style={selectStyle}
          >
            <option value="">Select connection…</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Table focus */}
          {tables.length > 0 && (
            <select
              value={focusedTable}
              onChange={e => setFocusedTable(e.target.value)}
              style={{ ...selectStyle, marginTop: 8 }}
            >
              <option value="">All tables</option>
              {tables.map(t => (
                <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>
                  {t.schema}.{t.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Quick actions */}
        {selectedConn && (
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e2433" }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              QUICK ACTIONS
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {QUICK_ACTIONS.map(qa => (
                <button
                  key={qa.label}
                  onClick={() => send(qa.prompt)}
                  disabled={loading}
                  style={{
                    background: "transparent", border: "1px solid #1e2433",
                    borderRadius: 8, padding: "8px 10px",
                    color: "#64748b", fontSize: 12, textAlign: "left",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.color = "#818cf8"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e2433"; e.currentTarget.style.color = "#64748b"; }}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New chat */}
        {messages.length > 0 && (
          <div style={{ padding: "12px 16px" }}>
            <button
              onClick={() => setMessages([])}
              style={{
                background: "transparent", border: "1px solid #1e2433",
                borderRadius: 8, padding: "7px 10px",
                color: "#475569", fontSize: 12, cursor: "pointer",
                width: "100%", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#e2e8f0"; e.currentTarget.style.borderColor = "#2d3550"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#475569"; e.currentTarget.style.borderColor = "#1e2433"; }}
            >
              + New conversation
            </button>
          </div>
        )}
      </aside>

      {/* ── Chat area ─────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0c12", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{
          padding: "14px 24px", borderBottom: "1px solid #1e2433",
          display: "flex", alignItems: "center", gap: 10,
          flexShrink: 0,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" fill="none" stroke="#818cf8" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", margin: 0 }}>
              {selectedConn ? selectedConn.name : "AI Assistant"}
            </p>
            <p style={{ fontSize: 11, color: "#334155", margin: 0 }}>
              {selectedConn
                ? focusedTable
                  ? `Focused on ${focusedTable}`
                  : `${tables.length} tables in context`
                : "Select a connection to start"}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
          {!selectedConn ? (
            <EmptyState />
          ) : messages.length === 0 ? (
            <WelcomeScreen dbName={selectedConn.name} tableCount={tables.length} onAction={send} loading={loading} />
          ) : (
            <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        {selectedConn && (
          <div style={{
            padding: "16px 24px", borderTop: "1px solid #1e2433",
            flexShrink: 0,
          }}>
            <div style={{
              maxWidth: 760, margin: "0 auto",
              display: "flex", gap: 10, alignItems: "flex-end",
            }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything about your schema…"
                rows={1}
                style={{
                  flex: 1, background: "#111118",
                  border: "1px solid #1e2433", borderRadius: 12,
                  padding: "12px 16px", fontSize: 13, color: "#e2e8f0",
                  resize: "none", outline: "none", fontFamily: "inherit",
                  lineHeight: 1.5, maxHeight: 120, overflowY: "auto",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => { e.target.style.borderColor = "#4f46e5"; }}
                onBlur={e => { e.target.style.borderColor = "#1e2433"; }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  width: 42, height: 42, flexShrink: 0,
                  background: !input.trim() || loading ? "#1e2433" : "linear-gradient(135deg, #6366f1, #4f46e5)",
                  border: "none", borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  boxShadow: input.trim() && !loading ? "0 2px 12px rgba(99,102,241,0.35)" : "none",
                }}
              >
                {loading ? (
                  <div style={{ width: 14, height: 14, border: "2px solid #334155", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                ) : (
                  <svg width="16" height="16" fill="none" stroke={input.trim() ? "white" : "#334155"} strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>
            <p style={{ textAlign: "center", fontSize: 11, color: "#1e2433", marginTop: 10 }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        )}
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div style={{
      display: "flex", gap: 12,
      marginBottom: 20,
      flexDirection: isUser ? "row-reverse" : "row",
      alignItems: "flex-start",
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: isUser ? "rgba(99,102,241,0.15)" : "rgba(16,185,129,0.12)",
        border: `1px solid ${isUser ? "rgba(99,102,241,0.3)" : "rgba(16,185,129,0.2)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
        color: isUser ? "#818cf8" : "#34d399",
      }}>
        {isUser ? "U" : "AI"}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: "80%",
        background: isUser ? "rgba(99,102,241,0.08)" : "#111118",
        border: `1px solid ${isUser ? "rgba(99,102,241,0.15)" : "#1e2433"}`,
        borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
        padding: "12px 16px",
      }}>
        {isUser ? (
          <p style={{ fontSize: 13, color: "#c7d2fe", margin: 0, lineHeight: 1.6 }}>{message.content}</p>
        ) : (
          <Markdown text={message.content} />
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-start" }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, color: "#34d399",
      }}>AI</div>
      <div style={{ background: "#111118", border: "1px solid #1e2433", borderRadius: "4px 12px 12px 12px", padding: "14px 18px", display: "flex", gap: 5, alignItems: "center" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: "#334155",
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );
}

function WelcomeScreen({ dbName, tableCount, onAction, loading }) {
  const suggestions = [
    "What does this database store and how are the tables related?",
    "Which foreign keys are missing indexes?",
    "What's the most important table in this schema?",
    "Write a query to get all orders with customer details.",
  ];
  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 24px", textAlign: "center" }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, margin: "0 auto 20px",
        background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="24" height="24" fill="none" stroke="#818cf8" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
        Ask about {dbName}
      </h2>
      <p style={{ fontSize: 13, color: "#475569", margin: "0 0 32px", lineHeight: 1.6 }}>
        I have full knowledge of your {tableCount}-table schema. Ask me anything — table explanations, index suggestions, query help, or design feedback.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, textAlign: "left" }}>
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => onAction(s)}
            disabled={loading}
            style={{
              background: "#111118", border: "1px solid #1e2433", borderRadius: 10,
              padding: "12px 14px", color: "#64748b", fontSize: 12,
              cursor: loading ? "not-allowed" : "pointer", textAlign: "left",
              lineHeight: 1.5, transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.color = "#818cf8"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e2433"; e.currentTarget.style.color = "#64748b"; }}
          >
            "{s}"
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
      <svg width="40" height="40" fill="none" stroke="#1e2433" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
      <p style={{ fontSize: 13, color: "#334155" }}>Select a connection to start chatting</p>
    </div>
  );
}

const selectStyle = {
  width: "100%", background: "#111118",
  border: "1px solid #1e2433", borderRadius: 8,
  color: "#e2e8f0", fontSize: 12, padding: "8px 10px",
  cursor: "pointer", outline: "none", fontFamily: "inherit",
};
