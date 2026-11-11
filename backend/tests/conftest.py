import os
import sys
import tempfile
from pathlib import Path

import pytest

# Base de datos aislada para las pruebas (SQLite en memoria por defecto; se puede pasar TEST_DATABASE_URL para PostgreSQL)
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite://")
os.environ["HOLOCLASS_UPLOADS"] = tempfile.mkdtemp(prefix="hc_uploads_")
os.environ["HOLOCLASS_SECRET"] = "clave-de-pruebas"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def auth(client, email, password="demo1234"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


@pytest.fixture
def student(client):
    return auth(client, "estudiante@demo.mx")


@pytest.fixture
def teacher(client):
    return auth(client, "docente@demo.mx")
