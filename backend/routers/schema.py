from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import get_current_user
from db_connect import get_connection_or_404, open_db

router = APIRouter(prefix="/api/schema", tags=["schema"])


# ── Table list ─────────────────────────────────────────────────────────────

@router.get("/{conn_id}/tables")
def list_tables(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    with open_db(conn) as raw:
        cur = raw.cursor()
        if conn.db_type == "postgresql":
            cur.execute("""
                SELECT t.table_schema, t.table_name,
                       COALESCE(s.n_live_tup, 0) AS row_estimate
                FROM information_schema.tables t
                LEFT JOIN pg_stat_user_tables s
                       ON s.schemaname = t.table_schema AND s.relname = t.table_name
                WHERE t.table_type = 'BASE TABLE'
                  AND t.table_schema NOT IN ('pg_catalog','information_schema')
                ORDER BY t.table_schema, t.table_name
            """)
            rows = cur.fetchall()
            return [{"schema": r[0], "name": r[1], "row_estimate": r[2]} for r in rows]

        elif conn.db_type == "mysql":
            cur.execute("""
                SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_ROWS
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            """, (conn.database,))
            rows = cur.fetchall()
            return [{"schema": r[0], "name": r[1], "row_estimate": r[2] or 0} for r in rows]

        else:  # sqlserver
            cur.execute("""
                SELECT s.name AS schema_name, t.name AS table_name,
                       p.rows AS row_estimate
                FROM sys.tables t
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
                ORDER BY s.name, t.name
            """)
            rows = cur.fetchall()
            return [{"schema": r[0], "name": r[1], "row_estimate": r[2] or 0} for r in rows]


# ── Table detail ───────────────────────────────────────────────────────────

@router.get("/{conn_id}/tables/{schema}/{table}")
def get_table(
    conn_id: int,
    schema: str,
    table: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    with open_db(conn) as raw:
        cur = raw.cursor()

        if conn.db_type == "postgresql":
            # Columns
            cur.execute("""
                SELECT c.column_name, c.data_type, c.is_nullable,
                       c.column_default, c.ordinal_position,
                       CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT kcu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                      AND tc.table_schema = %s AND tc.table_name = %s
                ) pk ON c.column_name = pk.column_name
                WHERE c.table_schema = %s AND c.table_name = %s
                ORDER BY c.ordinal_position
            """, (schema, table, schema, table))
            cols = [
                {"name": r[0], "type": r[1], "nullable": r[2] == "YES",
                 "default": r[3], "position": r[4], "is_pk": r[5]}
                for r in cur.fetchall()
            ]

            # Indexes
            cur.execute("""
                SELECT i.relname AS index_name,
                       ix.indisunique AS is_unique,
                       ix.indisprimary AS is_primary,
                       array_agg(a.attname ORDER BY k.pos) AS columns
                FROM pg_class t
                JOIN pg_index ix ON t.oid = ix.indrelid
                JOIN pg_class i  ON i.oid = ix.indexrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, pos) ON true
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                WHERE n.nspname = %s AND t.relname = %s
                GROUP BY i.relname, ix.indisunique, ix.indisprimary
                ORDER BY i.relname
            """, (schema, table))
            idxs = [
                {"name": r[0], "unique": r[1], "primary": r[2], "columns": list(r[3])}
                for r in cur.fetchall()
            ]

            # Foreign keys
            cur.execute("""
                SELECT kcu.column_name, ccu.table_schema, ccu.table_name, ccu.column_name,
                       tc.constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema = %s AND tc.table_name = %s
            """, (schema, table))
            fks = [
                {"column": r[0], "ref_schema": r[1], "ref_table": r[2],
                 "ref_column": r[3], "constraint": r[4]}
                for r in cur.fetchall()
            ]

        elif conn.db_type == "mysql":
            # Columns
            cur.execute("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
                       ORDINAL_POSITION,
                       CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END AS is_pk
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
            """, (schema, table))
            cols = [
                {"name": r[0], "type": r[1], "nullable": r[2] == "YES",
                 "default": r[3], "position": r[4], "is_pk": bool(r[5])}
                for r in cur.fetchall()
            ]

            # Indexes
            cur.execute("""
                SELECT INDEX_NAME, MAX(NON_UNIQUE) = 0 AS is_unique,
                       INDEX_NAME = 'PRIMARY' AS is_primary,
                       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                GROUP BY INDEX_NAME
                ORDER BY INDEX_NAME
            """, (schema, table))
            idxs = [
                {"name": r[0], "unique": bool(r[1]), "primary": bool(r[2]),
                 "columns": r[3].split(",") if r[3] else []}
                for r in cur.fetchall()
            ]

            # Foreign keys
            cur.execute("""
                SELECT COLUMN_NAME, REFERENCED_TABLE_SCHEMA,
                       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                  AND REFERENCED_TABLE_NAME IS NOT NULL
            """, (schema, table))
            fks = [
                {"column": r[0], "ref_schema": r[1], "ref_table": r[2],
                 "ref_column": r[3], "constraint": r[4]}
                for r in cur.fetchall()
            ]

        else:  # sqlserver
            # Columns
            cur.execute("""
                SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE,
                       c.COLUMN_DEFAULT, c.ORDINAL_POSITION,
                       CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_pk
                FROM INFORMATION_SCHEMA.COLUMNS c
                LEFT JOIN (
                    SELECT kcu.COLUMN_NAME
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                      ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                      AND tc.TABLE_SCHEMA = %s AND tc.TABLE_NAME = %s
                ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
                WHERE c.TABLE_SCHEMA = %s AND c.TABLE_NAME = %s
                ORDER BY c.ORDINAL_POSITION
            """, (schema, table, schema, table))
            cols = [
                {"name": r[0], "type": r[1], "nullable": r[2] == "YES",
                 "default": r[3], "position": r[4], "is_pk": bool(r[5])}
                for r in cur.fetchall()
            ]

            # Indexes
            cur.execute("""
                SELECT i.name, i.is_unique, i.is_primary_key,
                       STRING_AGG(c.name, ', ') AS columns
                FROM sys.indexes i
                JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                JOIN sys.tables t ON i.object_id = t.object_id
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name = %s AND t.name = %s AND i.type > 0
                GROUP BY i.name, i.is_unique, i.is_primary_key
                ORDER BY i.name
            """, (schema, table))
            idxs = [
                {"name": r[0], "unique": bool(r[1]), "primary": bool(r[2]),
                 "columns": [c.strip() for c in r[3].split(",")]}
                for r in cur.fetchall()
            ]

            # Foreign keys
            cur.execute("""
                SELECT c.name, rs.name, rt.name, rc.name, fk.name
                FROM sys.foreign_keys fk
                JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                JOIN sys.columns c  ON fkc.parent_object_id = c.object_id   AND fkc.parent_column_id = c.column_id
                JOIN sys.tables  pt ON fkc.parent_object_id = pt.object_id
                JOIN sys.schemas ps ON pt.schema_id = ps.schema_id
                JOIN sys.tables  rt ON fkc.referenced_object_id = rt.object_id
                JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
                JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
                WHERE ps.name = %s AND pt.name = %s
            """, (schema, table))
            fks = [
                {"column": r[0], "ref_schema": r[1], "ref_table": r[2],
                 "ref_column": r[3], "constraint": r[4]}
                for r in cur.fetchall()
            ]

        return {"schema": schema, "name": table, "columns": cols,
                "indexes": idxs, "foreign_keys": fks}
