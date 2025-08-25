from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Boolean, Column, DateTime, Integer, String, Text, ForeignKey, CheckConstraint, JSON, TIMESTAMP, func, text
)
from sqlalchemy.orm import relationship, Mapped, mapped_column, declarative_base

Base = declarative_base()

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

    user: Mapped["User"] = relationship("User", back_populates="workspaces")
    nodes: Mapped[list["Node"]] = relationship("Node", back_populates="workspace")


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
