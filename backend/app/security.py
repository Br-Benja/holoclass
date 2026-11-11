"""Contraseñas (bcrypt), tokens JWT y dependencias de autenticación."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import SECRET_KEY, TOKEN_DAYS
from .db import get_db
from .models import User

ALGO = "HS256"
bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    payload = {"sub": str(user.id), "role": user.role, "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGO)


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inicia sesión para continuar.")
    try:
        data = jwt.decode(cred.credentials, SECRET_KEY, algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada.")
    user = db.get(User, int(data["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado.")
    return user


def optional_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User | None:
    if not cred:
        return None
    try:
        return current_user(cred, db)
    except HTTPException:
        return None


def teacher_user(user: User = Depends(current_user)) -> User:
    if user.role not in ("docente", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo para docentes.")
    return user
