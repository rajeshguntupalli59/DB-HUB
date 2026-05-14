from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import get_current_user
from db_connect import get_connection_or_404, open_db
from services.optimizer_explain import run_explain
from services.optimizer_indexes import recommend_indexes
from services.optimizer_slow import get_slow_queries
from services.optimizer_rewriter import rewrite_query

router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])


class ExplainRequest(BaseModel):
    sql: str
    analyze: bool = False
    buffers: bool = False


class IndexRequest(BaseModel):
    sql: str


class RewriteRequest(BaseModel):
    sql: str


@router.post("/{conn_id}/explain")
def explain(
    conn_id: int,
    body: ExplainRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    with open_db(conn) as raw:
        return run_explain(raw, conn.db_type.value, body.sql, body.analyze, body.buffers)


@router.post("/{conn_id}/indexes")
def indexes(
    conn_id: int,
    body: IndexRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    with open_db(conn) as raw:
        return {"recommendations": recommend_indexes(raw, conn.db_type.value, body.sql)}


@router.get("/{conn_id}/slow-queries")
def slow_queries(
    conn_id: int,
    limit: int = Query(20, ge=1, le=100),
    min_calls: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conn = get_connection_or_404(conn_id, db)
    with open_db(conn) as raw:
        return {"queries": get_slow_queries(raw, conn.db_type.value, limit, min_calls)}


@router.post("/rewrite")
def rewrite(
    body: RewriteRequest,
    current_user: User = Depends(get_current_user),
):
    return {"suggestions": rewrite_query(body.sql)}
