import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text
from database import Base
import enum


class Role(str, enum.Enum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(Enum(Role), default=Role.viewer, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class DbType(str, enum.Enum):
    postgresql = "postgresql"
    sqlserver = "sqlserver"
    mysql = "mysql"


class Connection(Base):
    __tablename__ = "connections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    db_type = Column(Enum(DbType), nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    database = Column(String, nullable=False)
    username = Column(String, nullable=False)
    password_enc = Column(String, nullable=False)
    ssl = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    last_tested_at = Column(DateTime, nullable=True)
    last_test_ok = Column(Boolean, nullable=True)


class TableDoc(Base):
    __tablename__ = "table_docs"

    id = Column(Integer, primary_key=True, index=True)
    conn_id = Column(Integer, ForeignKey("connections.id", ondelete="CASCADE"), nullable=False)
    schema_name = Column(String, nullable=False)
    table_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class SchemaSnapshot(Base):
    __tablename__ = "schema_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    conn_id = Column(Integer, ForeignKey("connections.id", ondelete="CASCADE"), nullable=False)
    label = Column(String, nullable=True)
    snapshot_json = Column(Text, nullable=False)
    taken_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class AppSettings(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
