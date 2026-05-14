import os
import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import get_current_user
from db_connect import get_connection_or_404, open_db
import anthropic

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

_client = None
def get_claude():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client


# ── Schema capture (lightweight — names + types only) ────────────────────────

def _get_schema_context(conn) -> str:
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
                           CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END,
                           c.is_nullable
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
                cols = cur.fetchall()

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
                fks = cur.fetchall()

                col_lines = []
                for col in cols:
                    pk = " [PK]" if col[2] else ""
                    null = "" if col[3] == "YES" else " NOT NULL"
                    col_lines.append(f"  - {col[0]}: {col[1]}{pk}{null}")
                fk_lines = [f"  - {fk[0]} → {fk[1]}.{fk[2]}.{fk[3]}" for fk in fks]

                tblock = f"Table: {schema}.{tname}\nColumns:\n" + "\n".join(col_lines)
                if fk_lines:
                    tblock += "\nForeign Keys:\n" + "\n".join(fk_lines)
                tables.append(tblock)

        elif conn.db_type == "sqlserver":  # SQL Server
            cur.execute("""
                SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME
            """)
            table_rows = cur.fetchall()
            for schema, tname in table_rows:
                cur.execute("""
                    SELECT c.COLUMN_NAME, c.DATA_TYPE,
                           CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END,
                           c.IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS c
                    LEFT JOIN (
                        SELECT kcu.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                        WHERE tc.CONSTRAINT_TYPE='PRIMARY KEY'
                          AND tc.TABLE_SCHEMA=%s AND tc.TABLE_NAME=%s
                    ) pk ON c.COLUMN_NAME=pk.COLUMN_NAME
                    WHERE c.TABLE_SCHEMA=%s AND c.TABLE_NAME=%s ORDER BY c.ORDINAL_POSITION
                """, (schema, tname, schema, tname))
                cols = cur.fetchall()

                cur.execute("""
                    SELECT c.name, rs.name, rt.name, rc.name
                    FROM sys.foreign_keys fk
                    JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id
                    JOIN sys.columns c  ON fkc.parent_object_id=c.object_id AND fkc.parent_column_id=c.column_id
                    JOIN sys.tables pt  ON fkc.parent_object_id=pt.object_id
                    JOIN sys.schemas ps ON pt.schema_id=ps.schema_id
                    JOIN sys.tables rt  ON fkc.referenced_object_id=rt.object_id
                    JOIN sys.schemas rs ON rt.schema_id=rs.schema_id
                    JOIN sys.columns rc ON fkc.referenced_object_id=rc.object_id AND fkc.referenced_column_id=rc.column_id
                    WHERE ps.name=%s AND pt.name=%s
                """, (schema, tname))
                fks = cur.fetchall()

                col_lines = []
                for col in cols:
                    pk = " [PK]" if col[2] else ""
                    null = "" if col[3] == "NO" else " NOT NULL"
                    col_lines.append(f"  - {col[0]}: {col[1]}{pk}{null}")
                fk_lines = [f"  - {fk[0]} → {fk[1]}.{fk[2]}.{fk[3]}" for fk in fks]

                tblock = f"Table: {schema}.{tname}\nColumns:\n" + "\n".join(col_lines)
                if fk_lines:
                    tblock += "\nForeign Keys:\n" + "\n".join(fk_lines)
                tables.append(tblock)

        if conn.db_type == "mysql":
            cur.execute("""
                SELECT TABLE_NAME FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME
            """, (conn.database,))
            table_rows = [(conn.database, r[0]) for r in cur.fetchall()]

            for schema, tname in table_rows:
                cur.execute("""
                    SELECT COLUMN_NAME, DATA_TYPE,
                           CASE WHEN COLUMN_KEY='PRI' THEN true ELSE false END,
                           IS_NULLABLE
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s ORDER BY ORDINAL_POSITION
                """, (schema, tname))
                cols = cur.fetchall()

                cur.execute("""
                    SELECT COLUMN_NAME, REFERENCED_TABLE_SCHEMA,
                           REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                    FROM information_schema.KEY_COLUMN_USAGE
                    WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s AND REFERENCED_TABLE_NAME IS NOT NULL
                """, (schema, tname))
                fks = cur.fetchall()

                col_lines = []
                for col in cols:
                    pk = " [PK]" if col[2] else ""
                    null = "" if col[3] == "YES" else " NOT NULL"
                    col_lines.append(f"  - {col[0]}: {col[1]}{pk}{null}")
                fk_lines = [f"  - {fk[0]} → {fk[1]}.{fk[2]}.{fk[3]}" for fk in fks]

                tblock = f"Table: {schema}.{tname}\nColumns:\n" + "\n".join(col_lines)
                if fk_lines:
                    tblock += "\nForeign Keys:\n" + "\n".join(fk_lines)
                tables.append(tblock)

    return "\n\n".join(tables)


# ── Request / Response ────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    table: Optional[str] = None
    history: list[Message] = []


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/{conn_id}/chat")
def chat(
    conn_id: int,
    body: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    schema_ctx = _get_schema_context(conn)

    focus = f"\nThe user is currently focused on table: {body.table}." if body.table else ""

    system = f"""You are an expert database assistant for {conn.db_type.value} databases.
You have full knowledge of the following database schema for database "{conn.database}":{focus}

--- SCHEMA START ---
{schema_ctx}
--- SCHEMA END ---

Guidelines:
- Answer questions about the schema accurately using the tables and columns above.
- When suggesting SQL, always use valid {conn.db_type.value} syntax with real column names from the schema.
- For index suggestions, explain WHY the index would help (query patterns, FK lookups, high-cardinality columns).
- Keep answers focused and practical. Use markdown for formatting.
- If asked about a table not in the schema, say so clearly.
- Do not make up columns or relationships that aren't in the schema."""

    messages = [{"role": m.role, "content": m.content} for m in body.history]
    messages.append({"role": "user", "content": body.message})

    response = get_claude().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        system=system,
        messages=messages,
    )

    return {"reply": response.content[0].text.strip()}
