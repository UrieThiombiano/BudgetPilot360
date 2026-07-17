"""
Session SQLAlchemy async connectée directement au Postgres Supabase
(via le connection string du connection pooler, cf. DATABASE_URL dans .env).

Utile pour les requêtes analytiques/dashboard complexes où l'ORM est plus
confortable que le client Supabase. Pour les opérations CRUD simples avec RLS,
préférer le client Supabase (app/core/supabase_client.py) qui applique la RLS
nativement selon le token de l'utilisateur.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.ENVIRONMENT == "development")
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
