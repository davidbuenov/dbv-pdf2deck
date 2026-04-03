@echo off
setlocal enableextensions
cd /d "%~dp0"

rem Alias legacy .bat -> .cmd
call "%~dp0ejecutar_dbv.cmd" %*
exit /b %errorlevel%
