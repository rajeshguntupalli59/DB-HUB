import { useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "../AuthContext";

const API = "http://localhost:8000";

// ── Table Node ───────────────────────────────────────────────────────────────

function TableNode({ data }) {
  return (
    <div className="table-node" style={{
      background: "#1e2433",
      border: "1px solid #2d3550",
      borderRadius: "8px",
      minWidth: "220px",
      maxWidth: "260px",
      fontFamily: "inherit",
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "#252d42",
        borderBottom: "1px solid #2d3550",
        padding: "8px 12px",
      }}>
        <div style={{ fontSize: "10px", color: "#64748b", marginBottom: "2px" }}>{data.schema}</div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", letterSpacing: "-0.01em" }}>
          {data.name}
        </div>
      </div>

      {/* Columns */}
      <div style={{ padding: "4px 0" }}>
        {data.columns.map((col, i) => (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 12px",
            borderBottom: i < data.columns.length - 1 ? "1px solid #1a2030" : "none",
          }}>
            {/* PK / FK badge */}
            {col.is_pk ? (
              <span style={{
                fontSize: "9px", fontWeight: 700, color: "#f59e0b",
                background: "#f59e0b18", border: "1px solid #f59e0b30",
                borderRadius: "3px", padding: "1px 4px", flexShrink: 0,
              }}>PK</span>
            ) : col.is_fk ? (
              <span style={{
                fontSize: "9px", fontWeight: 700, color: "#818cf8",
                background: "#818cf818", border: "1px solid #818cf830",
                borderRadius: "3px", padding: "1px 4px", flexShrink: 0,
              }}>FK</span>
            ) : (
              <span style={{ width: "22px", flexShrink: 0 }} />
            )}
            <span style={{ fontSize: "12px", color: col.is_pk ? "#fde68a" : "#cbd5e1", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {col.name}
            </span>
            <span style={{ fontSize: "10px", color: "#475569", flexShrink: 0 }}>
              {col.type.length > 12 ? col.type.slice(0, 12) + "…" : col.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { tableNode: TableNode };

// ── Layout helper ────────────────────────────────────────────────────────────

function computeLayout(tables) {
  const COLS = 4;
  const COL_WIDTH = 300;
  const ROW_PAD = 60;
  const HEADER_H = 56;
  const COL_H = 26;

  // Group by schema for better layout
  const bySchema = {};
  for (const t of tables) {
    (bySchema[t.schema] = bySchema[t.schema] || []).push(t);
  }

  const nodes = [];
  let globalY = 0;

  for (const [schema, schemaTables] of Object.entries(bySchema)) {
    let rowHeights = [];
    let colIdx = 0;
    let rowMaxH = 0;

    for (let i = 0; i < schemaTables.length; i++) {
      const t = schemaTables[i];
      const h = HEADER_H + t.columns.length * COL_H + 8;
      const x = (colIdx % COLS) * COL_WIDTH;
      const y = globalY + rowHeights.reduce((a, b) => a + b, 0);

      nodes.push({
        id: `${t.schema}.${t.name}`,
        type: "tableNode",
        position: { x, y },
        data: { schema: t.schema, name: t.name, columns: t.columns },
      });

      rowMaxH = Math.max(rowMaxH, h + ROW_PAD);
      colIdx++;
      if (colIdx % COLS === 0) {
        rowHeights.push(rowMaxH);
        rowMaxH = 0;
      }
    }
    if (rowMaxH > 0) rowHeights.push(rowMaxH);
    globalY += rowHeights.reduce((a, b) => a + b, 0) + 60;
  }

  return nodes;
}

function computeEdges(tables) {
  const edges = [];
  const seen = new Set();

  for (const t of tables) {
    for (const fk of t.foreign_keys) {
      const sourceId = `${t.schema}.${t.name}`;
      const targetId = `${fk.ref_schema}.${fk.ref_table}`;
      const edgeId = `${sourceId}→${targetId}`;
      if (seen.has(edgeId) || sourceId === targetId) continue;
      seen.add(edgeId);

      edges.push({
        id: edgeId,
        source: sourceId,
        target: targetId,
        label: `${fk.column} → ${fk.ref_column}`,
        labelStyle: { fill: "#64748b", fontSize: 10 },
        labelBgStyle: { fill: "#131929", fillOpacity: 0.85 },
        style: { stroke: "#4f46e5", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#4f46e5", width: 12, height: 12 },
        type: "smoothstep",
      });
    }
  }
  return edges;
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ERDPage() {
  const { user } = useAuth();
  const token = localStorage.getItem("token");

  const [connections, setConnections] = useState([]);
  const [selectedConn, setSelectedConn] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tableCount, setTableCount] = useState(0);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Load connections
  useEffect(() => {
    fetch(`${API}/api/connections`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setConnections(data);
        if (data.length === 1) setSelectedConn(data[0]);
      });
  }, []);

  // Load ERD when connection selected
  useEffect(() => {
    if (!selectedConn) return;
    setLoading(true);
    setError(null);
    setNodes([]);
    setEdges([]);

    fetch(`${API}/api/erd/${selectedConn.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error("Failed to load schema");
        return r.json();
      })
      .then(data => {
        const tables = data.tables;
        setTableCount(tables.length);
        setNodes(computeLayout(tables));
        setEdges(computeEdges(tables));
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [selectedConn]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        padding: "12px 20px",
        borderBottom: "1px solid #1e2a3a",
        background: "#131929",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="16" height="16" fill="none" stroke="#6366f1" strokeWidth="1.8" viewBox="0 0 24 24">
            <rect x="2" y="3" width="6" height="6" rx="1" />
            <rect x="16" y="3" width="6" height="6" rx="1" />
            <rect x="9" y="15" width="6" height="6" rx="1" />
            <path d="M5 9v3m0 0h7m-7 0v3m14-6v3m0 0h-7" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0" }}>ER Diagram</span>
        </div>

        {/* Connection picker */}
        <select
          value={selectedConn?.id || ""}
          onChange={e => {
            const c = connections.find(c => c.id === Number(e.target.value));
            setSelectedConn(c || null);
          }}
          style={{
            background: "#1e2433", border: "1px solid #2d3550", borderRadius: "6px",
            color: "#e2e8f0", fontSize: "13px", padding: "6px 10px", cursor: "pointer",
          }}
        >
          <option value="">Select connection…</option>
          {connections.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.db_type})</option>
          ))}
        </select>

        {/* Stats */}
        {tableCount > 0 && !loading && (
          <span style={{ fontSize: "12px", color: "#64748b" }}>
            {tableCount} tables · {edges.length} relationships
          </span>
        )}

        {loading && (
          <span style={{ fontSize: "12px", color: "#64748b" }}>Loading schema…</span>
        )}

        {error && (
          <span style={{ fontSize: "12px", color: "#f87171" }}>{error}</span>
        )}

        {/* Legend */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "16px" }}>
          <LegendItem color="#f59e0b" bg="#f59e0b18" border="#f59e0b30" label="Primary Key" badge="PK" />
          <LegendItem color="#818cf8" bg="#818cf818" border="#818cf830" label="Foreign Key" badge="FK" />
          <LegendItem line="#4f46e5" label="Relationship" />
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, background: "#0d1117" }}>
        {!selectedConn ? (
          <EmptyState />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e2433" gap={24} size={1} />
            <Controls style={{ background: "#1e2433", border: "1px solid #2d3550", borderRadius: "8px" }} />
            <MiniMap
              style={{ background: "#131929", border: "1px solid #2d3550", borderRadius: "8px" }}
              nodeColor="#252d42"
              maskColor="rgba(13,17,23,0.7)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, bg, border, label, badge, line }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {badge ? (
        <span style={{ fontSize: "9px", fontWeight: 700, color, background: bg, border: `1px solid ${border}`, borderRadius: "3px", padding: "1px 4px" }}>
          {badge}
        </span>
      ) : (
        <div style={{ width: "20px", height: "2px", background: line, borderRadius: "1px" }} />
      )}
      <span style={{ fontSize: "11px", color: "#64748b" }}>{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" }}>
      <svg width="48" height="48" fill="none" stroke="#2d3550" strokeWidth="1.5" viewBox="0 0 24 24">
        <rect x="2" y="3" width="6" height="6" rx="1" />
        <rect x="16" y="3" width="6" height="6" rx="1" />
        <rect x="9" y="15" width="6" height="6" rx="1" />
        <path d="M5 9v3m0 0h7m-7 0v3m14-6v3m0 0h-7" strokeLinecap="round" />
      </svg>
      <p style={{ color: "#475569", fontSize: "14px" }}>Select a connection to view the ER diagram</p>
    </div>
  );
}
