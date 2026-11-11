"""Configuración por variables de entorno."""
import logging
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_DIR = BASE_DIR.parent                               # 02_HoloClass/
FRONTEND_DIR = Path(os.getenv("HOLOCLASS_FRONTEND", PROJECT_DIR / "app"))
CONTENT_PATH = Path(os.getenv("HOLOCLASS_CONTENT", FRONTEND_DIR / "data" / "content.json"))
UPLOAD_DIR = Path(os.getenv("HOLOCLASS_UPLOADS", BASE_DIR / "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# PostgreSQL recomendado:  postgresql+psycopg://usuario:clave@localhost:5432/holoclass
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(BASE_DIR / 'holoclass.db').as_posix()}")
SECRET_KEY = os.getenv("HOLOCLASS_SECRET", "cambia-esta-clave-en-produccion")
TOKEN_DAYS = int(os.getenv("HOLOCLASS_TOKEN_DAYS", "7"))
CORS_ORIGINS = [o.strip() for o in os.getenv("HOLOCLASS_CORS", "*").split(",") if o.strip()]
MAX_UPLOAD_MB = int(os.getenv("HOLOCLASS_MAX_UPLOAD_MB", "25"))
SEED_DEMO = os.getenv("HOLOCLASS_SEED_DEMO", "1") == "1"

log = logging.getLogger("holoclass")
if DATABASE_URL.startswith("sqlite"):
    log.warning("Usando SQLite (%s). Para PostgreSQL define DATABASE_URL.", DATABASE_URL)
if SECRET_KEY == "cambia-esta-clave-en-produccion":
    log.warning("HOLOCLASS_SECRET no está definida: usa una clave propia fuera de desarrollo.")
