"""
What this file does: Exposes GET /meta/comparison — returns a static feature-by-feature
comparison of APIPilot vs Postman, suitable for rendering a "why us" table in the frontend.
"""
from fastapi import APIRouter
from utils import create_response

router = APIRouter()

_COMPARISON = [
    {
        "feature": "Request builder",
        "postman": "yes",
        "apipilot": "yes",
        "edge": None,
    },
    {
        "feature": "Collections & folders",
        "postman": "yes",
        "apipilot": "yes",
        "edge": None,
    },
    {
        "feature": "Environments & variables",
        "postman": "yes",
        "apipilot": "yes",
        "edge": None,
    },
    {
        "feature": "Variable scope chain (global → collection → env → local)",
        "postman": "partial",
        "apipilot": "yes",
        "edge": "X3 — full 4-level chain with live inline preview as you type",
    },
    {
        "feature": "Monitors (uptime + latency)",
        "postman": "paid add-on, run-limited",
        "apipilot": "yes — free, unlimited",
        "edge": "X2 — scheduler-native, no seat charge, no run cap",
    },
    {
        "feature": "Regression diff (run vs previous run)",
        "postman": "basic pass/fail only",
        "apipilot": "yes — field-level diff",
        "edge": "X4 — highlights exactly what changed between runs",
    },
    {
        "feature": "Secret vault (encrypted at rest)",
        "postman": "cloud-hosted vault",
        "apipilot": "yes — self-hosted, your DB",
        "edge": "X5 — secrets never leave your infrastructure",
    },
    {
        "feature": "cURL ↔ request ↔ OpenAPI (bidirectional)",
        "postman": "one-way import, lossy",
        "apipilot": "yes — full round-trip",
        "edge": "X6 — paste cURL → request → export OpenAPI, and back",
    },
    {
        "feature": "Flow engine (chain + branch + condition)",
        "postman": "paid Flows, separate surface",
        "apipilot": "yes — free, integrated",
        "edge": "X7 — jsonpath extract, conditional branch, set_var steps unlimited",
    },
    {
        "feature": "Folder-inherited headers & auth",
        "postman": "shallow inheritance",
        "apipilot": "yes — full root→leaf merge",
        "edge": "X8 — auth + headers cascade from folder to file automatically",
    },
    {
        "feature": "Collaboration (comments + version history)",
        "postman": "paid per editor seat",
        "apipilot": "yes — unlimited collaborators",
        "edge": "X9 — self-hosted, no seat tax",
    },
    {
        "feature": "Mock servers from real captured responses",
        "postman": "manual example setup",
        "apipilot": "yes — promote from history/results",
        "edge": "X10 — one click from test result to mock route",
    },
    {
        "feature": "OpenAPI import + contract testing",
        "postman": "import only",
        "apipilot": "yes — import + live contract test + export",
        "edge": "X6 combined — validates live responses against spec schema",
    },
    {
        "feature": "API governance / lint",
        "postman": "paid API governance (team plan)",
        "apipilot": "yes — free, per-workspace rules",
        "edge": "Naming, required-field, and status-code rules; violations report",
    },
    {
        "feature": "Self-hosted",
        "postman": "no",
        "apipilot": "yes",
        "edge": "Run entirely on your own infra; no SaaS dependency",
    },
    {
        "feature": "Price",
        "postman": "$14/user/month (team plan)",
        "apipilot": "free / open",
        "edge": "No per-seat cost",
    },
]


@router.get("/meta/comparison")
async def feature_comparison():
    """GET /meta/comparison — return APIPilot vs Postman feature comparison as JSON; no auth required."""
    return create_response(200, data=_COMPARISON)
