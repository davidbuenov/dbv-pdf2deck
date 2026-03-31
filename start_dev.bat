@echo off
echo ========================================================
echo DBV PDF2Deck - Inicializando Entorno Hibrido (Full-Stack)
echo ========================================================

cd backend
echo -> Accediendo a entorno virtual...
call venv\Scripts\activate.bat

echo -> Instalando dependencias (FastAPI, EasyOCR, PyTorch, PyMuPDF)...
pip install -r requirements.txt

echo -> Despegando Motor Backend (Python/FastAPI) en el puerto 8000 (Ventana nueva)
start cmd /k "title DBV PDF2Deck Backend API && uvicorn main:app --port 8000"

cd ..\frontend
echo -> Despegando Servidor Interfaz Web (HTML/JS) en el puerto 5500 (Ventana nueva)
start cmd /k "title DBV PDF2Deck Web Client && python -m http.server 5500"

echo.
echo ========================================================
echo ¡Todo ha sido desplegado exitosamente! 
echo ========================================================
echo 1) Abre en tu navegador de Windows: http://localhost:5500
echo 2) Arrastra y suelta tu PDF en la zona de carga.
echo.
echo NOTA: La primera vez que se procesa un PDF con OCR, EasyOCR
echo descarga su modelo automaticamente (~200MB). Es normal que tarde.
echo.
pause
