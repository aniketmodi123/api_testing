"""
What this file does: One-time script to encrypt existing plaintext global variable values where
is_secret=True; safe to re-run (already-encrypted rows are skipped via version prefix check).
Run once after deploying vault.py with SECRET_ENC_KEY set.
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from config import SessionLocal
from models import GlobalVariable
from vault import encrypt as enc_secret, is_ciphertext


async def backfill():
    encrypted = 0
    skipped = 0
    async with SessionLocal() as db:
        result = await db.execute(
            select(GlobalVariable).where(GlobalVariable.is_secret == True)
        )
        rows = result.scalars().all()

        for row in rows:
            if is_ciphertext(row.value):
                skipped += 1
                continue
            row.value = enc_secret(row.value)
            encrypted += 1

        await db.commit()

    print(f"Backfill complete: {encrypted} encrypted, {skipped} already ciphertext.")


if __name__ == "__main__":
    asyncio.run(backfill())
