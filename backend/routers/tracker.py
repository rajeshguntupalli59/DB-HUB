import json
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import User, SchemaSnapshot
from auth import get_current_user
from db_connect import get_connection_or_404, open_db

router = APIRouter(prefix="/api/tracker", tags=["tracker"])


# ── Schema capture ──────────────────────────────────────────────────────────

def _capture_schema(conn) -> list:
    """Return a list of table dicts with columns, indexes, and FKs."""
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
                # columns
                cur.execute("""
                    SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                           c.ordinal_position,
                           CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END
                    FROM information_schema.columns c
                    LEFT JOIN (
                        SELECT kcu.column_name FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu
                          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = %s AND tc.table_name = %s
                    ) pk ON c.column_name = pk.column_name
                    WHERE c.table_schema = %s AND c.table_name = %s
                    ORDER BY c.ordinal_position
                """, (schema, tname, schema, tname))
                cols = [{"name": r[0], "type": r[1], "nullable": r[2] == "YES",
                         "default": r[3], "is_pk": bool(r[5])} for r in cur.fetchall()]

                # indexes
                cur.execute("""
                    SELECT i.relname, ix.indisunique, ix.indisprimary,
                           array_agg(a.attname ORDER BY k.pos) AS cols
                    FROM pg_class t
                    JOIN pg_index ix ON t.oid = ix.indrelid
                    JOIN pg_class i  ON i.oid = ix.indexrelid
                    JOIN pg_namespace ns ON t.relnamespace = ns.oid
                    JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(colnum, pos) ON true
                    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.colnum
                    WHERE ns.nspname = %s AND t.relname = %s AND t.relkind = 'r'
                    GROUP BY i.relname, ix.indisunique, ix.indisprimary
                """, (schema, tname))
                idxs = [{"name": r[0], "unique": r[1], "primary": r[2],
                          "columns": list(r[3])} for r in cur.fetchall()]

                # foreign keys
                cur.execute("""
                    SELECT kcu.column_name, ccu.table_schema, ccu.table_name,
                           ccu.column_name, tc.constraint_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage ccu
                      ON tc.constraint_name = ccu.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = %s AND tc.table_name = %s
                """, (schema, tname))
                fks = [{"column": r[0], "ref_schema": r[1], "ref_table": r[2],
                         "ref_column": r[3], "constraint": r[4]} for r in cur.fetchall()]

                tables.append({"schema": schema, "name": tname,
                                "columns": cols, "indexes": idxs, "foreign_keys": fks})

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
                    SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
                           c.ORDINAL_POSITION,
                           CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END
                    FROM INFORMATION_SCHEMA.COLUMNS c
                    LEFT JOIN (
                        SELECT kcu.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                          AND tc.TABLE_SCHEMA = %s AND tc.TABLE_NAME = %s
                    ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
                    WHERE c.TABLE_SCHEMA = %s AND c.TABLE_NAME = %s
                    ORDER BY c.ORDINAL_POSITION
                """, (schema, tname, schema, tname))
                cols = [{"name": r[0], "type": r[1], "nullable": r[2] == "YES",
                         "default": r[3], "is_pk": bool(r[5])} for r in cur.fetchall()]

                cur.execute("""
                    SELECT i.name, i.is_unique, i.is_primary_key,
                           STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal)
                    FROM sys.indexes i
                    JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    JOIN sys.tables t ON i.object_id = t.object_id
                    JOIN sys.schemas s ON t.schema_id = s.schema_id
                    WHERE s.name = %s AND t.name = %s
                    GROUP BY i.name, i.is_unique, i.is_primary_key
                """, (schema, tname))
                idxs = [{"name": r[0], "unique": bool(r[1]), "primary": bool(r[2]),
                          "columns": r[3].split(",") if r[3] else []} for r in cur.fetchall()]

                cur.execute("""
                    SELECT c.name, rs.name, rt.name, rc.name, fk.name
                    FROM sys.foreign_keys fk
                    JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                    JOIN sys.columns c   ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
                    JOIN sys.tables pt   ON fkc.parent_object_id = pt.object_id
                    JOIN sys.schemas ps  ON pt.schema_id = ps.schema_id
                    JOIN sys.tables rt   ON fkc.referenced_object_id = rt.object_id
                    JOIN sys.schemas rs  ON rt.schema_id = rs.schema_id
                    JOIN sys.columns rc  ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
                    WHERE ps.name = %s AND pt.name = %s
                """, (schema, tname))
                fks = [{"column": r[0], "ref_schema": r[1], "ref_table": r[2],
                         "ref_column": r[3], "constraint": r[4]} for r in cur.fetchall()]

                tables.append({"schema": schema, "name": tname,
                                "columns": cols, "indexes": idxs, "foreign_keys": fks})

        if conn.db_type == "mysql":
            cur.execute("""
                SELECT TABLE_NAME FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME
            """, (conn.database,))
            table_rows = [(conn.database, r[0]) for r in cur.fetchall()]

            for schema, tname in table_rows:
                cur.execute("""
                    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION,
                           CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s ORDER BY ORDINAL_POSITION
                """, (schema, tname))
                cols = [{"name": r[0], "type": r[1], "nullable": r[2]=="YES",
                         "default": r[3], "is_pk": bool(r[5])} for r in cur.fetchall()]

                cur.execute("""
                    SELECT INDEX_NAME, MAX(NON_UNIQUE)=0, INDEX_NAME='PRIMARY',
                           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)
                    FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s GROUP BY INDEX_NAME
                """, (schema, tname))
                idxs = [{"name": r[0], "unique": bool(r[1]), "primary": bool(r[2]),
                          "columns": r[3].split(",") if r[3] else []} for r in cur.fetchall()]

                cur.execute("""
                    SELECT COLUMN_NAME, REFERENCED_TABLE_SCHEMA,
                           REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME
                    FROM information_schema.KEY_COLUMN_USAGE
                    WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s AND REFERENCED_TABLE_NAME IS NOT NULL
                """, (schema, tname))
                fks = [{"column": r[0], "ref_schema": r[1], "ref_table": r[2],
                         "ref_column": r[3], "constraint": r[4]} for r in cur.fetchall()]

                tables.append({"schema": schema, "name": tname,
                                "columns": cols, "indexes": idxs, "foreign_keys": fks})

    return tables


# ── Diff engine ─────────────────────────────────────────────────────────────

def _key(t): return f"{t['schema']}.{t['name']}"

def _diff_snapshots(old: list, new: list) -> dict:
    old_map = {_key(t): t for t in old}
    new_map = {_key(t): t for t in new}

    added_tables = [k for k in new_map if k not in old_map]
    dropped_tables = [k for k in old_map if k not in new_map]
    modified_tables = []

    for k in old_map:
        if k not in new_map:
            continue
        ot, nt = old_map[k], new_map[k]
        changes = {}

        # columns
        oc = {c["name"]: c for c in ot["columns"]}
        nc = {c["name"]: c for c in nt["columns"]}
        added_cols = [nc[n] for n in nc if n not in oc]
        dropped_cols = [n for n in oc if n not in nc]
        modified_cols = []
        for n in oc:
            if n not in nc:
                continue
            diffs = {}
            for field in ("type", "nullable", "default", "is_pk"):
                if oc[n].get(field) != nc[n].get(field):
                    diffs[field] = {"old": oc[n].get(field), "new": nc[n].get(field)}
            if diffs:
                modified_cols.append({"name": n, "changes": diffs})

        if added_cols:
            changes["added_columns"] = added_cols
        if dropped_cols:
            changes["dropped_columns"] = dropped_cols
        if modified_cols:
            changes["modified_columns"] = modified_cols

        # indexes
        oi = {i["name"]: i for i in ot["indexes"]}
        ni = {i["name"]: i for i in nt["indexes"]}
        added_idxs = [ni[n] for n in ni if n not in oi]
        dropped_idxs = [n for n in oi if n not in ni]
        if added_idxs:
            changes["added_indexes"] = added_idxs
        if dropped_idxs:
            changes["dropped_indexes"] = dropped_idxs

        # foreign keys
        ofk = {f["constraint"]: f for f in ot["foreign_keys"] if f.get("constraint")}
        nfk = {f["constraint"]: f for f in nt["foreign_keys"] if f.get("constraint")}
        added_fks = [nfk[n] for n in nfk if n not in ofk]
        dropped_fks = [n for n in ofk if n not in nfk]
        if added_fks:
            changes["added_foreign_keys"] = added_fks
        if dropped_fks:
            changes["dropped_foreign_keys"] = dropped_fks

        if changes:
            modified_tables.append({"schema": ot["schema"], "name": ot["name"], **changes})

    return {
        "added_tables": added_tables,
        "dropped_tables": dropped_tables,
        "modified_tables": modified_tables,
    }


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/{conn_id}/snapshot")
def take_snapshot(
    conn_id: int,
    label: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    tables = _capture_schema(conn)
    snap = SchemaSnapshot(
        conn_id=conn_id,
        label=label,
        snapshot_json=json.dumps(tables),
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return {
        "id": snap.id,
        "conn_id": conn_id,
        "label": snap.label,
        "taken_at": snap.taken_at,
        "table_count": len(tables),
    }


@router.get("/{conn_id}/snapshots")
def list_snapshots(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    snaps = db.query(SchemaSnapshot)\
               .filter(SchemaSnapshot.conn_id == conn_id)\
               .order_by(SchemaSnapshot.taken_at.desc()).all()
    result = []
    for s in snaps:
        tables = json.loads(s.snapshot_json)
        result.append({
            "id": s.id,
            "label": s.label,
            "taken_at": s.taken_at,
            "table_count": len(tables),
        })
    return result


@router.delete("/{conn_id}/snapshots/{snap_id}")
def delete_snapshot(
    conn_id: int,
    snap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    snap = db.query(SchemaSnapshot).filter(
        SchemaSnapshot.id == snap_id,
        SchemaSnapshot.conn_id == conn_id,
    ).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    db.delete(snap)
    db.commit()
    return {"ok": True}


@router.get("/{conn_id}/diff/{snap_a}/{snap_b}")
def diff_snapshots(
    conn_id: int,
    snap_a: int,
    snap_b: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    a = db.query(SchemaSnapshot).filter(
        SchemaSnapshot.id == snap_a, SchemaSnapshot.conn_id == conn_id).first()
    b = db.query(SchemaSnapshot).filter(
        SchemaSnapshot.id == snap_b, SchemaSnapshot.conn_id == conn_id).first()
    if not a or not b:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    diff = _diff_snapshots(json.loads(a.snapshot_json), json.loads(b.snapshot_json))
    return {
        "from": {"id": a.id, "label": a.label, "taken_at": a.taken_at},
        "to":   {"id": b.id, "label": b.label, "taken_at": b.taken_at},
        "diff": diff,
    }


@router.get("/{conn_id}/latest-diff")
def latest_diff(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    snaps = db.query(SchemaSnapshot)\
               .filter(SchemaSnapshot.conn_id == conn_id)\
               .order_by(SchemaSnapshot.taken_at.desc()).limit(2).all()
    if len(snaps) < 2:
        return {"message": "Need at least 2 snapshots to diff", "diff": None}
    newer, older = snaps[0], snaps[1]
    diff = _diff_snapshots(json.loads(older.snapshot_json), json.loads(newer.snapshot_json))
    return {
        "from": {"id": older.id, "label": older.label, "taken_at": older.taken_at},
        "to":   {"id": newer.id, "label": newer.label, "taken_at": newer.taken_at},
        "diff": diff,
    }
