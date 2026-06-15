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
        status: Current run state — ``"queued"``, ``"running"``, ``"completed"``, or ``"failed"``.
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
