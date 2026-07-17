from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration centrale, lue depuis backend/.env"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Supabase ---
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str  # backend uniquement, jamais côté frontend
    # Secret HS256 legacy — optionnel : le projet signe désormais en ES256 (JWKS),
    # ce secret ne sert que de fallback si des tokens HS256 circulent encore.
    SUPABASE_JWT_SECRET: str = ""

    # --- Base de données (connection string pooler Supabase, pour SQLAlchemy/Alembic) ---
    DATABASE_URL: str

    # --- IA (Mistral uniquement — CLAUDE.md) ---
    MISTRAL_API_KEY: str = ""  # backend uniquement, jamais côté frontend
    MISTRAL_MODEL: str = "mistral-small-latest"

    # --- Rapports PDF (WeasyPrint) ---
    # Sur Windows, WeasyPrint a besoin des DLL GTK/Pango (ex. via MSYS2 :
    # pacman -S mingw-w64-x86_64-pango). Renseigner ici le dossier des DLL
    # (ex. C:\msys64\mingw64\bin). Vide = chargement système par défaut (Linux).
    WEASYPRINT_DLL_DIRECTORIES: str = ""

    # --- Divers ---
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"


settings = Settings()
