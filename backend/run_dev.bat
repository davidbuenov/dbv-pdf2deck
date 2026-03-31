@echo off
call venv\Scripts\activate.bat
echo [VENV] Activated
python --version
pip list
echo [VENV] Running Uvicorn...
uvicorn main:app --port 8000
echo [VENV] Uvicorn Exited with code %errorlevel%
