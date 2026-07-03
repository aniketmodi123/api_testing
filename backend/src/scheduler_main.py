"""
What this file does: Standalone entry point that creates database tables, verifies connectivity, then starts the APScheduler engine.
"""

import asyncio

from config import check_db_connection, engine
from models import Base
from routers.script.test_scheduler import run_engine


async def main() -> None:
    """What it does: Bootstrap the scheduler process — run migrations, confirm DB connectivity, then start the scheduler engine."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await check_db_connection()
    await run_engine()


if __name__ == "__main__":
    asyncio.run(main())