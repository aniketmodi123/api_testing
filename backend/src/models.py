"""
What this file does: Defines all SQLAlchemy ORM models for the application; tables are created
automatically on startup via Base.metadata.create_all.
"""

from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    ForeignKey,
    CheckConstraint,
    UniqueConstraint,
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
    """Store a registered user account with credentials and active status.

    Attributes:
        id: Primary key.
        username: Unique display name.
        email: Unique login email.
        password: Hashed password string.
        god: ``True`` grants superuser privileges; ``False`` is a normal user.
        created_at: Account creation timestamp.
        is_active: ``True`` when the account is enabled; ``False`` when suspended.
        workspaces: All workspaces owned by this user; cascade-deleted with the user.
    """

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
    """Record a single login audit event (success or failure).

    Attributes:
        id: Primary key.
        user_name: Username attempted.
        is_auth: ``True`` for successful login; ``False`` for failed attempt.
        timestamp: When the attempt occurred; ``None`` if not recorded.
    """

    __tablename__ = "sso_verify_login"
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_name = Column(String(150), nullable=False)
    is_auth = Column(Boolean, server_default=text('False'), nullable=False)
    timestamp = Column(DateTime, nullable=True)


class Cache(Base):
    """Store a JWT token cache entry used to track active and blacklisted sessions.

    Attributes:
        id: Primary key.
        username: Owner of the token.
        token: Raw JWT string.
        black_list: ``True`` when the token has been invalidated; ``False`` when active.
        timestamp: Time the entry was created or last updated; ``None`` when not set.
    """

    __tablename__ = "sso_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    username: Mapped[str] = mapped_column(String(150), nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False)
    black_list: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text('FALSE'))
    timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


class PersonalAccessToken(Base):
    """A long-lived, revocable credential a user pastes into any MCP/agent client.

    The raw token is shown once at creation and never stored — only its SHA-256 hex is kept
    (full-entropy token, so a fast deterministic hash is safe and indexable for lookup, unlike a
    salted password hash). Exchanged for a short-lived JWT at POST /pat/token.

    Attributes:
        id: Primary key.
        username: Owner (user email), matching the JWT ``username`` claim.
        name: User-supplied label to identify the token.
        token_hash: SHA-256 hex of the raw token; unique, used for O(1) lookup on exchange.
        created_at: Creation time.
        last_used_at: Last successful exchange; ``None`` until first use.
        revoked: ``True`` once revoked; revoked tokens never exchange.
        expires_at: Optional hard expiry; ``None`` means it never expires (until revoked).
    """

    __tablename__ = "sso_personal_access_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    username: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text('FALSE'))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


# ---------------------------
# Workspace Model
# ---------------------------
class Workspace(Base):
    """Represent a named container that groups folders, files, APIs, and environments.

    Attributes:
        id: Primary key.
        user_id: FK to the owning user; cascade-deleted when user is removed.
        name: Workspace display name.
        description: Optional free-text description.
        created_at: Creation timestamp.
        active: ``True`` when this is the user's currently selected workspace; ``False`` otherwise.
        user: Owning User relationship.
        nodes: All folder/file nodes in this workspace.
        environments: All environments defined for this workspace.
        members: Accepted and pending WorkspaceMembers; cascade-deleted with workspace.
        invites: Pending WorkspaceInvites; cascade-deleted with workspace.
    """

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
    members: Mapped[List["WorkspaceMember"]] = relationship(
        "WorkspaceMember",
        back_populates="workspace",
        cascade="all, delete-orphan",
        foreign_keys="WorkspaceMember.workspace_id",
    )
    invites: Mapped[List["WorkspaceInvite"]] = relationship(
        "WorkspaceInvite",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )


class Environment(Base):
    """Represent a named variable set that can be activated to inject values into API requests.

    Attributes:
        id: Primary key.
        workspace_id: FK to the owning workspace; cascade-deleted when workspace is removed.
        name: Environment display name.
        description: Optional description; ``None`` when not provided.
        is_active: ``True`` when this environment's variables are used during execution; only one
                   environment per workspace should be active at a time.
        variables: JSON dict of variable key→value pairs; ``None`` when no variables are defined.
        created_at: Creation timestamp.
        updated_at: Last modification timestamp.
        workspace: Owning Workspace relationship.
    """

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
    """Represent a single folder or file in a workspace's tree structure.

    Attributes:
        id: Primary key.
        workspace_id: FK to the owning workspace; cascade-deleted when workspace is removed.
        name: Node display name.
        type: ``"folder"`` for a directory node; ``"file"`` for an API container node.
        parent_id: FK to the parent folder; ``None`` for root-level nodes. Files must always
                   have a parent (enforced by DB constraint).
        created_at: Creation timestamp.
        workspace: Owning Workspace relationship.
        parent: Parent Node relationship for tree traversal.
        headers: Folder-level headers attached to this node (folders only).
        apis: APIs stored inside this node (files only).
    """

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
    """Store inherited HTTP headers attached to a single folder node.

    Attributes:
        id: Primary key.
        folder_id: FK to the folder node; unique — one header set per folder.
        content: JSON dict of header key→value pairs.
        created_at: Creation timestamp.
        folder: Owning Node relationship.
    """

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
    """Represent a single API definition attached to a file node.

    Attributes:
        id: Primary key.
        file_id: FK to the file node; unique — one API per file node.
        name: API display name.
        method: HTTP method string (e.g. ``"GET"``, ``"POST"``).
        endpoint: URL path template (e.g. ``"/api/v1/users/{id}"``).
        description: Optional documentation text; ``None`` when not provided.
        is_active: ``True`` when the API appears in test runs; ``False`` to exclude it.
        extra_meta: JSON dict for additional metadata such as file-level headers; ``None`` when empty.
        created_at: Creation timestamp.
        file: Owning Node relationship.
        cases: All test cases for this API; cascade-deleted with the API.
    """

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
    """Store a single test case for an API, including inputs and expected assertions.

    Attributes:
        id: Primary key.
        api_id: FK to the owning API; cascade-deleted when the API is removed.
        name: Test case display name.
        headers: JSON dict of request headers to send; ``None`` when not specified.
        params: JSON dict of query/path parameters; ``None`` when not specified.
        body: JSON dict representing the request body.
        expected: JSON dict of assertion criteria (status code, body checks, etc.).
        created_at: Creation timestamp.
        api: Owning Api relationship.
    """

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
    """Track OTP attempts and account lockout state for a user.

    Attributes:
        id: Primary key.
        user_name: Username this record belongs to; unique per user.
        otp: Current OTP value; ``None`` when no OTP has been generated.
        failed_attempts: Count of consecutive failed OTP submissions; resets on success.
        locked_until: Timestamp until which the account is locked; ``None`` when not locked.
        expire_at: Timestamp after which the current OTP is no longer valid.
        updated_at: Last time this record was modified; ``None`` when never updated.
    """

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


# Execution status constants — single source of truth for engine, CRUD, and notification service
EXEC_STATUS_QUEUED = "queued"
EXEC_STATUS_RUNNING = "running"
EXEC_STATUS_SUCCESS = "success"
EXEC_STATUS_PARTIAL = "partial"
EXEC_STATUS_FAILED = "failed"
EXEC_STATUS_TIMED_OUT = "timed_out"

ACTIVE_STATUSES: frozenset[str] = frozenset({EXEC_STATUS_QUEUED, EXEC_STATUS_RUNNING})
TERMINAL_STATUSES: frozenset[str] = frozenset({EXEC_STATUS_SUCCESS, EXEC_STATUS_PARTIAL, EXEC_STATUS_FAILED, EXEC_STATUS_TIMED_OUT})


# ---------- Models ----------
class BulkTestSchedule(Base):
    """Define a recurring or one-shot schedule that triggers a bulk API test run.

    Attributes:
        id: Primary key.
        name: Schedule display name.
        username: Username that owns this schedule.
        workspace_id: Workspace the schedule operates against.
        type: ``"once"`` single run at date_time; ``"minutely"`` → every N minutes;
              ``"hourly"`` → every N hours; ``"daily"`` → daily at time;
              ``"weekly"`` → on days_of_week at time; ``"monthly"`` → on day_of_month at time.
        interval_count: Number of units between repeating runs; ignored for ``"once"``.
        start_from: Optional anchor datetime for calculating the first run; ``None`` uses now.
        date_time: Exact run datetime for ``"once"`` schedules; ``None`` for repeating types.
        time: ``"HH:MM"`` used by hourly/daily/weekly/monthly to align within the period; ``None`` for once/minutely.
        days_of_week: List of day abbreviations (e.g. ``["Mon", "Thu"]``) for weekly; ``None`` otherwise.
        day_of_month: Day number 1–31 for monthly schedules; ``None`` otherwise.
        timezone: IANA timezone name (e.g. ``"America/New_York"``) used to interpret wall-clock times; ``None`` defaults to UTC.
        enabled: ``True`` when the scheduler should process this schedule; ``False`` to pause it.
        payload: Original bulk run payload JSON (API IDs and case selection).
        last_run: Timestamp of the most recent execution; ``None`` if never run.
        next_run: Pre-calculated timestamp for the next execution; indexed for fast polling.
        created_at: Creation timestamp.
        updated_at: Last modification timestamp.
        executions: All BulkTestExecution records for this schedule.
        alerts: All ScheduleAlert records configured for this schedule.
    """

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
    timezone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

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
    alerts: Mapped[List["ScheduleAlert"]] = relationship(
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


class RequestHistory(Base):
    """Record a single API request and its response for history playback.

    Attributes:
        id: Primary key.
        file_id: FK to the file node the request was made from; ``None`` for ad-hoc requests.
        workspace_id: Workspace context; ``None`` when not associated with a workspace.
        username: User who made the request.
        method: HTTP method (e.g. ``"GET"``).
        url: Full request URL.
        headers: Request headers as JSON dict; ``None`` when not captured.
        params: Query parameters as JSON dict; ``None`` when not captured.
        body: Raw request body string; ``None`` when no body was sent.
        response_status: HTTP response status code; ``None`` on connection failure.
        response_body: Raw response body string; ``None`` when no body was received.
        response_headers: Response headers as JSON dict; ``None`` when not captured.
        execution_time_ms: Round-trip time in milliseconds; ``None`` when not measured.
        created_at: Timestamp when the request was made.
    """

    __tablename__ = "request_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    file_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    workspace_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    headers: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    params: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_headers: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    execution_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, index=True
    )

    __table_args__ = (
        Index("ix_history_username_file", "username", "file_id"),
        Index("ix_history_created", "created_at"),
    )


class BulkTestExecution(Base):
    """Record a single bulk test run triggered by a schedule.

    Attributes:
        id: Primary key.
        schedule_id: FK to the owning BulkTestSchedule; cascade-deleted with the schedule.
        status: Current run state — ``"queued"`` → ``"running"`` → ``"success"`` | ``"partial"`` | ``"failed"``.
        started_at: Timestamp when execution began; ``None`` while still queued.
        finished_at: Timestamp when execution ended; ``None`` while in progress.
        total_cases: Number of test cases included in this run.
        passed: Count of passing test cases.
        failed: Count of failing test cases.
        duration_ms: Total wall-clock time for the run in milliseconds.
        error_message: Top-level error description when the run itself failed; ``None`` otherwise.
        schedule: Owning BulkTestSchedule relationship.
        results: Per-case BulkTestResult records for this execution.
    """

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


# ---------------------------
# Global Variable Model (per-user, cross-workspace)
# ---------------------------
class GlobalVariable(Base):
    """Store a user-scoped variable that is available across all workspaces.

    Attributes:
        id: Primary key.
        username: Owner of this variable.
        key: Variable name used in ``{{key}}`` template substitution.
        value: Variable value; defaults to empty string when not set.
        is_secret: ``True`` masks the value in UI responses; ``False`` shows it in plain text.
        description: Optional explanation of the variable's purpose; ``None`` when not provided.
        created_at: Creation timestamp.
    """

    __tablename__ = "global_variables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())

    __table_args__ = (
        Index("ix_global_var_username_key", "username", "key", unique=True),
    )


class ScheduleAlert(Base):
    """Configure a notification target (email or webhook) for a schedule's run outcomes.

    Attributes:
        id: Primary key.
        schedule_id: FK to the owning BulkTestSchedule; cascade-deleted with the schedule.
        type: ``"email"`` sends SMTP notification; ``"webhook"`` sends an HTTP POST payload.
        target: Email address when type is ``"email"``; webhook URL when type is ``"webhook"``.
        on_failure: ``True`` triggers alert when the run has any failing cases.
        on_success: ``True`` triggers alert when all cases pass.
        on_partial: ``True`` triggers alert when some cases pass and some fail.
        created_at: Creation timestamp.
        schedule: Owning BulkTestSchedule relationship.
    """

    __tablename__ = "schedule_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("bulk_test_schedules.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # "email" | "webhook"
    target: Mapped[str] = mapped_column(String(500), nullable=False)  # email or webhook URL
    on_failure: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    on_success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    on_partial: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    schedule: Mapped["BulkTestSchedule"] = relationship(back_populates="alerts")

    __table_args__ = (
        CheckConstraint("type IN ('email', 'webhook')", name="ck_alert_type"),
        Index("ix_alert_schedule", "schedule_id"),
    )


class WorkspaceMember(Base):
    """Associate a user with a workspace they were invited to, with an assigned role.

    Attributes:
        id: Primary key.
        workspace_id: FK to the workspace; cascade-deleted when workspace is removed.
        user_id: FK to the member user; cascade-deleted when user is removed.
        role: ``"viewer"`` read-only access; ``"editor"`` → full CRUD on APIs/cases;
              ``"admin"`` → editor + can invite others.
        invited_by: FK to the user who sent the invite; ``None`` when that user was deleted.
        joined_at: Timestamp when the invite was accepted; ``None`` while invite is still pending.
        created_at: Timestamp when the invite record was first created.
        workspace: Owning Workspace relationship.
        user: Member User relationship.
    """

    __tablename__ = "workspace_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # viewer | editor | admin
    invited_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="members", foreign_keys=[workspace_id]
    )
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        CheckConstraint("role IN ('viewer', 'editor', 'admin')", name="ck_member_role"),
        Index("ix_member_workspace_user", "workspace_id", "user_id", unique=True),
    )


class WorkspaceInvite(Base):
    """Hold a pending email invitation to join a workspace via a UUID token link.

    Attributes:
        id: Primary key.
        workspace_id: FK to the target workspace; cascade-deleted when workspace is removed.
        email: Email address the invite was sent to.
        token: Unique hex token embedded in the invite link; 64 characters.
        role: Role to grant on acceptance — ``"viewer"``, ``"editor"``, or ``"admin"``.
        expires_at: Timestamp after which the invite link is no longer valid (7 days from creation).
        accepted: ``True`` once the invitee has clicked the link and joined; ``False`` while pending.
        created_at: Creation timestamp.
        workspace: Owning Workspace relationship.
    """

    __tablename__ = "workspace_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="invites")

    __table_args__ = (
        CheckConstraint("role IN ('viewer', 'editor', 'admin')", name="ck_invite_role"),
    )


class BulkTestResult(Base):
    """Store the outcome of a single test case within a bulk execution run.

    Attributes:
        id: Primary key.
        execution_id: FK to the owning BulkTestExecution; cascade-deleted with the execution.
        case_id: ID of the ApiCase that was run.
        case_name: Snapshot of the case name at run time.
        status_code: HTTP response status code received; ``None`` on connection failure.
        success: ``True`` when all assertions passed; ``False`` when any assertion failed.
        failures: JSON dict describing each failed assertion; ``None`` when all passed.
        request: JSON snapshot of the outgoing request (method, url, headers, body); ``None`` when not captured.
        response: JSON snapshot of the response (status, headers, body); ``None`` when not captured.
        duration_ms: Time taken for this single case in milliseconds.
        created_at: Timestamp when the result was recorded.
        execution: Owning BulkTestExecution relationship.
    """

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


class OAuthToken(Base):
    """Cache an OAuth2 access token to avoid re-granting on every request.

    Attributes:
        id: Primary key.
        owner_username: Email of the user who triggered the grant; indexed for fast lookup.
        auth_ref: Opaque cache key derived from hash(client_id + scope + token_url); unique per owner so one entry per config.
        access_token: Encrypted access token string; sourced from grant response ``access_token`` field.
        refresh_token: Encrypted refresh token; ``None`` when the grant does not return one.
        token_type: Token type string from grant response (typically ``"Bearer"``).
        expires_at: UTC timestamp after which the token must be refreshed; ``None`` when the grant returns no expiry.
        created_at: Timestamp when this cache entry was first written.
    """

    __tablename__ = "oauth_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_username: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    auth_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_type: Mapped[str] = mapped_column(String(50), nullable=False, default="Bearer")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_oauth_token_owner_ref", "owner_username", "auth_ref", unique=True),
    )


class Flow(Base):
    """Define a named flow that chains multiple request/condition/delay/set_var steps.

    Attributes:
        id: Primary key.
        workspace_id: FK to the owning workspace; cascade-deleted when workspace is removed.
        name: Flow display name.
        description: Optional free-text description; ``None`` when not set.
        graph: JSON blob storing the canvas node/edge layout for the UI; ``None`` when not laid out.
        enabled: ``True`` when the flow is active and can be run.
        created_at: Creation timestamp.
        updated_at: Last modification timestamp.
        workspace: Owning Workspace relationship.
        steps: Ordered FlowStep records for this flow; cascade-deleted with flow.
        runs: FlowRun execution records; cascade-deleted with flow.
    """

    __tablename__ = "flows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    graph: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now(), onupdate=func.now())

    workspace: Mapped["Workspace"] = relationship("Workspace", foreign_keys=[workspace_id])
    steps: Mapped[List["FlowStep"]] = relationship("FlowStep", back_populates="flow", cascade="all, delete-orphan", order_by="FlowStep.step_order")
    runs: Mapped[List["FlowRun"]] = relationship("FlowRun", back_populates="flow", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_flow_workspace", "workspace_id"),
    )


class FlowStep(Base):
    """Define a single step within a flow — request, condition, delay, or set_var.

    Attributes:
        id: Primary key.
        flow_id: FK to the owning Flow; cascade-deleted when flow is removed.
        step_order: Zero-based execution order within the flow.
        type: Step kind — ``"request"`` sends an API call; ``"condition"`` branches; ``"delay"`` waits; ``"set_var"`` injects a local variable.
        api_id: FK to the Api to call; ``None`` for non-request steps.
        config: JSON bag of step parameters (e.g. delay_ms for delay, expression for condition).
        extract: JSON jsonpath extraction rules ``{var: path}`` applied to the response; ``None`` when no extraction.
        condition: JSON condition expression ``{var, op, value, on_false}``; ``None`` for non-condition steps.
        flow: Owning Flow relationship.
    """

    __tablename__ = "flow_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    flow_id: Mapped[int] = mapped_column(ForeignKey("flows.id", ondelete="CASCADE"), nullable=False, index=True)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # request|condition|delay|set_var
    api_id: Mapped[Optional[int]] = mapped_column(ForeignKey("apis.id", ondelete="SET NULL"), nullable=True)
    config: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    extract: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    condition: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    flow: Mapped["Flow"] = relationship("Flow", back_populates="steps")

    __table_args__ = (
        CheckConstraint("type IN ('request', 'condition', 'delay', 'set_var')", name="ck_flow_step_type"),
        Index("ix_flow_step_flow_order", "flow_id", "step_order"),
    )


class FlowRun(Base):
    """Record a single execution of a flow with its accumulated run context.

    Attributes:
        id: Primary key.
        flow_id: FK to the owning Flow; cascade-deleted when flow is removed.
        status: Current state — ``"running"``, ``"completed"``, or ``"failed"``.
        context: JSON dict of run-time variables accumulated across steps; ``None`` when empty.
        started_at: Timestamp when execution began.
        finished_at: Timestamp when execution ended; ``None`` while in progress.
        error_message: Top-level failure message; ``None`` when run completed successfully.
        flow: Owning Flow relationship.
        step_results: Per-step FlowStepResult records; cascade-deleted with run.
    """

    __tablename__ = "flow_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    flow_id: Mapped[int] = mapped_column(ForeignKey("flows.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running", index=True)
    context: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    flow: Mapped["Flow"] = relationship("Flow", back_populates="runs")
    step_results: Mapped[List["FlowStepResult"]] = relationship("FlowStepResult", back_populates="run", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("status IN ('running', 'completed', 'failed')", name="ck_flow_run_status"),
        Index("ix_flow_run_flow_status", "flow_id", "status"),
    )


class FlowStepResult(Base):
    """Store the outcome of a single step execution within a flow run.

    Attributes:
        id: Primary key.
        run_id: FK to the owning FlowRun; cascade-deleted with the run.
        step_id: FK to the FlowStep that was executed; ``None`` when step was deleted.
        step_order: Snapshot of the step order at run time.
        success: ``True`` when the step completed without error.
        request: JSON snapshot of the outgoing request; ``None`` for non-request steps.
        response: JSON snapshot of the response (secrets masked); ``None`` for non-request steps.
        extracted: JSON dict of variables extracted from this step's response; ``None`` when no extraction.
        duration_ms: Wall-clock time for this step in milliseconds.
        error_message: Step-level failure message; ``None`` when step succeeded.
        created_at: Timestamp when the result was recorded.
        run: Owning FlowRun relationship.
    """

    __tablename__ = "flow_step_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("flow_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    step_id: Mapped[Optional[int]] = mapped_column(ForeignKey("flow_steps.id", ondelete="SET NULL"), nullable=True)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    request: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    response: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    extracted: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)

    run: Mapped["FlowRun"] = relationship("FlowRun", back_populates="step_results")

    __table_args__ = (
        Index("ix_flow_step_result_run", "run_id"),
    )


class CollectionVariable(Base):
    """Store a variable scoped to a folder/file node; walks to root for inheritance.

    Attributes:
        id: Primary key.
        node_id: FK to the node (folder or file) this variable is attached to.
        key: Variable name used in ``{{key}}`` placeholder resolution.
        value: Plaintext or encrypted value; encrypted when is_secret is ``True``.
        is_secret: ``True`` masks value in list responses and encrypts at rest.
        description: Optional note; ``None`` when not provided.
        created_at: Creation timestamp.
        node: Owning Node relationship.
    """

    __tablename__ = "collection_variables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    node_id: Mapped[int] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())

    node: Mapped["Node"] = relationship("Node", foreign_keys=[node_id])

    __table_args__ = (
        Index("ix_collection_var_node_key", "node_id", "key", unique=True),
    )


class AuditLog(Base):
    """Store an immutable audit event for any mutating action in the system.

    Attributes:
        id: Primary key.
        username: Email of the user who performed the action; indexed for per-user queries.
        workspace_id: Workspace the action occurred in; ``None`` for account-level actions (login, signup).
        action: Verb describing what happened (e.g. ``node.create``, ``api.delete``).
        entity_type: Type of object acted on (e.g. ``node``, ``api_case``, ``workspace``).
        entity_id: Numeric ID of the object acted on; ``None`` when not applicable.
        extra: JSON bag of context (before/after values, extra info); ``None`` when not captured.
        ip: Client IP address from the request; ``None`` when not available.
        created_at: UTC timestamp when the event was recorded; indexed for time-range queries.
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    workspace_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    extra: Mapped[Optional[Dict[str, Any]]] = mapped_column("metadata", JSON, nullable=True)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    __table_args__ = (
        Index("ix_audit_workspace_created", "workspace_id", "created_at"),
    )


class ApiSpec(Base):
    """Store an imported OpenAPI/Swagger specification and its normalised parsed form.

    Attributes:
        id: Primary key.
        workspace_id: FK to the owning workspace; cascade-deleted when workspace is removed.
        name: User-supplied display name for this spec.
        version: Spec version string (e.g. ``"1.0.0"``); ``None`` when not provided.
        format: Detected format — ``"openapi"`` for 3.x or ``"swagger"`` for 2.0.
        raw: Original uploaded spec as a JSON-compatible dict (after YAML parse if needed).
        parsed: Normalised 3.0-shaped spec with ``$ref`` s inlined; used by contract-test.
        created_at: Timestamp when the spec was imported.
        workspace: Owning Workspace relationship.
    """

    __tablename__ = "api_specs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    format: Mapped[str] = mapped_column(String(20), nullable=False, default="openapi")
    raw: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    parsed: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=datetime.now, server_default=func.now()
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", foreign_keys=[workspace_id])

    __table_args__ = (
        Index("ix_api_spec_workspace", "workspace_id"),
        CheckConstraint("format IN ('openapi', 'swagger')", name="ck_api_spec_format"),
    )


# ---------------------------
# Mock Servers (Phase 8)
# ---------------------------
class MockServer(Base):
    """Store a mock server that serves canned responses for registered routes.

    Attributes:
        id: Primary key.
        workspace_id: FK to the owning workspace; cascade-deleted when workspace is removed.
        name: Display name for this mock server.
        description: Optional free-text description; ``None`` when not provided.
        public_token: Unguessable 64-char hex token used in the public serve URL; unique.
        enabled: ``True`` when the server accepts traffic; ``False`` returns 503.
        rate_limit: Max requests per minute; ``0`` disables rate limiting.
        created_at: Creation timestamp.
        updated_at: Last modification timestamp.
        workspace: Owning Workspace relationship.
        routes: All MockRoute records for this server; cascade-deleted with server.
    """

    __tablename__ = "mock_servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rate_limit: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now(), onupdate=func.now())

    workspace: Mapped["Workspace"] = relationship("Workspace", foreign_keys=[workspace_id])
    routes: Mapped[List["MockRoute"]] = relationship(
        "MockRoute", back_populates="server", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_mock_server_workspace", "workspace_id"),
    )


class MockRoute(Base):
    """Define a single route on a mock server that matches requests and returns a canned response.

    Attributes:
        id: Primary key.
        server_id: FK to the owning MockServer; cascade-deleted when server is removed.
        method: HTTP method to match — ``"GET"``, ``"POST"``, ``"PUT"``, ``"PATCH"``, or ``"DELETE"``.
        path: URL path template (e.g. ``/api/users/{id}``); ``{param}`` segments are wildcards.
        status_code: HTTP status code to return; defaults to 200.
        response_headers: JSON dict of headers to include in the response; ``None`` when none.
        response_body: Response body string; may contain ``{{$uuid}}`` / ``{{$randomInt}}`` tokens; ``None`` for empty body.
        delay_ms: Milliseconds to wait before responding; ``0`` means no delay.
        priority: Match priority when multiple routes share the same method + path pattern; higher wins.
        created_at: Creation timestamp.
        server: Owning MockServer relationship.
    """

    __tablename__ = "mock_routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    server_id: Mapped[int] = mapped_column(
        ForeignKey("mock_servers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    response_headers: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delay_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())

    server: Mapped["MockServer"] = relationship("MockServer", back_populates="routes")

    __table_args__ = (
        CheckConstraint(
            "method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')", name="ck_mock_route_method"
        ),
        CheckConstraint("delay_ms >= 0", name="ck_mock_route_delay_gte_0"),
        Index("ix_mock_route_server_method_path", "server_id", "method", "path"),
    )


# ---------------------------
# Published Docs (Phase 9)
# ---------------------------
class PublishedDoc(Base):
    """Store a generated documentation snapshot for a node (folder/collection), optionally published via token.

    Attributes:
        id: Primary key.
        node_id: FK to the documented node; cascade-deleted when node is removed.
        workspace_id: Workspace the node belongs to; denormalised for access checks.
        generated_by: Username of the user who last triggered generation.
        public_token: Unguessable 64-char hex token for the public read URL; ``None`` when not published.
        content: Rendered doc model JSON ({title, apis:[{name, method, endpoint, cases:[...]}]}).
        created_at: Timestamp of last generation.
        updated_at: Timestamp of last publish/revoke action.
        node: Owning Node relationship.
    """

    __tablename__ = "published_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    workspace_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    generated_by: Mapped[str] = mapped_column(String(255), nullable=False)
    public_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True, index=True)
    content: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now(), onupdate=func.now())

    node: Mapped["Node"] = relationship("Node", foreign_keys=[node_id])

    __table_args__ = (
        Index("ix_published_doc_token", "public_token"),
        Index("ix_published_doc_workspace", "workspace_id"),
    )


# ---------------------------
# Monitors (Phase 10)
# ---------------------------
class Monitor(Base):
    """Store a named monitor that surfaces uptime/p95 rollup for a bulk test schedule.

    Attributes:
        id: Primary key.
        workspace_id: FK to the owning workspace; cascade-deleted when workspace is removed.
        schedule_id: FK to the BulkTestSchedule being monitored; unique (one monitor per schedule).
        name: Display name for this monitor.
        uptime_pct: Percentage of non-failed completed executions in the last 30 days; ``None`` when no executions yet.
        p95_latency_ms: 95th percentile of duration_ms across completed executions in the last 30 days; ``None`` when no executions yet.
        last_status: Status of the most recently completed execution (``"success"``, ``"partial"``, or ``"failed"``); ``None`` when no executions yet.
        updated_at: Timestamp of the last rollup update.
        workspace: Owning Workspace relationship.
        schedule: Monitored BulkTestSchedule relationship.
    """

    __tablename__ = "monitors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("bulk_test_schedules.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    uptime_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    p95_latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=datetime.now, server_default=func.now(), onupdate=func.now()
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", foreign_keys=[workspace_id])
    schedule: Mapped["BulkTestSchedule"] = relationship("BulkTestSchedule", foreign_keys=[schedule_id])

    __table_args__ = (
        Index("ix_monitor_workspace", "workspace_id"),
    )


# ---------------------------
# Comments (Phase 11)
# ---------------------------
class Comment(Base):
    """Store a threaded comment attached to any entity (node, api, api_case, or flow).

    Attributes:
        id: Primary key.
        workspace_id: FK to the owning workspace; cascade-deleted when workspace is removed.
        entity_type: Kind of entity being commented on — ``"node"``, ``"api"``, ``"api_case"``, or ``"flow"``.
        entity_id: Numeric ID of the entity being commented on.
        author_username: Email of the user who posted the comment.
        body: Comment text content.
        parent_id: FK to a parent Comment for threaded replies; ``None`` for top-level comments.
        created_at: Timestamp when the comment was posted.
        workspace: Owning Workspace relationship.
        parent: Parent Comment relationship for threaded replies; ``None`` for top-level.
    """

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    author_username: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("comments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=datetime.now, server_default=func.now()
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", foreign_keys=[workspace_id])
    parent: Mapped[Optional["Comment"]] = relationship("Comment", remote_side="Comment.id", foreign_keys=[parent_id])

    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('node', 'api', 'api_case', 'flow')", name="ck_comment_entity_type"
        ),
        Index("ix_comment_entity", "entity_type", "entity_id"),
        Index("ix_comment_workspace", "workspace_id"),
    )


# ---------------------------
# Node Versions (Phase 11)
# ---------------------------
class NodeVersion(Base):
    """Store a point-in-time snapshot of a node subtree for version history and restore.

    Attributes:
        id: Primary key.
        node_id: FK to the snapshotted node; cascade-deleted when node is removed.
        snapshot: JSON blob capturing the full subtree at snapshot time (node + children + apis + cases).
        author_username: Email of the user who created the snapshot.
        message: Optional description of what changed; ``None`` when not provided.
        created_at: Timestamp when the snapshot was taken.
        node: Owning Node relationship.
    """

    __tablename__ = "node_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    snapshot: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    author_username: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=datetime.now, server_default=func.now()
    )

    node: Mapped["Node"] = relationship("Node", foreign_keys=[node_id])

    __table_args__ = (
        Index("ix_node_version_node_created", "node_id", "created_at"),
    )


# ---------------------------
# Phase 13 — Governance
# ---------------------------
class GovernanceRule(Base):
    """Store a named linting rule that applies to all APIs and specs in a workspace.

    Attributes:
        id: Primary key.
        workspace_id: FK to the owning workspace; cascade-deleted when workspace is removed.
        name: Short display name for the rule.
        rule_type: Category of check — ``"naming"`` enforces a pattern on API names/paths,
                   ``"required_field"`` enforces that a request field (header/param) is always
                   present, ``"status_code"`` enforces that an expected status code appears in
                   at least one ApiCase for each Api.
        target: What is being checked — ``"path"``, ``"name"``, ``"header"``, ``"param"``.
        value: The expected value or regex pattern for the rule.
        enabled: ``True`` when the rule is active during linting; ``False`` to disable without deleting.
        created_at: Creation timestamp.
    """

    __tablename__ = "governance_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text('TRUE'))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=datetime.now, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("rule_type IN ('naming','required_field','status_code')", name="ck_gov_rule_type"),
        CheckConstraint("target IN ('path','name','header','param')", name="ck_gov_target"),
        Index("ix_governance_rule_workspace", "workspace_id"),
    )


# ---------------------------
# Theme System v2 — Phase H (custom theme persistence)
# ---------------------------
class UserTheme(Base):
    """Store a user's saved custom theme as a flat CSS token map for cross-device sync.

    Attributes:
        id: Primary key.
        user_id: FK to the owning user; cascade-deleted when user is removed.
        name: Display name for the theme; unique per user via uq_user_themes_user_name.
        token_map: Flat dict of CSS variable name to value (e.g. {"--bg": "#0d1117"}).
        is_active: ``True`` when this is the user's currently applied theme; ``False`` otherwise.
        created_at: Creation timestamp.
        updated_at: Timestamp of the last name/token_map change; refreshed on update.
    """

    __tablename__ = "user_themes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    token_map: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_themes_user_name"),
        Index("ix_user_themes_user_active", "user_id", "is_active"),
    )
