@echo off
setlocal enableextensions
cd /d "%~dp0"

rem Alias legacy .bat -> .cmd
echo [INFO] Redirigiendo al instalador principal (.cmd)...
call "%~dp0instalar_y_ejecutar.cmd" %*
exit /b %errorlevel%
