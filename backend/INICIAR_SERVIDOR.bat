@echo off
title HoloClass - servidor (FastAPI)
cd /d "%~dp0"
echo ==========================================================
echo   HoloClass - servidor completo (FastAPI + base de datos)
echo   Interfaz y API en: http://localhost:8000
echo   Documentacion de la API: http://localhost:8000/docs
echo   Para detenerlo, cierra esta ventana.
echo ==========================================================

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo Primera vez: creando el entorno de Python e instalando dependencias...
  py -3.11 -m venv .venv 2>nul || python -m venv .venv
  if not exist ".venv\Scripts\python.exe" (
    echo No se encontro Python. Instala Python 3.11 o superior desde python.org
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

if "%DATABASE_URL%"=="" (
  echo.
  echo Base de datos: SQLite ^(backend\holoclass.db^).
  echo Para usar PostgreSQL, antes de ejecutar este archivo escribe en la consola:
  echo   set DATABASE_URL=postgresql+psycopg://postgres:TU_CLAVE@localhost:5432/holoclass
) else (
  echo Base de datos: %DATABASE_URL%
)
echo.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:8000"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
