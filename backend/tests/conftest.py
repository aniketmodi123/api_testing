"""
What this file does: Pytest fixtures that drive the FastAPI app over httpx against an
in-memory SQLite database with JWT auth wired, so endpoint tests need no external Postgres.
"""
import os

# config.py reads these at import time to build the Postgres engine string. Set harmless
# dummies BEFORE importing the app so the import never fails; tests never connect to it
# (every DB access is redirected to the in-memory SQLite engine below).
os.environ.setdefault("PRODUCTION_POSTGRES_HOST", "localhost")
os.environ.setdefault("PRODUCTION_POSTGRES_USER", "test")
os.environ.setdefault("PRODUCTION_POSTGRES_PASSWORD", "test")
os.environ.setdefault("PRODUCTION_POSTGRES_DB", "test")
os.environ.setdefault("PRODUCTION_POSTGRES_PORT", "5432")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

import httpx
import pytest_asyncio
from httpx import ASGITransport
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import config
import security
from config import JWT_ALGORITHM, JWT_SECRET_KEY, get_db
from main import app
from models import Base, Cache, User

# StaticPool + a single shared in-memory connection so every session (seed, route, auth
# middleware) sees the same committed data within one test.
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_engine():
    """Fresh in-memory SQLite engine with all tables created; disposed after each test."""
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session_factory(db_engine):
    """Async sessionmaker bound to the per-test engine."""
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def db(session_factory):
    """Standalone session for seeding rows in a test's Arrange phase."""
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(session_factory, monkeypatch):
    """httpx AsyncClient bound to the ASGI app, with both the route DB dependency and the
    auth middleware's session pointed at the in-memory test DB."""
    # AuthMiddleware opens its own session via security.SessionLocal (bound at import) —
    # redirect it so token/blacklist lookups hit the same in-memory data the test seeds.
    monkeypatch.setattr(security, "SessionLocal", session_factory)

    async def _get_db_override():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db_override
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def make_user(db):
    """Factory that inserts a User row and returns it (defaults to tester@example.com)."""
    async def _make(email="tester@example.com", username=None, password="x"):
        user = User(
            username=username or email,
            email=email,
            password=password,
            is_active=True,
            god=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    return _make


@pytest_asyncio.fixture
async def auth_headers(db):
    """Factory that mints a valid JWT, seeds its non-blacklisted Cache row, and returns the
    Authorization + username headers the middleware and routes expect (username = email)."""
    async def _headers(email="tester@example.com"):
        token = jwt.encode({"username": email}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
        db.add(Cache(username=email, token=token, black_list=False))
        await db.commit()
        return {"Authorization": f"Bearer {token}", "username": email}

    return _headers
