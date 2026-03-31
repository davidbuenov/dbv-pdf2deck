@echo off
echo ========================================================
echo DBVPDFEditor - Inicializando Entorno Hibrido (Full-Stack)
echo ========================================================

cd backend
echo -> Accediendo a entorno virtual...
call venv\Scripts\activate.bat

echo -> Instalando API base y motores OCR pesados (PaddlePaddle, PaddleOCR, FastAPI)...
pip install -r requirements.txt paddlepaddle

echo -> Despegando Motor Backend (Python/FastAPI) en el puerto 8000 (Ventana nueva)
start cmd /k "title DBVPDFEditor Backend API && uvicorn main:app --port 8000"

cd ..\frontend
echo -> Despegando Servidor Interfaz Web (HTML/JS) en el puerto 5500 (Ventana nueva)
start cmd /k "title DBVPDFEditor Web Client && python -m http.server 5500"

echo.
echo ========================================================
echo ¡Todo ha sido desplegado exitosamente! 
echo ========================================================
echo 1) Abre en tu navegador de Windows: http://localhost:5500
echo 2) Selecciona y sube tu archivo 'The_AI_Director.pdf'
echo.
echo Si ves que el Backend empieza a tardar mucho procesando, es normal; 
echo la primera vez PaddleOCR descarga su modelo (unos 200MB).
echo.
pause
