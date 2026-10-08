from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from backend.app.core.config import settings

# Determine engine parameters dynamically based on dialect
is_sqlite = "sqlite" in settings.DATABASE_URL.lower()

engine_kwargs = {
    "echo": False,
    "future": True,
}

import os
import sys

if is_sqlite:
    # SQLite local development settings
    engine_kwargs["connect_args"] = {"check_same_thread": False}
elif os.getenv("TESTING") == "1" or "pytest" in sys.modules:
    from sqlalchemy.pool import NullPool
    engine_kwargs["poolclass"] = NullPool
else:
    # Production-grade PostgreSQL (asyncpg) connection pooling
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

engine = create_async_engine(
    settings.DATABASE_URL,
    **engine_kwargs
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
