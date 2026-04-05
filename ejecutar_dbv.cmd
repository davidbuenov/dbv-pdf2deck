@echo off
setlocal enableextensions
cd /d "%~dp0"

echo ========================================================
echo DBV PDF2Deck - Instalador 1 clic (Windows) v1.5
echo ========================================================
echo [1/5] Detectando Python...
set "PY_CMD="
set "PY_DESC="

rem --- Priorizar Python Launcher fijado a 3.12 ---
py -3.12 -c "import sys" >nul 2>nul
if not errorlevel 1 (
    set "PY_CMD=py -3.12"
    set "PY_DESC=py -3.12"
)

rem --- Si no hay launcher, buscar un python.exe que sea exactamente 3.12 ---
if not defined PY_CMD (
    for /f "delims=" %%i in ('where python 2^>nul') do (
        "%%~fi" -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>nul
        if not errorlevel 1 (
            set "PY_CMD=\"%%~fi\""
            set "PY_DESC=%%~fi"
            goto :python_found
        )
    )
)

:python_found
if not defined PY_CMD (
    echo.
    echo [ERROR] No se encontro Python 3.12 utilizable en este equipo.
    echo Este proyecto requiere Python 3.12. Python 3.13 no es compatible.
    echo Asegurate de que Python 3.12 esta instalado y que el comando ^`py -3.12^` funciona.
    pause
    exit /b 1
)

echo [OK] Usando: %PY_DESC%

echo [2/5] Preparando entorno virtual...
cd /d "%~dp0backend"
if not exist "venv\Scripts\python.exe" (
    call %PY_CMD% -m venv venv
    if errorlevel 1 goto :fail
) else (
    echo [OK] Entorno virtual ya existe.
)

echo [3/5] Activando entorno...
call venv\Scripts\activate.bat
if errorlevel 1 goto :fail

echo [4/5] Instalando dependencias (puede tardar varios minutos)...
python -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :fail
pip install -r requirements.txt
if errorlevel 1 goto :fail

cd /d "%~dp0"
echo [5/5] Instalacion completada.

echo.
echo ========================================================
echo Instalacion lista. Iniciando la aplicacion...
echo ========================================================
call "%~dp0ejecutar_dbv.cmd"
exit /b %errorlevel%

:fail
echo.
echo [ERROR] No se pudo completar la instalacion.
echo Revisa el mensaje anterior y vuelve a intentarlo.
pause
exit /b 1
