@echo off
title HoloClass - modo local
cd /d "%~dp0"
echo ==========================================================
echo   HoloClass - modo local (sin servidor de base de datos)
echo   Se abrira en el navegador: http://localhost:8101
echo   Cuentas, grupos y resultados se guardan en el navegador.
echo   Para el modo completo usa backend\INICIAR_SERVIDOR.bat
echo   Para detenerlo, cierra esta ventana.
echo ==========================================================
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8101"
python -m http.server 8101 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo No se pudo iniciar con "python". Intentando con "py"...
  py -m http.server 8101 --bind 127.0.0.1
)
pause
