from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Text,
    ForeignKey,
    CheckConstraint,
    JSON,
    TIMESTAMP,
    func,
    text,
    Index,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import List, Optional, Dict, Any
from config import Base
from enum import Enum


# ---------------------------
# User Model
# ---------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password: Mapped[str] = mapped_column(Text, nullable=False)
    god: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[str] = mapped_column(TIMESTAMP, default= datetime.now, server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    workspaces: Mapped[list["Workspace"]] = relationship(
        "Workspace",
        back_populates="user",
        cascade="all, delete-orphan",   # <— ORM deletes children
        single_parent=True,
    )


class VerifyLogin(Base):
    __tablename__ = "sso_verify_login"
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_name = Column(String(150), nullable=False )
    is_auth = Column(Boolean, server_default=text('False'), nullable=False)
    timestamp = Column(DateTime, nullable=True)


class Cache(Base):
    __tablename__ = "sso_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    username: Mapped[str] = mapped_column(String(150), nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False)
    black_list: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text('FALSE'))
    timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


# ---------------------------
# Workspace Model
# ---------------------------
class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(TIMESTAMP, default= datetime.now, server_default=func.now())
    active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default=text('False'))

    user: Mapped["User"] = relationship("User", back_populates="workspaces")
    nodes: Mapped[list["Node"]] = relationship("Node", back_populates="workspace")
    environments: Mapped[list["Environment"]] = relationship("Environment", back_populates="workspace")


class Environment(Base):
    __tablename__ = "environments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    variables: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # JSON storage for variables (similar to headers)
    created_at: Mapped[str] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())
    updated_at: Mapped[str] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now(), onupdate=func.now())

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="environments")


# ---------------------------
# Node Model (Folder/File)
# ---------------------------
class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # folder | file
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    created_at: Mapped[str] = mapped_column(TIMESTAMP, default= datetime.now, server_default=func.now())

    __table_args__ = (
        CheckConstraint("type IN ('folder', 'file')", name="check_node_type"),
        CheckConstraint("(type = 'file' AND parent_id IS NOT NULL) OR (type = 'folder')", name="file_parent_not_null"),
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="nodes")
    parent: Mapped["Node"] = relationship("Node", remote_side=[id], backref="children")
    headers: Mapped[list["Header"]] = relationship("Header", back_populates="folder")
    apis: Mapped[list["Api"]] = relationship("Api", back_populates="file")


# ---------------------------
# Header Model (Folder-level headers)
# ---------------------------
class Header(Base):
    __tablename__ = "headers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    folder_id: Mapped[int] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), unique= True, nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[str] = mapped_column(TIMESTAMP, default= datetime.now, server_default=func.now())

    folder: Mapped["Node"] = relationship("Node", back_populates="headers")


# ---------------------------
# API Model (One JSON = One API)
# ---------------------------
class Api(Base):
    __tablename__ = "apis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    file_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # ✅ Important searchable fields (instead of only JSON)
    name: Mapped[str] = mapped_column(String(255), nullable=False)       # API Name
    method: Mapped[str] = mapped_column(String(10), nullable=False)      # GET/POST/PUT/DELETE
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)          # /api/v1/users/{id}
    description: Mapped[str] = mapped_column(Text)                       # Optional doc/notes
    is_active: Mapped[bool] = mapped_column(default=True)                # To mark active/inactive

    # ✅ Extra data that may not be searchable often
    extra_meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[str] = mapped_column(
        TIMESTAMP, default=datetime.now, server_default=func.now()
    )

    # Relationships
    file: Mapped["Node"] = relationship("Node", back_populates="apis")
    cases: Mapped[list["ApiCase"]] = relationship(
        "ApiCase",
        back_populates="api",
        cascade="all, delete-orphan",   # delete children first
        single_parent=True              # good practice with delete-orphan
    )

# ---------------------------
# API Case Model (Cases inside one API JSON)
# ---------------------------
class ApiCase(Base):
    __tablename__ = "api_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    api_id: Mapped[int] = mapped_column(ForeignKey("apis.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    headers: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Added headers column
    params: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # Added params column
    body: Mapped[dict] = mapped_column(JSON, nullable=False)
    expected: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[str] = mapped_column(TIMESTAMP, default= datetime.now, server_default=func.now())

    api: Mapped["Api"] = relationship("Api", back_populates="cases")


class OTPAttempt(Base):
    __tablename__ = "sso_otp_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    otp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, server_default=text('0'))
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime, server_default=None)
    expire_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ---------- Enums ----------
class ScheduleType(str, Enum):
    """Frequency for the scheduler."""
    once = "once"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    minutely = "minutely"
    hourly = "hourly"


# ---------- Models ----------
class BulkTestSchedule(Base):
    __tablename__ = "bulk_test_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Owner context (unchanged)
    username: Mapped[str] = mapped_column(String(255), index=True)
    workspace_id: Mapped[int] = mapped_column(Integer, index=True)

    # Use Enum for type (replaces free-form string)
    type: Mapped[ScheduleType] = mapped_column(
        SAEnum(ScheduleType, name="schedule_type_enum"),
        nullable=False,
        index=True,
    )

    # Generic interval (reused across all repeating types; ignored for ONCE)
    interval_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Initial anchor for schedule (optional). If null, "now" is used.
    start_from: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Run timing (reused exactly as you had)
    # - date_time: for ONCE (one-shot run moment)
    # - time: HH:MM used by hourly/daily/weekly/monthly to align within the period
    # - days_of_week: used by WEEKLY (["Mon","Thu"] etc.)
    # - day_of_month: used by MONTHLY (1..28 recommended)
    date_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "HH:MM"
    days_of_week: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Original request payload (unchanged)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)

    last_run: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    next_run: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    executions: Mapped[List["BulkTestExecution"]] = relationship(
        back_populates="schedule",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        # fast polling
        Index("ix_schedule_enabled_next_run", "enabled", "next_run"),
        Index("ix_schedule_user_workspace", "username", "workspace_id"),
        # guard interval
        CheckConstraint("interval_count >= 1", name="ck_schedule_interval_ge_1"),
        # guard monthly day if provided
        CheckConstraint("(day_of_month IS NULL) OR (day_of_month BETWEEN 1 AND 31)", name="ck_schedule_dom_1_31"),
    )


# Keeping these for completeness if they’re already defined elsewhere
class BulkTestExecution(Base):
    __tablename__ = "bulk_test_executions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("bulk_test_schedules.id", ondelete="CASCADE"),
        index=True,
    )

    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    total_cases: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    schedule: Mapped["BulkTestSchedule"] = relationship(back_populates="executions")
    results: Mapped[List["BulkTestResult"]] = relationship(
        back_populates="execution",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_execution_schedule_status", "schedule_id", "status"),
        Index("ix_execution_started", "started_at"),
    )


class BulkTestResult(Base):
    __tablename__ = "bulk_test_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    execution_id: Mapped[int] = mapped_column(
        ForeignKey("bulk_test_executions.id", ondelete="CASCADE"),
        index=True,
    )

    case_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    case_name: Mapped[str] = mapped_column(String(255), nullable=False)

    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    failures: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    request: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    response: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)

    execution: Mapped["BulkTestExecution"] = relationship(back_populates="results")

    __table_args__ = (
        Index("ix_result_execution_case", "execution_id", "case_id"),
        Index("ix_result_success", "success"),
    )
