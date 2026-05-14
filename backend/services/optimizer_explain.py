"""EXPLAIN visualizer for PostgreSQL, SQL Server, and MySQL."""
from __future__ import annotations
import json


def run_explain(raw_conn, db_type: str, sql: str, analyze: bool = False, buffers: bool = False) -> dict:
    if db_type == "postgresql":
        return _pg_explain(raw_conn, sql, analyze, buffers)
    elif db_type == "mysql":
        return _mysql_explain(raw_conn, sql, analyze)
    else:
        return _mssql_explain(raw_conn, sql, analyze)


# ── PostgreSQL ────────────────────────────────────────────────────────────────

def _pg_explain(conn, sql: str, analyze: bool, buffers: bool) -> dict:
    opts = ["FORMAT JSON"]
    if analyze:
        opts.append("ANALYZE")
    if buffers and analyze:
        opts.append("BUFFERS")
    cur = conn.cursor()
    cur.execute(f"EXPLAIN ({', '.join(opts)}) {sql}")
    plan_json = cur.fetchone()[0]
    if isinstance(plan_json, str):
        plan_json = json.loads(plan_json)
    summary = _pg_summarize(plan_json)
    return {"plan": plan_json, "summary": summary, "dialect": "postgresql"}


def _pg_summarize(plan: list) -> dict:
    root = plan[0].get("Plan", {})
    warnings: list = []
    _pg_walk(root, warnings)
    return {
        "total_cost": root.get("Total Cost"),
        "startup_cost": root.get("Startup Cost"),
        "plan_rows": root.get("Plan Rows"),
        "node_type": root.get("Node Type"),
        "actual_total_time": root.get("Actual Total Time"),
        "actual_rows": root.get("Actual Rows"),
        "warnings": warnings,
    }


def _pg_walk(node: dict, warnings: list):
    nt = node.get("Node Type", "")
    rows_est = node.get("Plan Rows", 1)
    rows_act = node.get("Actual Rows")
    if rows_act is not None and rows_est > 0:
        ratio = rows_act / rows_est
        if ratio > 10 or ratio < 0.1:
            warnings.append({"type": "row_estimate_off", "node": nt, "estimated": rows_est,
                              "actual": rows_act, "message": f"{nt}: row estimate off by {ratio:.1f}x — run ANALYZE"})
    if nt == "Seq Scan":
        rel = node.get("Relation Name", "?")
        warnings.append({"type": "seq_scan", "node": nt, "relation": rel,
                          "message": f"Sequential scan on '{rel}' — consider an index if table is large"})
    if nt in ("Hash Join", "Nested Loop") and node.get("Total Cost", 0) > 10_000:
        warnings.append({"type": "expensive_join", "node": nt, "cost": node.get("Total Cost"),
                          "message": f"Expensive {nt} (cost {node.get('Total Cost'):.0f}) — verify join columns are indexed"})
    for k in ("Plans", "InitPlan", "SubPlan"):
        for child in node.get(k, []):
            _pg_walk(child, warnings)


# ── MySQL ─────────────────────────────────────────────────────────────────────

def _mysql_explain(conn, sql: str, analyze: bool) -> dict:
    cur = conn.cursor()
    if analyze:
        try:
            cur.execute(f"EXPLAIN ANALYZE {sql}")
            rows = cur.fetchall()
            text = "\n".join(str(r[0]) for r in rows)
            warnings = []
            if "Full table scan" in text:
                warnings.append({"type": "seq_scan", "node": "MySQL", "message": "Full table scan detected"})
            return {
                "plan": [{"Plan": {"Node Type": "MySQL EXPLAIN ANALYZE", "Description": text, "Plans": []}}],
                "summary": {"total_cost": None, "startup_cost": None, "plan_rows": None,
                            "node_type": "MySQL", "actual_total_time": None, "actual_rows": None, "warnings": warnings},
                "dialect": "mysql",
            }
        except Exception:
            pass
    cur.execute(f"EXPLAIN FORMAT=JSON {sql}")
    row = cur.fetchone()
    plan_json = json.loads(row[0])
    tree = _mysql_to_tree(plan_json)
    warnings = _mysql_warnings(plan_json)
    cost = None
    try:
        cost = float(plan_json["query_block"]["cost_info"]["query_cost"])
    except Exception:
        pass
    return {
        "plan": [{"Plan": tree}],
        "summary": {"total_cost": cost, "startup_cost": None, "plan_rows": None,
                    "node_type": "MySQL", "actual_total_time": None, "actual_rows": None, "warnings": warnings},
        "dialect": "mysql",
    }


def _mysql_to_tree(plan: dict) -> dict:
    block = plan.get("query_block", {})
    cost = block.get("cost_info", {}).get("query_cost")
    children = []
    for key in ("table", "nested_loop", "union_result", "ordering_operation", "grouping_operation"):
        val = block.get(key)
        if not val:
            continue
        items = val if isinstance(val, list) else [val]
        for item in items:
            tbl = item.get("table") or item
            cost_info = tbl.get("cost_info", {})
            rc = cost_info.get("read_cost") or cost_info.get("prefix_cost")
            children.append({
                "Node Type": (tbl.get("access_type") or "table").upper(),
                "Relation Name": tbl.get("table_name", "?"),
                "Total Cost": float(rc) if rc else None,
                "Plan Rows": tbl.get("rows_examined_per_scan"),
                "Key": tbl.get("key"),
                "Plans": [],
            })
    return {"Node Type": "MySQL Query", "Total Cost": float(cost) if cost else None, "Plans": children}


def _mysql_warnings(plan: dict) -> list[dict]:
    warnings = []
    block = plan.get("query_block", {})
    for key in ("table", "nested_loop"):
        val = block.get(key)
        if not val:
            continue
        items = val if isinstance(val, list) else [{"table": val}]
        for item in items:
            tbl = item.get("table") or item
            if tbl.get("access_type") == "ALL":
                tname = tbl.get("table_name", "?")
                warnings.append({"type": "seq_scan", "node": "Full Scan", "relation": tname,
                                  "message": f"Full table scan on '{tname}' — add an index on filter/join columns"})
    return warnings


# ── SQL Server ────────────────────────────────────────────────────────────────

def _mssql_explain(conn, sql: str, analyze: bool) -> dict:
    cursor = conn.cursor()
    if analyze:
        cursor.execute("SET STATISTICS PROFILE ON")
    else:
        cursor.execute("SET SHOWPLAN_ALL ON")
    cursor.execute(sql)
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    if analyze:
        while cursor.nextset():
            profile_rows = cursor.fetchall()
            profile_cols = [d[0] for d in cursor.description]
            rows, cols = profile_rows, profile_cols
        cursor.execute("SET STATISTICS PROFILE OFF")
    else:
        cursor.execute("SET SHOWPLAN_ALL OFF")
    plan_rows = [dict(zip(cols, r)) for r in rows]
    tree, summary = _mssql_build_tree(plan_rows, analyze)
    return {"plan": tree, "summary": summary, "dialect": "sqlserver"}


def _mssql_build_tree(rows: list[dict], actual: bool) -> tuple:
    nodes: dict[int, dict] = {}
    for r in rows:
        nid = r.get("NodeId") or r.get("Nodeid") or 0
        node = {
            "Node Type": (r.get("PhysicalOp") or r.get("LogicalOp") or "").strip(),
            "Total Cost": _sf(r.get("TotalSubtreeCost")),
            "Plan Rows": _sf(r.get("EstimateRows")),
            "Description": (r.get("Argument") or r.get("StmtText") or "").strip(),
            "Plans": [], "_parent": r.get("Parent"), "_id": nid,
        }
        if actual:
            node["Actual Rows"] = _sf(r.get("Rows"))
        nodes[nid] = node
    roots = []
    for node in nodes.values():
        pid = node.pop("_parent")
        node.pop("_id")
        if pid is not None and pid in nodes:
            nodes[pid]["Plans"].append(node)
        else:
            roots.append(node)
    warnings = _mssql_warnings(roots[0] if roots else {})
    root = roots[0] if roots else {}
    summary = {"total_cost": root.get("Total Cost"), "startup_cost": None, "plan_rows": root.get("Plan Rows"),
               "node_type": root.get("Node Type"), "actual_total_time": None,
               "actual_rows": root.get("Actual Rows"), "warnings": warnings}
    return [{"Plan": root}], summary


def _mssql_warnings(node: dict) -> list[dict]:
    w: list = []
    _mssql_walk(node, w)
    return w


def _mssql_walk(node: dict, warnings: list):
    nt = node.get("Node Type", "")
    if "Table Scan" in nt or "Clustered Index Scan" in nt:
        warnings.append({"type": "table_scan", "node": nt, "message": f"{nt}: full scan — consider a covering index"})
    est = node.get("Plan Rows", 1) or 1
    act = node.get("Actual Rows")
    if act is not None and est > 0:
        ratio = act / est
        if ratio > 10 or ratio < 0.1:
            warnings.append({"type": "row_estimate_off", "node": nt, "estimated": est, "actual": act,
                              "message": f"{nt}: row estimate off by {ratio:.1f}x — update statistics"})
    if nt in ("Hash Match", "Nested Loops") and (node.get("Total Cost") or 0) > 10_000:
        warnings.append({"type": "expensive_join", "node": nt,
                          "message": f"Expensive {nt} join (cost {node.get('Total Cost'):.0f})"})
    if "KEY LOOKUP" in nt.upper():
        warnings.append({"type": "key_lookup", "node": nt,
                          "message": "Key Lookup — add INCLUDE columns to the non-clustered index"})
    for child in node.get("Plans", []):
        _mssql_walk(child, warnings)


def _sf(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
