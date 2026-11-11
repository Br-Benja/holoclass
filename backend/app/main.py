"""HoloClass · aplicación FastAPI.

Ejecutar (desde la carpeta backend):
    uvicorn app.main:app --reload
y abrir http://localhost:8000  (sirve también la interfaz web de ../app).
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import content
from .api import router
from .config import CORS_ORIGINS, FRONTEND_DIR, SEED_DEMO, UPLOAD_DIR
from .db import Base, SessionLocal, engine


def init_db():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        content.seed(db, demo=SEED_DEMO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="HoloClass API", version="1.0.0", lifespan=lifespan,
              description="Aula interactiva con realidad aumentada: catálogo, sesiones de aprendizaje, cuestionarios y panel docente.")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
