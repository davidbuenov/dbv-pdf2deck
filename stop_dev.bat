@echo off
setlocal

echo ========================================================
echo DBVPDFEditor - Deteniendo Servicios (Backend y Front)
echo ========================================================

echo -> Terminando proceso en puerto 8000 (Backend FastAPI)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

echo -> Terminando proceso en puerto 5500 (Frontend HTTP Server)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5500" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

echo.
echo -> Limpiando otros procesos Python residuales (Opcional)...
taskkill /F /IM uvicorn.exe /T 2>nul
taskkill /F /IM python.exe /T 2>nul

echo.
echo ========================================================
echo ¡Servicios detenidos! Puedes cerrar las ventanas de comandos.
echo ========================================================
pause
