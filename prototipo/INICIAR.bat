@echo off
title HoloClass - prototipo
cd /d "%~dp0"
echo ==================================================
echo   HoloClass - prototipo
echo   Se abrira en el navegador: http://localhost:8101
echo   Para detenerlo, cierra esta ventana.
echo ==================================================
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8101"
python -m http.server 8101 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo No se pudo iniciar con "python". Intentando con "py"...
  py -m http.server 8101 --bind 127.0.0.1
)
pause
