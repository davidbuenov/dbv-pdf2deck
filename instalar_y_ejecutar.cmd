@echo off
setlocal enableextensions
cd /d "%~dp0"

echo ========================================================
echo DBV PDF2Deck - Instalador 1 clic (Windows)
echo ========================================================

echo [1/5] Detectando Python...
set "PY_CMD="
where py >nul 2>nul
if not errorlevel 1 (
    py -3.12 -c "import sys" >nul 2>nul
    if not errorlevel 1 set "PY_CMD=py -3.12"
)
if not defined PY_CMD (
    where py >nul 2>nul
    if not errorlevel 1 set "PY_CMD=py -3"
)
if not defined PY_CMD (
    where python >nul 2>nul
    if not errorlevel 1 set "PY_CMD=python"
)

if not defined PY_CMD (
    echo.
    echo [ERROR] No se encontro Python en este equipo.
    echo Se abrira automaticamente la web oficial de Python.
    start "" "https://www.python.org/downloads/release/python-3120/"
    echo.
    echo PASOS GUIADOS:
    echo   1) Descarga e instala Python 3.12 (Windows x86-64 executable installer)
    echo   2) Marca la casilla "Add Python to PATH"
    echo   3) Cierra esta ventana y vuelve a ejecutar: instalar_y_ejecutar.cmd
    echo.
    echo Nota: Si ya instalaste Python y no se detecta, reinicia la sesion de Windows.
    pause
    exit /b 1
)

echo [OK] Usando: %PY_CMD%

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
