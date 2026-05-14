from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import get_current_user
from db_connect import get_connection_or_404, open_db

router = APIRouter(prefix="/api/erd", tags=["erd"])


def _fetch_erd(conn) -> list:
    """Return all tables with columns and FK relationships for one connection."""
    tables = []
    with open_db(conn) as raw:
        cur = raw.cursor()

        if conn.db_type == "postgresql":
            cur.execute("""
                SELECT table_schema, table_name
                FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog','information_schema')
                  AND table_type = 'BASE TABLE'
                ORDER BY table_schema, table_name
            """)
            table_rows = cur.fetchall()

            for schema, tname in table_rows:
                cur.execute("""
                    SELECT c.column_name, c.data_type,
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
                """, (schema, tname, schema, tname))
                cols = [{"name": r[0], "type": r[1], "is_pk": bool(r[2]), "is_fk": False}
                        for r in cur.fetchall()]

                cur.execute("""
                    SELECT kcu.column_name, ccu.table_schema, ccu.table_name, ccu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage ccu
                      ON tc.constraint_name = ccu.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_schema = %s AND tc.table_name = %s
                """, (schema, tname))
                fks = [{"column": r[0], "ref_schema": r[1],
                         "ref_table": r[2], "ref_column": r[3]}
                        for r in cur.fetchall()]

                fk_col_names = {fk["column"] for fk in fks}
                for col in cols:
                    if col["name"] in fk_col_names:
                        col["is_fk"] = True

                tables.append({
                    "schema": schema, "name": tname,
                    "columns": cols, "foreign_keys": fks,
                })

        elif conn.db_type == "sqlserver":  # SQL Server
            cur.execute("""
                SELECT TABLE_SCHEMA, TABLE_NAME
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_SCHEMA, TABLE_NAME
            """)
            table_rows = cur.fetchall()

            for schema, tname in table_rows:
                cur.execute("""
                    SELECT c.COLUMN_NAME, c.DATA_TYPE,
                           CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END
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
                """, (schema, tname, schema, tname))
                cols = [{"name": r[0], "type": r[1], "is_pk": bool(r[2]), "is_fk": False}
                        for r in cur.fetchall()]

                cur.execute("""
                    SELECT c.name, rs.name, rt.name, rc.name
                    FROM sys.foreign_keys fk
                    JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                    JOIN sys.columns c   ON fkc.parent_object_id = c.object_id
                                       AND fkc.parent_column_id = c.column_id
                    JOIN sys.tables pt   ON fkc.parent_object_id = pt.object_id
                    JOIN sys.schemas ps  ON pt.schema_id = ps.schema_id
                    JOIN sys.tables rt   ON fkc.referenced_object_id = rt.object_id
                    JOIN sys.schemas rs  ON rt.schema_id = rs.schema_id
                    JOIN sys.columns rc  ON fkc.referenced_object_id = rc.object_id
                                       AND fkc.referenced_column_id = rc.column_id
                    WHERE ps.name = %s AND pt.name = %s
                """, (schema, tname))
                fks = [{"column": r[0], "ref_schema": r[1],
                         "ref_table": r[2], "ref_column": r[3]}
                        for r in cur.fetchall()]

                fk_col_names = {fk["column"] for fk in fks}
                for col in cols:
                    if col["name"] in fk_col_names:
                        col["is_fk"] = True

                tables.append({
                    "schema": schema, "name": tname,
                    "columns": cols, "foreign_keys": fks,
                })

        if conn.db_type == "mysql":
            cur.execute("""
                SELECT TABLE_NAME FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            """, (conn.database,))
            table_rows = [(conn.database, r[0]) for r in cur.fetchall()]

            for schema, tname in table_rows:
                cur.execute("""
                    SELECT COLUMN_NAME, DATA_TYPE,
                           CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END AS is_pk
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s ORDER BY ORDINAL_POSITION
                """, (schema, tname))
                cols = [{"name": r[0], "type": r[1], "is_pk": bool(r[2]), "is_fk": False}
                        for r in cur.fetchall()]

                cur.execute("""
                    SELECT COLUMN_NAME, REFERENCED_TABLE_SCHEMA,
                           REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                    FROM information_schema.KEY_COLUMN_USAGE
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                      AND REFERENCED_TABLE_NAME IS NOT NULL
                """, (schema, tname))
                fks = [{"column": r[0], "ref_schema": r[1], "ref_table": r[2], "ref_column": r[3]}
                        for r in cur.fetchall()]

                fk_col_names = {fk["column"] for fk in fks}
                for col in cols:
                    if col["name"] in fk_col_names:
                        col["is_fk"] = True

                tables.append({"schema": schema, "name": tname, "columns": cols, "foreign_keys": fks})

    return tables


@router.get("/{conn_id}")
def get_erd(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    tables = _fetch_erd(conn)
    return {
        "connection": {
            "id": conn.id,
            "name": conn.name,
            "db_type": conn.db_type.value,
            "database": conn.database,
        },
        "tables": tables,
    }
