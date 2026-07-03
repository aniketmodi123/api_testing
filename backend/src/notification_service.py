"""
Dispatch alert notifications (email + webhook) after a BulkTestExecution completes.
Fire-and-forget: failures are logged, never re-raised.
"""
from __future__ import annotations

import asyncio
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import BulkTestExecution, BulkTestSchedule, ScheduleAlert
from utils import logs


# ── Helpers ─────────────────────────────────────────────────────────────────

def _execution_status_label(execution: BulkTestExecution) -> str:
    """What it does: Map execution.status to a display label — PASSED, PARTIAL, or FAILED."""
    if execution.status == "success":
        return "PASSED"
    if execution.status == "partial":
        return "PARTIAL"
    return "FAILED"


def _build_webhook_payload(schedule: BulkTestSchedule, execution: BulkTestExecution) -> Dict[str, Any]:
    """What it does: Build a Slack-compatible webhook payload summarising the schedule execution result."""
    status_label = _execution_status_label(execution)
    summary_text = (
        f"*Schedule:* {schedule.name}\n"
        f"*Status:* {status_label}\n"
        f"*Passed:* {execution.passed}/{execution.total_cases}\n"
        f"*Duration:* {execution.duration_ms}ms\n"
        f"*Finished:* {execution.finished_at}"
    )
    return {
        "text": f"Schedule '{schedule.name}' — {status_label}",
        "blocks": [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": summary_text},
            }
        ],
    }


def _build_email_html(schedule: BulkTestSchedule, execution: BulkTestExecution) -> str:
    """What it does: Render an HTML email body with status-coloured heading and execution summary table."""
    status_label = _execution_status_label(execution)
    color = "#22c55e" if execution.status == "success" else ("#f59e0b" if execution.status == "partial" else "#ef4444")
    return f"""
<html><body style="font-family:Arial,sans-serif;background:#f4f6f9;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <h2 style="color:{color};margin-top:0">Schedule {status_label}: {schedule.name}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#666">Status</td><td style="font-weight:600;color:{color}">{status_label}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Passed</td><td>{execution.passed} / {execution.total_cases}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Duration</td><td>{execution.duration_ms} ms</td></tr>
      <tr><td style="padding:6px 0;color:#666">Finished</td><td>{execution.finished_at}</td></tr>
    </table>
    <p style="color:#999;font-size:12px;margin-top:24px">APIPilot</p>
  </div>
</body></html>
"""


# ── Dispatchers ──────────────────────────────────────────────────────────────

async def _dispatch_webhook(target_url: str, payload: Dict[str, Any]) -> None:
    """What it does: POST the webhook payload to target_url; log and suppress any HTTP or network error."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(target_url, json=payload)
    except Exception as e:
        logs(f"[alerts] webhook to {target_url} failed: {e}", type="error")


async def _dispatch_email(target_email: str, subject: str, html_body: str) -> None:
    """What it does: Send an HTML email via SMTP; skip silently when SMTP credentials are absent, log and suppress failures."""
    smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_username = os.environ.get("SMTP_USERNAME", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")

    if not all([smtp_username, smtp_password]):
        logs("[alerts] SMTP credentials not configured — skipping email alert", type="warning")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = smtp_username
        msg["To"] = target_email
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        def _send() -> None:
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.sendmail(smtp_username, target_email, msg.as_string())
            server.quit()

        # Run blocking SMTP in thread to avoid blocking event loop
        await asyncio.get_event_loop().run_in_executor(None, _send)
        logs(f"[alerts] email sent to {target_email}")
    except Exception as e:
        logs(f"[alerts] email to {target_email} failed: {e}", type="error")


# ── Public: dispatch_alerts ──────────────────────────────────────────────────

async def dispatch_alerts(
    db: AsyncSession,
    schedule_id: int,
    execution: BulkTestExecution,
) -> None:
    """
    What it does: Fetch all ScheduleAlert rows for schedule_id, filter by trigger condition, and fire email/webhook notifications concurrently.
    Args:
        schedule_id: PK of the BulkTestSchedule whose alerts to load.
        execution: Completed BulkTestExecution whose status drives which alerts fire.
    Steps:
        - Step 1: Query all ScheduleAlert rows for schedule_id; return early if none found
        - Step 2: Fetch the parent BulkTestSchedule; return early if schedule is missing
        - Step 3: For each alert, check whether on_success/on_partial/on_failure flag matches execution.status; skip alerts that don't match
        - Step 4: Build a webhook or email dispatch task per matching alert
        - Step 5: Gather all tasks concurrently with return_exceptions=True; catch and log any outer error without re-raising
    """
    try:
        alerts: List[ScheduleAlert] = (
            await db.execute(
                select(ScheduleAlert).where(ScheduleAlert.schedule_id == schedule_id)
            )
        ).scalars().all()

        if not alerts:
            return

        schedule = await db.get(BulkTestSchedule, schedule_id)
        if not schedule:
            return

        status = execution.status  # "success" | "partial" | "failed"

        tasks = []
        for alert in alerts:
            should_fire = (
                (status == "success" and alert.on_success) or
                (status == "partial" and alert.on_partial) or
                (status == "failed" and alert.on_failure)
            )
            if not should_fire:
                continue

            if alert.type == "webhook":
                payload = _build_webhook_payload(schedule, execution)
                tasks.append(_dispatch_webhook(alert.target, payload))
            elif alert.type == "email":
                subject = f"[APIPilot] Schedule '{schedule.name}' — {_execution_status_label(execution)}"
                html = _build_email_html(schedule, execution)
                tasks.append(_dispatch_email(alert.target, subject, html))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    except Exception as e:
        logs(f"[alerts] dispatch_alerts error: {e}", type="error")
