import os
import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_
from database import get_db
from models import User, Connection, TableDoc
from auth import get_current_user
from db_connect import get_connection_or_404, open_db
import anthropic

router = APIRouter(prefix="/api/docs", tags=["docs"])

_client = None
def get_claude():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client


# ── Helpers ────────────────────────────────────────────────────────────────

def _fetch_table_schema(conn: Connection, schema: str, table: str) -> dict:
    """Pull columns, indexes and FKs for one table — reuses schema router logic."""
    from routers.schema import get_table
    # We call the DB directly to avoid HTTP overhead
    with open_db(conn) as raw:
        cur = raw.cursor()
        if conn.db_type == "postgresql":
            cur.execute("""
                SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                       c.ordinal_position,
                       CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT kcu.column_name FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = %s AND tc.table_name = %s
                ) pk ON c.column_name = pk.column_name
                WHERE c.table_schema = %s AND c.table_name = %s ORDER BY c.ordinal_position
            """, (schema, table, schema, table))
            cols = [{"name": r[0], "type": r[1], "nullable": r[2]=="YES", "default": r[3], "is_pk": r[5]}
                    for r in cur.fetchall()]

            cur.execute("""
                SELECT kcu.column_name, ccu.table_schema, ccu.table_name, ccu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = %s AND tc.table_name = %s
            """, (schema, table))
            fks = [{"column": r[0], "ref_schema": r[1], "ref_table": r[2], "ref_column": r[3]}
                   for r in cur.fetchall()]

        elif conn.db_type == "mysql":
            cur.execute("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION,
                       CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s ORDER BY ORDINAL_POSITION
            """, (schema, table))
            cols = [{"name": r[0], "type": r[1], "nullable": r[2]=="YES", "default": r[3], "is_pk": bool(r[5])}
                    for r in cur.fetchall()]

            cur.execute("""
                SELECT COLUMN_NAME, REFERENCED_TABLE_SCHEMA,
                       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                  AND REFERENCED_TABLE_NAME IS NOT NULL
            """, (schema, table))
            fks = [{"column": r[0], "ref_schema": r[1], "ref_table": r[2], "ref_column": r[3]}
                   for r in cur.fetchall()]

        else:
            cur.execute("""
                SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT, c.ORDINAL_POSITION,
                       CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END
                FROM INFORMATION_SCHEMA.COLUMNS c
                LEFT JOIN (
                    SELECT kcu.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA=%s AND tc.TABLE_NAME=%s
                ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
                WHERE c.TABLE_SCHEMA=%s AND c.TABLE_NAME=%s ORDER BY c.ORDINAL_POSITION
            """, (schema, table, schema, table))
            cols = [{"name": r[0], "type": r[1], "nullable": r[2]=="YES", "default": r[3], "is_pk": bool(r[5])}
                    for r in cur.fetchall()]

            cur.execute("""
                SELECT c.name, rs.name, rt.name, rc.name
                FROM sys.foreign_keys fk
                JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                JOIN sys.columns c  ON fkc.parent_object_id=c.object_id  AND fkc.parent_column_id=c.column_id
                JOIN sys.tables pt  ON fkc.parent_object_id=pt.object_id
                JOIN sys.schemas ps ON pt.schema_id=ps.schema_id
                JOIN sys.tables rt  ON fkc.referenced_object_id=rt.object_id
                JOIN sys.schemas rs ON rt.schema_id=rs.schema_id
                JOIN sys.columns rc ON fkc.referenced_object_id=rc.object_id AND fkc.referenced_column_id=rc.column_id
                WHERE ps.name=%s AND pt.name=%s
            """, (schema, table))
            fks = [{"column": r[0], "ref_schema": r[1], "ref_table": r[2], "ref_column": r[3]}
                   for r in cur.fetchall()]

    return {"schema": schema, "name": table, "columns": cols, "foreign_keys": fks}


def _build_prompt(db_type: str, db_name: str, schema_data: dict) -> str:
    table = schema_data["name"]
    schema = schema_data["schema"]
    cols = schema_data["columns"]
    fks = schema_data["foreign_keys"]

    def _col_line(c):
        default = f" DEFAULT {c['default']}" if c['default'] else ""
        pk = " PK" if c['is_pk'] else ""
        null = " NOT NULL" if not c['nullable'] else " NULL"
        return f"  - {c['name']} ({c['type']}){pk}{null}{default}"

    col_lines = "\n".join(_col_line(c) for c in cols)
    fk_lines = "\n".join(
        f"  - {fk['column']} → {fk['ref_schema']}.{fk['ref_table']}.{fk['ref_column']}"
        for fk in fks
    ) or "  (none)"

    return f"""You are a senior database architect writing developer documentation.

Database: {db_type} — {db_name}
Table: {schema}.{table}

Columns:
{col_lines}

Foreign Keys:
{fk_lines}

Write comprehensive markdown documentation for this table. Use EXACTLY this structure:

## {table}

> One sentence that describes what this table stores.

### Overview
2-3 sentences about the table's purpose and its role in the data model.

### Columns

| Column | Type | Required | Description |
|--------|------|----------|-------------|
(one row per column — write a clear, specific description for each column)

### Relationships
(bullet list of FK relationships explained in plain English, or "No foreign keys." if none)

### Example Queries
(2-3 practical SQL queries for {db_type} showing common usage patterns — real column names, no placeholders)

Return ONLY the markdown. No preamble, no explanation."""


def _generate_doc(conn: Connection, schema: str, table: str) -> str:
    schema_data = _fetch_table_schema(conn, schema, table)
    prompt = _build_prompt(conn.db_type, conn.database, schema_data)
    msg = get_claude().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/{conn_id}/generate/{schema}/{table}")
def generate_doc(
    conn_id: int, schema: str, table: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    content = _generate_doc(conn, schema, table)

    existing = db.query(TableDoc).filter(
        and_(TableDoc.conn_id == conn_id,
             TableDoc.schema_name == schema,
             TableDoc.table_name == table)
    ).first()

    if existing:
        existing.content = content
        existing.generated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "schema": schema, "table": table,
                "generated_at": existing.generated_at, "content": content}

    doc = TableDoc(conn_id=conn_id, schema_name=schema, table_name=table, content=content)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "schema": schema, "table": table,
            "generated_at": doc.generated_at, "content": content}


@router.get("/{conn_id}")
def list_docs(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    docs = db.query(TableDoc).filter(TableDoc.conn_id == conn_id).all()
    return [{"id": d.id, "schema": d.schema_name, "table": d.table_name,
             "generated_at": d.generated_at} for d in docs]


@router.get("/{conn_id}/{schema}/{table}")
def get_doc(
    conn_id: int, schema: str, table: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(TableDoc).filter(
        and_(TableDoc.conn_id == conn_id,
             TableDoc.schema_name == schema,
             TableDoc.table_name == table)
    ).first()
    if not doc:
        return None
    return {"id": doc.id, "schema": doc.schema_name, "table": doc.table_name,
            "generated_at": doc.generated_at, "content": doc.content}


@router.delete("/{conn_id}/{schema}/{table}")
def delete_doc(
    conn_id: int, schema: str, table: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(TableDoc).filter(
        and_(TableDoc.conn_id == conn_id,
             TableDoc.schema_name == schema,
             TableDoc.table_name == table)
    ).first()
    if doc:
        db.delete(doc)
        db.commit()
    return {"ok": True}


@router.get("/{conn_id}/export.md", response_class=PlainTextResponse)
def export_docs(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    docs = db.query(TableDoc).filter(TableDoc.conn_id == conn_id)\
              .order_by(TableDoc.schema_name, TableDoc.table_name).all()
    parts = [
        f"# {conn.name} — Schema Documentation\n\n"
        f"Database: {conn.database} ({conn.db_type.value})  \n"
        f"Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n\n---\n"
    ]
    for d in docs:
        parts.append(d.content)
        parts.append("\n\n---\n")
    return "\n".join(parts)
