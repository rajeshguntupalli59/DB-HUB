import os
import time
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from cryptography.fernet import Fernet
from database import get_db
from models import Connection, DbType, User
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/connections", tags=["connections"])


def _get_fernet() -> Fernet:
    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY not set")
    return Fernet(key.encode())

def encrypt_password(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()

def decrypt_password(enc: str) -> str:
    return _get_fernet().decrypt(enc.encode()).decode()


# ── Schemas ────────────────────────────────────────────────────────────────

class ConnectionCreate(BaseModel):
    name: str
    db_type: str
    host: str
    port: int
    database: str
    username: str
    password: str
    ssl: bool = False

class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssl: Optional[bool] = None

class TestRequest(BaseModel):
    db_type: str
    host: str
    port: int
    database: str
    username: str
    password: str
    ssl: bool = False

class ConnectionResponse(BaseModel):
    id: int
    name: str
    db_type: str
    host: str
    port: int
    database: str
    username: str
    ssl: bool
    is_active: bool
    created_at: datetime.datetime
    last_tested_at: Optional[datetime.datetime]
    last_test_ok: Optional[bool]

    class Config:
        from_attributes = True


# ── Connection tester ──────────────────────────────────────────────────────

def _test_connection(db_type: str, host: str, port: int, database: str,
                     username: str, password: str, ssl: bool) -> dict:
    t0 = time.monotonic()
    try:
        if db_type == "postgresql":
            import psycopg2
            conn = psycopg2.connect(
                host=host, port=port, dbname=database,
                user=username, password=password,
                connect_timeout=5,
                sslmode="require" if ssl else "prefer",
            )
            conn.close()
        elif db_type == "sqlserver":
            import pymssql
            kwargs = dict(server=host, port=str(port), database=database, timeout=5)
            if username:
                kwargs["user"] = username
                kwargs["password"] = password
            conn = pymssql.connect(**kwargs)
            conn.close()
        elif db_type == "mysql":
            import pymysql
            conn = pymysql.connect(
                host=host, port=port, database=database,
                user=username, password=password,
                connect_timeout=5,
                ssl={"ssl": {}} if ssl else None,
            )
            conn.close()
        else:
            return {"ok": False, "error": "Unknown database type"}

        latency_ms = int((time.monotonic() - t0) * 1000)
        return {"ok": True, "latency_ms": latency_ms}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[ConnectionResponse])
def list_connections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Connection).order_by(Connection.created_at).all()


@router.post("", response_model=ConnectionResponse)
def create_connection(
    body: ConnectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.db_type not in ("postgresql", "sqlserver", "mysql"):
        raise HTTPException(400, "db_type must be postgresql, sqlserver, or mysql")
    conn = Connection(
        name=body.name,
        db_type=DbType(body.db_type),
        host=body.host,
        port=body.port,
        database=body.database,
        username=body.username,
        password_enc=encrypt_password(body.password),
        ssl=body.ssl,
        created_by_id=current_user.id,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


@router.put("/{conn_id}", response_model=ConnectionResponse)
def update_connection(
    conn_id: int,
    body: ConnectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = db.query(Connection).filter(Connection.id == conn_id).first()
    if not conn:
        raise HTTPException(404, "Connection not found")
    if body.name is not None:
        conn.name = body.name
    if body.host is not None:
        conn.host = body.host
    if body.port is not None:
        conn.port = body.port
    if body.database is not None:
        conn.database = body.database
    if body.username is not None:
        conn.username = body.username
    if body.password is not None and body.password.strip():
        conn.password_enc = encrypt_password(body.password)
    if body.ssl is not None:
        conn.ssl = body.ssl
    db.commit()
    db.refresh(conn)
    return conn


@router.delete("/{conn_id}")
def delete_connection(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = db.query(Connection).filter(Connection.id == conn_id).first()
    if not conn:
        raise HTTPException(404, "Connection not found")
    db.delete(conn)
    db.commit()
    return {"ok": True}


@router.post("/test")
def test_before_save(body: TestRequest, current_user: User = Depends(get_current_user)):
    return _test_connection(
        body.db_type, body.host, body.port,
        body.database, body.username, body.password, body.ssl,
    )


@router.post("/{conn_id}/test")
def test_saved_connection(
    conn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = db.query(Connection).filter(Connection.id == conn_id).first()
    if not conn:
        raise HTTPException(404, "Connection not found")

    result = _test_connection(
        conn.db_type, conn.host, conn.port,
        conn.database, conn.username,
        decrypt_password(conn.password_enc), conn.ssl,
    )
    conn.last_tested_at = datetime.datetime.utcnow()
    conn.last_test_ok = result["ok"]
    db.commit()
    db.refresh(conn)
    return {**result, "connection": ConnectionResponse.model_validate(conn).model_dump()}
