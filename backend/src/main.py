"""
What this file does: Bootstraps the FastAPI application — configures CORS and auth middleware, registers exception handlers, and mounts all feature routers.
"""

import time
from fastapi.responses import JSONResponse
import pytz
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from config import check_db_connection, engine
from exception_handler import unified_exception_handler
from models import Base, CollectionVariable, Flow, FlowStep, FlowRun, FlowStepResult, ApiSpec, MockServer, MockRoute, PublishedDoc, Monitor, Comment, NodeVersion, GovernanceRule  # triggers table registration
from datetime import datetime
from routers.runner import run_case, execute_direct, bulk_run_cases
from routers.runner import graphql_introspect, ws_proxy, sse_proxy
from routers.workspace import list_workspace_tree
from routers.sso import create_user, forget_password, login, logout, otp_generation, update_user, delete_user, user_profile
from routers.workspace import create_workspace, update_workspace, list_workspace, list_workspace_tree, delete_workspace
from routers.workspace import members as workspace_members
from routers.node import create_node, update_node, list_node, delete_node, move_node, copy_node
from routers.node import bulk_import as bulk_import_node
from routers.node import variables as node_variables
from routers.variables import global_variables
from routers.headers import complete_headers, set_headers,list_headers,delete_headers, update_headers
from routers.api import list_apis, save_api, set_auth
from routers.api_cases import delete_case, get_case, list_search_api_case, create_dup_case, save_api_case
from routers.environment import create_environment, list_environments, resolve_variables, save_variables, delete_variables, list_variables
from routers.environment import resolve_preview
from routers.shedulers import shedule_test
from routers.shedulers import alerts as schedule_alerts
from routers.history import router as history_router
from routers.audit import router as audit_router
from routers.auth import oauth2 as oauth2_router
from routers.flow import crud as flow_crud, run as flow_run
from routers.spec import import_spec as spec_import, crud as spec_crud, curl as spec_curl, contract as spec_contract
from routers.runner import diff as runner_diff
from routers.mock import crud as mock_crud, serve as mock_serve, from_history as mock_from_history
from routers.docs import generate as docs_generate, publish as docs_publish
from routers.monitor import crud as monitor_crud
from routers.collab import comments as collab_comments, versions as collab_versions
from routers.governance import rules as governance_rules
from routers.meta import comparison as meta_comparison
from security import AuthMiddleware
from http_client import close_http_client

FASTAPI_CONFIG = {
    'title': 'Testing server',
    'version': '1.0',
    'tzinfo': pytz.timezone('Asia/Kolkata')
}

# Swagger at /swagger
app = FastAPI(docs_url="/swagger", redoc_url=None, openapi_url="/openapi.json")



app.add_middleware(AuthMiddleware)


import os as _os
_cors_raw = _os.environ.get("CORS_ORIGINS", "*")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()] if _cors_raw != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Run DB table creation and connectivity check on application startup."""
    import os
    if not os.environ.get("SECRET_ENC_KEY"):
        raise RuntimeError(
            "SECRET_ENC_KEY env var is not set. "
            "Generate one: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    datetime.now(pytz.timezone('Asia/Kolkata'))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await check_db_connection()


@app.on_event("shutdown")
async def shutdown_event():
    """Drain the shared outbound HTTP client connection pool on shutdown."""
    await close_http_client()


@app.get("/health")
async def health_check():
    """GET /health — return service and database health status; raises 503 when DB is unreachable."""
    try:
        # Quick database connectivity check
        await check_db_connection()
        return {
            "status": "healthy",
            "timestamp": datetime.now(pytz.timezone('Asia/Kolkata')).isoformat(),
            "service": "api-testing-backend",
            "database": "connected"
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "timestamp": datetime.now(pytz.timezone('Asia/Kolkata')).isoformat(),
                "service": "api-testing-backend",
                "database": "disconnected",
                "error": str(e)
            }
        )


@app.get("/")
async def root():
    """GET / — return service name, version, and key endpoint links."""
    return {
        "message": "API Testing Backend",
        "version": "1.0",
        "docs": "/swagger",
        "health": "/health",
        "timestamp": datetime.now(pytz.timezone('Asia/Kolkata')).isoformat()
    }


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Attach X-Process-Time header and normalise 404/500/204 status codes to project conventions."""
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    if "content-length" in response.headers:
        response.headers["X-Process-Time"] = str(f'{process_time:0.4f} sec')

        if response.status_code == 404:
            return JSONResponse(content={"error_message": "Not found"}, status_code=404)
        elif response.status_code == 500:
            return JSONResponse(content={"error_message": "Something went wrong"}, status_code=409)
        elif response.status_code == 204:
            return Response(status_code=204)

    return response



app.add_exception_handler(HTTPException, unified_exception_handler)
app.add_exception_handler(Exception, unified_exception_handler)


# sso
app.include_router(create_user.router, prefix="", tags=["sso"])
app.include_router(login.router, prefix="", tags=["sso"])
app.include_router(logout.router, prefix="", tags=["sso"])
app.include_router(update_user.router, prefix="", tags=["sso"])
app.include_router(delete_user.router, prefix="", tags=["sso"])
app.include_router(user_profile.router, prefix="", tags=["sso"])
app.include_router(forget_password.router, prefix="", tags=["sso"])
app.include_router(otp_generation.router, prefix="", tags=["sso"])

# workspace
app.include_router(create_workspace.router, prefix="/workspace", tags=["workspace"])
app.include_router(update_workspace.router, prefix="/workspace", tags=["workspace"])
app.include_router(list_workspace.router, prefix="/workspace", tags=["workspace"])
app.include_router(delete_workspace.router, prefix="/workspace", tags=["workspace"])
app.include_router(list_workspace_tree.router, prefix="/workspace", tags=["workspace"])
app.include_router(workspace_members.router, prefix="/workspace", tags=["workspace"])


# file/folder
app.include_router(create_node.router, prefix="/node", tags=["node"])
app.include_router(update_node.router, prefix="/node", tags=["node"])
app.include_router(list_node.router, prefix="/node", tags=["node"])
app.include_router(delete_node.router, prefix="/node", tags=["node"])
app.include_router(move_node.router, prefix="/node", tags=["node"])
app.include_router(copy_node.router, prefix="/node", tags=["node"])
app.include_router(bulk_import_node.router, prefix="", tags=["node"])
app.include_router(node_variables.router, tags=["Collection Variables"])

# global variables (Phase 2)
app.include_router(global_variables.router, prefix="", tags=["Global Variables"])


# headers
app.include_router(set_headers.router, tags=["Headers"])
app.include_router(update_headers.router, tags=["Headers"])
app.include_router(list_headers.router, tags=["Headers"])
app.include_router(delete_headers.router, tags=["Headers"])
app.include_router(complete_headers.router, tags=["Headers"])


# apis
app.include_router(list_apis.router, tags=["APIs"])
app.include_router(save_api.router, tags=["APIs"])
app.include_router(set_auth.router, tags=["APIs"])

#api cases
app.include_router(list_search_api_case.router, tags=["API Cases"])
app.include_router(get_case.router, tags=["API Cases"])
app.include_router(create_dup_case.router, tags=["API Cases"])
app.include_router(delete_case.router, tags=["API Cases"])
app.include_router(save_api_case.router, tags=["API Cases"])

# environment management
app.include_router(create_environment.router, prefix="/environment", tags=["Environment Management"])
app.include_router(list_environments.router, prefix="/environment", tags=["Environment Management"])
app.include_router(save_variables.router, prefix="/environment", tags=["Environment Variables"])
app.include_router(resolve_variables.router, prefix="/environment", tags=["Variable Resolution"])
app.include_router(list_variables.router, prefix="/environment", tags=["Variable Resolution"])
app.include_router(delete_variables.router, prefix="/environment", tags=["Variable Resolution"])
app.include_router(resolve_preview.router, tags=["Variable Resolution"])

#runner
app.include_router(run_case.router, tags=["Runner"])
app.include_router(execute_direct.router, prefix="/api", tags=["API Execution"])
app.include_router(bulk_run_cases.router, tags=["Runner"])
app.include_router(graphql_introspect.router, prefix="/api", tags=["GraphQL"])
app.include_router(ws_proxy.router, prefix="/api", tags=["WebSocket"])
app.include_router(sse_proxy.router, prefix="/api", tags=["SSE"])

# schedules
app.include_router(shedule_test.router, tags=["Schedules"])
app.include_router(schedule_alerts.router, tags=["Schedule Alerts"])

# history
app.include_router(history_router)
app.include_router(audit_router, tags=["Audit"])
app.include_router(oauth2_router.router, tags=["OAuth2"])

# flows (Phase 5)
app.include_router(flow_crud.router, tags=["Flows"])
app.include_router(flow_run.router, tags=["Flows"])

# specs + cURL + contract testing (Phase 6 + 7)
app.include_router(spec_import.router, tags=["Specs"])
app.include_router(spec_crud.router, tags=["Specs"])
app.include_router(spec_curl.router, tags=["Specs"])
app.include_router(spec_contract.router, tags=["Specs"])
app.include_router(runner_diff.router, tags=["Runner"])

# mock servers (Phase 8)
app.include_router(mock_crud.router, tags=["Mock Servers"])
app.include_router(mock_serve.router, tags=["Mock Servers"])
app.include_router(mock_from_history.router, tags=["Mock Servers"])

# documentation (Phase 9)
app.include_router(docs_generate.router, tags=["Documentation"])
app.include_router(docs_publish.router, tags=["Documentation"])

# monitors (Phase 10)
app.include_router(monitor_crud.router, tags=["Monitors"])

# collaboration — comments + versions (Phase 11)
app.include_router(collab_comments.router, tags=["Collaboration"])
app.include_router(collab_versions.router, tags=["Collaboration"])

# governance — rules + lint (Phase 13)
app.include_router(governance_rules.router, tags=["Governance"])

# meta — comparison sheet (Phase 15)
app.include_router(meta_comparison.router, tags=["Meta"])