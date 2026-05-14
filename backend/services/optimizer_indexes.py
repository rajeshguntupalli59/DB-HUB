"""Index advisor for PostgreSQL, SQL Server, and MySQL."""
from __future__ import annotations
import re


def recommend_indexes(raw_conn, db_type: str, sql: str) -> list[dict]:
    if db_type == "postgresql":
        return _pg_recommend(raw_conn, sql)
    elif db_type == "mysql":
        return _mysql_recommend(raw_conn, sql)
    else:
        return _mssql_recommend(raw_conn, sql)


# ── Shared helpers ────────────────────────────────────────────────────────────

def _extract_tables(sql: str) -> list[str]:
    pattern = re.compile(r'(?:FROM|JOIN)\s+([\w.\[\]`]+)', re.IGNORECASE)
    return list(dict.fromkeys(m.group(1).strip('[]`') for m in pattern.finditer(sql)))


def _deduplicate(recs: list[dict]) -> list[dict]:
    seen, out = set(), []
    for r in recs:
        key = (r["table"], tuple(r["columns"]))
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


# ── PostgreSQL ────────────────────────────────────────────────────────────────

def _pg_recommend(conn, sql: str) -> list[dict]:
    from psycopg2.extras import RealDictCursor
    recs = []
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        recs.extend(_pg_fk_without_index(cur, sql))
        recs.extend(_pg_infer_from_sql(cur, sql))
    return _deduplicate(recs)


def _pg_fk_without_index(cur, sql: str) -> list[dict]:
    cur.execute("""
        SELECT tc.table_schema, tc.table_name, kcu.column_name, ccu.table_name AS ftable
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name=tc.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY'
          AND NOT EXISTS (
              SELECT 1 FROM pg_indexes
              WHERE schemaname=tc.table_schema AND tablename=tc.table_name
                AND indexdef ILIKE '%' || kcu.column_name || '%'
          )
    """)
    tables_in_sql = {t.lower() for t in _extract_tables(sql)}
    recs = []
    for row in cur.fetchall():
        schema, tname, col, ftable = row["table_schema"], row["table_name"], row["column_name"], row["ftable"]
        if tables_in_sql and tname.lower() not in tables_in_sql and ftable.lower() not in tables_in_sql:
            continue
        recs.append({"table": f"{schema}.{tname}", "columns": [col],
                     "reason": f"FK column '{col}' has no index — can cause slow joins",
                     "ddl": f"CREATE INDEX ON {schema}.{tname} ({col});",
                     "estimated_benefit": "Medium-High"})
    return recs


def _pg_infer_from_sql(cur, sql: str) -> list[dict]:
    recs = []
    upper = sql.upper()
    where_cols = re.findall(r'WHERE\s+\w+\.(\w+)\s*[=<>!]', upper)
    order_cols  = re.findall(r'ORDER\s+BY\s+\w+\.(\w+)', upper)
    tables = _extract_tables(sql)
    if not tables:
        return recs
    parts = tables[0].split(".")
    schema, tname = (parts[0], parts[1]) if len(parts) == 2 else ("public", parts[0])
    for col in set(where_cols):
        if not _pg_index_exists(cur, schema, tname, col.lower()):
            recs.append({"table": f"{schema}.{tname}", "columns": [col.lower()],
                         "reason": f"WHERE column '{col.lower()}' has no index",
                         "ddl": f"CREATE INDEX ON {schema}.{tname} ({col.lower()});",
                         "estimated_benefit": "High"})
    for col in set(order_cols):
        if not _pg_index_exists(cur, schema, tname, col.lower()):
            recs.append({"table": f"{schema}.{tname}", "columns": [col.lower()],
                         "reason": f"ORDER BY column '{col.lower()}' has no index",
                         "ddl": f"CREATE INDEX ON {schema}.{tname} ({col.lower()});",
                         "estimated_benefit": "Medium"})
    return recs


def _pg_index_exists(cur, schema: str, table: str, column: str) -> bool:
    cur.execute("SELECT 1 FROM pg_indexes WHERE schemaname=%s AND tablename=%s AND indexdef ILIKE %s LIMIT 1",
                (schema, table, f"%({column})%"))
    return cur.fetchone() is not None


# ── MySQL ─────────────────────────────────────────────────────────────────────

def _mysql_recommend(conn, sql: str) -> list[dict]:
    cursor = conn.cursor()
    recs = []
    recs.extend(_mysql_fk_without_index(cursor, sql))
    recs.extend(_mysql_infer_from_sql(cursor, sql))
    return _deduplicate(recs)


def _mysql_fk_without_index(cursor, sql: str) -> list[dict]:
    cursor.execute("SELECT DATABASE()")
    db_name = cursor.fetchone()[0]
    cursor.execute("""
        SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME
        FROM information_schema.KEY_COLUMN_USAGE kcu
        WHERE kcu.TABLE_SCHEMA = %s AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM information_schema.STATISTICS s
              WHERE s.TABLE_SCHEMA=kcu.TABLE_SCHEMA AND s.TABLE_NAME=kcu.TABLE_NAME
                AND s.COLUMN_NAME=kcu.COLUMN_NAME AND s.SEQ_IN_INDEX=1
          )
    """, (db_name,))
    tables_in_sql = {t.lower() for t in _extract_tables(sql)}
    recs = []
    for row in cursor.fetchall():
        tname, col, ref = row[0], row[1], row[2]
        if tables_in_sql and tname.lower() not in tables_in_sql and ref.lower() not in tables_in_sql:
            continue
        recs.append({"table": f"{db_name}.{tname}", "columns": [col],
                     "reason": f"FK column `{col}` → `{ref}` has no supporting index",
                     "ddl": f"CREATE INDEX idx_{tname}_{col} ON `{tname}` (`{col}`);",
                     "estimated_benefit": "Medium-High"})
    return recs


def _mysql_infer_from_sql(cursor, sql: str) -> list[dict]:
    cursor.execute("SELECT DATABASE()")
    db_name = cursor.fetchone()[0]
    recs = []
    upper = sql.upper()
    where_cols = re.findall(r'WHERE\s+(?:\w+\.)?(\w+)\s*[=<>!]', upper)
    order_cols  = re.findall(r'ORDER\s+BY\s+(?:\w+\.)?(\w+)', upper)
    tables = _extract_tables(sql)
    if not tables:
        return recs
    tname = tables[0].split(".")[-1]
    for col in set(where_cols):
        if not _mysql_index_exists(cursor, db_name, tname, col.lower()):
            recs.append({"table": f"{db_name}.{tname}", "columns": [col.lower()],
                         "reason": f"WHERE column `{col.lower()}` has no index",
                         "ddl": f"CREATE INDEX idx_{tname}_{col.lower()} ON `{tname}` (`{col.lower()}`);",
                         "estimated_benefit": "High"})
    for col in set(order_cols):
        if not _mysql_index_exists(cursor, db_name, tname, col.lower()):
            recs.append({"table": f"{db_name}.{tname}", "columns": [col.lower()],
                         "reason": f"ORDER BY column `{col.lower()}` has no index",
                         "ddl": f"CREATE INDEX idx_{tname}_{col.lower()} ON `{tname}` (`{col.lower()}`);",
                         "estimated_benefit": "Medium"})
    return recs


def _mysql_index_exists(cursor, db_name: str, table: str, column: str) -> bool:
    cursor.execute("""SELECT 1 FROM information_schema.STATISTICS
                      WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s AND COLUMN_NAME=%s LIMIT 1""",
                   (db_name, table, column))
    return cursor.fetchone() is not None


# ── SQL Server ────────────────────────────────────────────────────────────────

def _mssql_recommend(conn, sql: str) -> list[dict]:
    recs = []
    cursor = conn.cursor()
    recs.extend(_mssql_missing_index_dmv(cursor, sql))
    recs.extend(_mssql_fk_without_index(cursor, sql))
    recs.extend(_mssql_infer_from_sql(cursor, sql))
    return _deduplicate(recs)


def _mssql_missing_index_dmv(cursor, sql: str) -> list[dict]:
    tables_in_sql = {t.lower().strip('[]') for t in _extract_tables(sql)}
    try:
        cursor.execute("""
            SELECT TOP 20 d.statement, d.equality_columns, d.inequality_columns,
                   d.included_columns,
                   gs.avg_total_user_cost * gs.avg_user_impact * (gs.user_seeks + gs.user_scans) AS score
            FROM sys.dm_db_missing_index_details d
            JOIN sys.dm_db_missing_index_groups g ON d.index_handle = g.index_handle
            JOIN sys.dm_db_missing_index_group_stats gs ON g.index_group_handle = gs.group_handle
            ORDER BY score DESC
        """)
    except Exception:
        return []
    cols = [d[0] for d in cursor.description]
    recs = []
    for row in cursor.fetchall():
        r = dict(zip(cols, row))
        full_table = (r["statement"] or "").strip("[]").replace("].[", ".").replace("[", "")
        tname = full_table.split(".")[-1].lower()
        if tables_in_sql and tname not in tables_in_sql:
            continue
        eq   = [c.strip().strip("[]") for c in (r["equality_columns"]   or "").split(",") if c.strip()]
        ineq = [c.strip().strip("[]") for c in (r["inequality_columns"] or "").split(",") if c.strip()]
        inc  = [c.strip().strip("[]") for c in (r["included_columns"]   or "").split(",") if c.strip()]
        keys = eq + ineq
        if not keys:
            continue
        key_part = ", ".join(f"[{c}]" for c in keys)
        inc_part = f" INCLUDE ({', '.join(f'[{c}]' for c in inc)})" if inc else ""
        recs.append({"table": full_table, "columns": keys,
                     "reason": f"SQL Server missing index DMV (score {r['score']:.0f})",
                     "ddl": f"CREATE INDEX IX_{tname}_{'_'.join(keys[:3])} ON [{full_table.replace('.', '].[')}] ({key_part}){inc_part};",
                     "estimated_benefit": "High"})
    return recs


def _mssql_fk_without_index(cursor, sql: str) -> list[dict]:
    tables_in_sql = {t.lower().strip('[]') for t in _extract_tables(sql)}
    try:
        cursor.execute("""
            SELECT OBJECT_SCHEMA_NAME(fk.parent_object_id), OBJECT_NAME(fk.parent_object_id),
                   COL_NAME(fkc.parent_object_id, fkc.parent_column_id)
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id
            WHERE NOT EXISTS (
                SELECT 1 FROM sys.index_columns ic
                JOIN sys.indexes i ON ic.object_id=i.object_id AND ic.index_id=i.index_id
                WHERE ic.object_id=fkc.parent_object_id AND ic.column_id=fkc.parent_column_id AND ic.index_column_id=1
            )
        """)
    except Exception:
        return []
    recs = []
    for schema, tname, col in cursor.fetchall():
        if tables_in_sql and tname.lower() not in tables_in_sql:
            continue
        recs.append({"table": f"{schema}.{tname}", "columns": [col],
                     "reason": f"FK column '[{col}]' has no supporting index",
                     "ddl": f"CREATE INDEX IX_{tname}_{col} ON [{schema}].[{tname}] ([{col}]);",
                     "estimated_benefit": "Medium-High"})
    return recs


def _mssql_infer_from_sql(cursor, sql: str) -> list[dict]:
    recs = []
    upper = sql.upper()
    where_cols = re.findall(r'WHERE\s+(?:\w+\.)?(\w+)\s*[=<>!]', upper)
    order_cols  = re.findall(r'ORDER\s+BY\s+(?:\w+\.)?(\w+)', upper)
    tables = _extract_tables(sql)
    if not tables:
        return recs
    parts = tables[0].split(".")
    schema, tname = (parts[0], parts[1]) if len(parts) == 2 else ("dbo", parts[0])
    for col in set(where_cols):
        if not _mssql_index_exists(cursor, schema, tname, col):
            recs.append({"table": f"{schema}.{tname}", "columns": [col.lower()],
                         "reason": f"WHERE column '[{col.lower()}]' has no index",
                         "ddl": f"CREATE INDEX IX_{tname}_{col.lower()} ON [{schema}].[{tname}] ([{col.lower()}]);",
                         "estimated_benefit": "High"})
    for col in set(order_cols):
        if not _mssql_index_exists(cursor, schema, tname, col):
            recs.append({"table": f"{schema}.{tname}", "columns": [col.lower()],
                         "reason": f"ORDER BY column '[{col.lower()}]' has no index",
                         "ddl": f"CREATE INDEX IX_{tname}_{col.lower()} ON [{schema}].[{tname}] ([{col.lower()}]);",
                         "estimated_benefit": "Medium"})
    return recs


def _mssql_index_exists(cursor, schema: str, table: str, column: str) -> bool:
    try:
        cursor.execute("""
            SELECT 1 FROM sys.indexes i
            JOIN sys.index_columns ic ON i.object_id=ic.object_id AND i.index_id=ic.index_id
            JOIN sys.columns c ON ic.object_id=c.object_id AND ic.column_id=c.column_id
            WHERE OBJECT_SCHEMA_NAME(i.object_id)=%s AND OBJECT_NAME(i.object_id)=%s AND c.name=%s
        """, (schema, table, column))
        return cursor.fetchone() is not None
    except Exception:
        return False
