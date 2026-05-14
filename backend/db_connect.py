import os
from contextlib import contextmanager
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session
from fastapi import HTTPException
from models import Connection


def decrypt_password(enc: str) -> str:
    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY not set")
    return Fernet(key.encode()).decrypt(enc.encode()).decode()


def get_connection_or_404(conn_id: int, db: Session) -> Connection:
    conn = db.query(Connection).filter(Connection.id == conn_id).first()
    if not conn:
        raise HTTPException(404, "Connection not found")
    return conn


@contextmanager
def open_db(conn: Connection):
    """Yield a live DB cursor (psycopg2 or pymssql), closes on exit."""
    password = decrypt_password(conn.password_enc)
    raw = None
    try:
        if conn.db_type == "postgresql":
            import psycopg2
            raw = psycopg2.connect(
                host=conn.host, port=conn.port, dbname=conn.database,
                user=conn.username, password=password,
                connect_timeout=8,
                sslmode="require" if conn.ssl else "prefer",
            )
        elif conn.db_type == "sqlserver":
            import pymssql
            kwargs = dict(server=conn.host, port=str(conn.port),
                          database=conn.database, timeout=8)
            if conn.username:
                kwargs["user"] = conn.username
                kwargs["password"] = password
            raw = pymssql.connect(**kwargs)
        elif conn.db_type == "mysql":
            import pymysql
            raw = pymysql.connect(
                host=conn.host, port=conn.port, database=conn.database,
                user=conn.username, password=password,
                connect_timeout=8,
                ssl={"ssl": {}} if conn.ssl else None,
                autocommit=True,
            )
        else:
            raise HTTPException(400, f"Unsupported db_type: {conn.db_type}")
        yield raw
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Cannot connect to database: {e}")
    finally:
        if raw:
            try:
                raw.close()
            except Exception:
                pass
