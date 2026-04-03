@echo off
setlocal enableextensions
cd /d "%~dp0"

rem Entrypoint principal para compatibilidad con workflow existente.
call "%~dp0ejecutar_dbv.cmd" --ensure-install
exit /b %errorlevel%
