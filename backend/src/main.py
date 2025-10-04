import asyncio
import time
from fastapi.responses import JSONResponse
import pytz
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from config import check_db_connection, engine
from exception_handler import unified_exception_handler
from models import Base
from datetime import datetime
from routers.runner import run_case, execute_direct, bulk_run_cases
from routers.script.test_scheduler import run_engine
from routers.workspace import list_workspace_tree
from routers.sso import create_user, forget_password, login, logout, otp_generation, update_user, delete_user, user_profile
from routers.workspace import create_workspace, update_workspace, list_workspace, list_workspace_tree,delete_workspace
from routers.node import create_node, update_node, list_node, delete_node, move_node, copy_node
from routers.headers import complete_headers, set_headers,list_headers,delete_headers, update_headers
from routers.api import list_apis, save_api
from routers.api_cases import delete_case, get_case, list_search_api_case, create_dup_case, save_api_case
from routers.environment import create_environment, list_environments, resolve_variables, save_variables,delete_variables, list_variables
from routers.shedulers import shedule_test
from security import AuthMiddleware

FASTAPI_CONFIG = {
    'title': 'Testing server',
    'version': '1.0',
    'tzinfo': pytz.timezone('Asia/Kolkata')
}

# Swagger at /swagger
app = FastAPI(docs_url="/swagger", redoc_url=None, openapi_url="/openapi.json")



app.add_middleware(AuthMiddleware)


# CORS (open; tighten if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # 👈 if you don
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    # Set the timezone for the application
    datetime.now(pytz.timezone('Asia/Kolkata'))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await check_db_connection()
    asyncio.create_task(run_engine())


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
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
    """Root endpoint with basic API information."""
    return {
        "message": "API Testing Backend",
        "version": "1.0",
        "docs": "/swagger",
        "health": "/health",
        "timestamp": datetime.now(pytz.timezone('Asia/Kolkata')).isoformat()
    }


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
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


# file/folder
app.include_router(create_node.router, prefix="/node", tags=["node"])
app.include_router(update_node.router, prefix="/node", tags=["node"])
app.include_router(list_node.router, prefix="/node", tags=["node"])
app.include_router(delete_node.router, prefix="/node", tags=["node"])
app.include_router(move_node.router, prefix="/node", tags=["node"])
app.include_router(copy_node.router, prefix="/node", tags=["node"])


# headers
app.include_router(set_headers.router, tags=["Headers"])
app.include_router(update_headers.router, tags=["Headers"])
app.include_router(list_headers.router, tags=["Headers"])
app.include_router(delete_headers.router, tags=["Headers"])
app.include_router(complete_headers.router, tags=["Headers"])


# apis
app.include_router(list_apis.router, tags=["APIs"])
app.include_router(save_api.router, tags=["APIs"])

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

#runner
app.include_router(run_case.router, tags=["Runner"])
app.include_router(execute_direct.router, prefix="/api", tags=["API Execution"])
app.include_router(bulk_run_cases.router, tags=["Runner"])

# schedules
app.include_router(shedule_test.router, tags=["Schedules"])