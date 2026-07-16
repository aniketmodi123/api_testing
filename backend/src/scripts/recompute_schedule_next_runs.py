"""
What this file does: One-time backfill — recompute next_run for all enabled schedules where
next_run IS NULL (rows created before Batch 2 or rows whose next_run was lost).
Safe to re-run: only touches rows with next_run IS NULL.
Run after deploying Batch 2 (timezone column added).
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select

from config import SessionLocal
from models import BulkTestSchedule
from schedule_triggers import next_run_for, utcnow_naive


async def recompute() -> None:
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(BulkTestSchedule).where(
                    BulkTestSchedule.enabled.is_(True),
                    BulkTestSchedule.next_run.is_(None),
                )
            )
        ).scalars().all()

        if not rows:
            print("No enabled schedules with next_run IS NULL — nothing to do.")
            return

        now = utcnow_naive()
        updated = 0
        skipped = 0

        for s in rows:
            try:
                nxt = next_run_for(s, after=now)
                if nxt is not None:
                    s.next_run = nxt
                    updated += 1
                else:
                    # "once" past its date_time, or weekly with no days configured
                    skipped += 1
            except Exception as e:
                print(f"Schedule {s.id} ({s.name!r}): skipped — {e}", file=sys.stderr)
                skipped += 1

        await db.commit()
        print(f"Done: {updated} updated, {skipped} skipped (past/invalid).")


if __name__ == "__main__":
    asyncio.run(recompute())
