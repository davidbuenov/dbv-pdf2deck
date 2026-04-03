@echo off
setlocal enableextensions
cd /d "%~dp0"

set "ENSURE_INSTALL=0"
if /i "%~1"=="--ensure-install" set "ENSURE_INSTALL=1"

if not exist "backend\venv\Scripts\python.exe" (
    if "%ENSURE_INSTALL%"=="1" (
        call "%~dp0instalar_y_ejecutar.cmd"
        exit /b %errorlevel%
    )
    echo [ERROR] No existe entorno virtual en backend\venv
    echo Ejecuta primero: instalar_y_ejecutar.cmd
    pause
    exit /b 1
)

echo ========================================================
echo DBV PDF2Deck - Arranque rapido
echo ========================================================

echo -> Iniciando Backend API en puerto 8000...
start cmd /k "title DBV PDF2Deck Backend API && cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn main:app --port 8000"

echo -> Iniciando Web Client en puerto 5500...
start cmd /k "title DBV PDF2Deck Web Client && cd /d %~dp0frontend && python -m http.server 5500"

echo -> Abriendo navegador...
start "" "http://localhost:5500"

echo.
echo Todo iniciado correctamente.
echo Si quieres detener servicios, ejecuta stop_dev.cmd
exit /b 0
