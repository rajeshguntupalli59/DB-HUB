"""Slow query dashboard for PostgreSQL, SQL Server, and MySQL."""
from __future__ import annotations


def get_slow_queries(raw_conn, db_type: str, limit: int = 20, min_calls: int = 1) -> list[dict]:
    if db_type == "postgresql":
        return _pg_slow(raw_conn, limit, min_calls)
    elif db_type == "mysql":
        return _mysql_slow(raw_conn, limit, min_calls)
    else:
        return _mssql_slow(raw_conn, limit, min_calls)


# ── PostgreSQL ────────────────────────────────────────────────────────────────

def _pg_slow(conn, limit: int, min_calls: int) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'")
        if not cur.fetchone():
            return [{"error": "pg_stat_statements not enabled — run: CREATE EXTENSION pg_stat_statements;"}]
        cur.execute("SHOW server_version_num")
        version = int(cur.fetchone()[0])
        tc = "total_exec_time" if version >= 130000 else "total_time"
        mc = "mean_exec_time"  if version >= 130000 else "mean_time"
        mic = "min_exec_time"  if version >= 130000 else "min_time"
        mac = "max_exec_time"  if version >= 130000 else "max_time"
        cur.execute(f"""
            SELECT query, calls, {tc} AS total_time_ms, {mc} AS mean_time_ms,
                   {mic} AS min_time_ms, {mac} AS max_time_ms, rows AS row_count,
                   100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0) AS hit_percent
            FROM pg_stat_statements
            WHERE calls >= %s ORDER BY {mc} DESC LIMIT %s
        """, (min_calls, limit))
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ── MySQL ─────────────────────────────────────────────────────────────────────

def _mysql_slow(conn, limit: int, min_calls: int) -> list[dict]:
    cursor = conn.cursor()
    try:
        cursor.execute(f"""
            SELECT DIGEST_TEXT AS query, COUNT_STAR AS calls,
                   SUM_TIMER_WAIT/1000000000.0 AS total_time_ms,
                   AVG_TIMER_WAIT/1000000000.0 AS mean_time_ms,
                   MIN_TIMER_WAIT/1000000000.0 AS min_time_ms,
                   MAX_TIMER_WAIT/1000000000.0 AS max_time_ms,
                   SUM_ROWS_SENT AS row_count, NULL AS hit_percent
            FROM performance_schema.events_statements_summary_by_digest
            WHERE DIGEST_TEXT IS NOT NULL AND COUNT_STAR >= {min_calls}
            ORDER BY SUM_TIMER_WAIT DESC LIMIT {limit}
        """)
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception as e:
        return [{"error": f"performance_schema unavailable: {e}"}]


# ── SQL Server ────────────────────────────────────────────────────────────────

def _mssql_slow(conn, limit: int, min_calls: int) -> list[dict]:
    cursor = conn.cursor()
    try:
        cursor.execute(f"""
            SELECT TOP ({limit})
                SUBSTRING(qt.text,(qs.statement_start_offset/2)+1,
                    ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(qt.text)
                      ELSE qs.statement_end_offset END - qs.statement_start_offset)/2)+1) AS query,
                qs.execution_count AS calls,
                qs.total_elapsed_time/1000.0 AS total_time_ms,
                qs.total_elapsed_time/qs.execution_count/1000.0 AS mean_time_ms,
                qs.min_elapsed_time/1000.0 AS min_time_ms,
                qs.max_elapsed_time/1000.0 AS max_time_ms,
                qs.total_rows/qs.execution_count AS row_count,
                (qs.total_logical_reads - qs.total_physical_reads)*100.0
                    /NULLIF(qs.total_logical_reads,0) AS hit_percent
            FROM sys.dm_exec_query_stats qs
            CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
            WHERE qs.execution_count >= {min_calls}
              AND qt.text NOT LIKE '%dm_exec_query_stats%'
            ORDER BY mean_time_ms DESC
        """)
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    except Exception as e:
        return [{"error": f"DMV unavailable: {e}"}]
