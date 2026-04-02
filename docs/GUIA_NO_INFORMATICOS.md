# Guía Paso a Paso para No Informáticos (Windows)

Esta guía está pensada para personas sin experiencia técnica.

Objetivo: dejar DBV PDF2Deck funcionando en tu ordenador, incluso si hoy no tienes instalado ni Git ni Python.

Si usas Mac, ve directamente a la guía para macOS: [Guía para No Informáticos (macOS)](GUIA_MAC_NO_INFORMATICOS.md).

---

## Índice

1. [Antes de empezar](#antes-de-empezar)
2. [Camino recomendado (sin usar Git): descargar ZIP](#camino-recomendado-sin-usar-git-descargar-zip)
3. [Camino alternativo (si prefieres Git)](#camino-alternativo-si-prefieres-git)
4. [Instalar Python (obligatorio)](#instalar-python-obligatorio)
5. [Primera puesta en marcha de la app](#primera-puesta-en-marcha-de-la-app)
6. [Cómo conseguir la API Key de AI Studio (paso a paso)](#como-conseguir-la-api-key-de-ai-studio-paso-a-paso)
7. [Solución de problemas frecuentes](#solucion-de-problemas-frecuentes)
8. [Cerrar la aplicación](#cerrar-la-aplicacion)
9. [Resumen rápido](#resumen-rapido)

---

## Antes de empezar

Necesitas:

- Un ordenador con Windows 10 u 11.
- Conexión a internet.
- Navegador (Chrome, Edge o Firefox).

Tiempo estimado la primera vez: 20 a 40 minutos.

---

## Camino recomendado (sin usar Git): descargar ZIP

Si no quieres instalar Git, usa este método.

### 1) Descargar el proyecto

1. Abre esta página en tu navegador:
   - https://github.com/davidbuenov/dbv-pdf2deck
2. Pulsa el botón verde **Code**.
3. Pulsa **Download ZIP**.
4. Ve a tu carpeta de descargas, busca el archivo ZIP y haz clic derecho.
5. Elige **Extraer todo...**.
6. Elige una carpeta fácil de recordar, por ejemplo:
   - `C:\dbv-pdf2deck`

Importante: al terminar, debes ver una carpeta con archivos como README.md, start_dev.bat, backend, frontend, etc.

---

## Camino alternativo (si prefieres Git)

Este camino es opcional. Solo úsalo si quieres instalar Git.

### 1) Instalar Git

1. Entra en https://git-scm.com/download/win
2. Se descargará el instalador automáticamente.
3. Abre el instalador y pulsa **Next** en todo (configuración por defecto).
4. Al terminar, pulsa **Finish**.

### 2) Descargar el proyecto con Git

1. Abre **Símbolo del sistema** (cmd).
2. Escribe estos comandos, uno por uno:

```cmd
cd C:\
git clone https://github.com/davidbuenov/dbv-pdf2deck.git
```

3. Se creará la carpeta `C:\dbv-pdf2deck`.

---

## Instalar Python (obligatorio)

### 1) Descargar Python 3.12

1. Abre esta página:
   - https://www.python.org/downloads/release/python-3120/
2. Descarga el instalador de Windows 64-bit.

### 2) Instalar Python correctamente

1. Abre el instalador.
2. Marca la casilla **Add Python to PATH** (muy importante).
3. Pulsa **Install Now**.
4. Espera a que termine.

### 3) Comprobar que Python quedó bien instalado

1. Abre **Símbolo del sistema** (cmd).
2. Escribe:

```cmd
py -3.12 --version
```

3. Si aparece algo como `Python 3.12.x`, está correcto.

---

## Primera puesta en marcha de la app

### 1) Entrar en la carpeta del proyecto

Si usaste ZIP:

```cmd
cd C:\dbv-pdf2deck
```

Si usaste Git y clonaste en otra ruta, usa esa ruta.

### 2) Crear entorno virtual e instalar dependencias

Ejecuta estos comandos uno por uno:

```cmd
cd backend
py -3.12 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Nota: la primera instalación puede tardar varios minutos.

### 3) Arrancar la aplicación

1. Vuelve a la carpeta principal:

```cmd
cd ..
```

2. Arranca todo con doble clic en `start_dev.bat`.

También puedes arrancarlo con comando:

```cmd
start_dev.bat
```

### 4) Abrir la app en el navegador

Abre:

- http://localhost:5500

Si todo va bien, verás la interfaz para cargar tu PDF.

---

## Cómo conseguir la API Key de AI Studio (paso a paso)

La API Key solo es necesaria si quieres usar la función **"Limpiar Fondo"** con IA.

### 1) Entrar en Google AI Studio

1. Abre: https://aistudio.google.com/
2. Inicia sesión con tu cuenta de Google.

### 2) Crear una API Key

1. Dentro de AI Studio, busca el menú de **API keys**.
2. Pulsa **Create API key**.
3. Si te pide proyecto de Google Cloud:
   - Puedes crear uno nuevo siguiendo los pasos guiados.
   - O elegir uno existente.
4. Copia la clave cuando aparezca.

Consejo: guarda la clave temporalmente en un bloc de notas hasta pegarla en la app.

### 3) Pegar la API Key en DBV PDF2Deck

1. Abre DBV PDF2Deck en http://localhost:5500
2. En la parte superior, localiza el campo **AI API Key**.
3. Pega la clave.
4. Ya puedes usar el botón **✨ Limpiar Fondo**.

Importante:

- La clave se guarda en tu navegador (en local).
- No compartas tu API Key con otras personas.

---

## Solución de problemas frecuentes

### "'py' no se reconoce como comando"

- Python no quedó en PATH.
- Solución: vuelve a instalar Python 3.12 y marca **Add Python to PATH**.

### "No se abre localhost:5500"

- Es posible que la app no arrancara bien.
- Cierra ventanas de terminal, ejecuta otra vez `start_dev.bat` y espera 20-30 segundos.

### "Error al instalar dependencias"

- Asegúrate de tener internet.
- Repite:

```cmd
cd backend
venv\Scripts\activate
pip install -r requirements.txt
```

---

## Cerrar la aplicación

Haz doble clic en `stop_dev.bat` para cerrar backend y frontend.

---

## Resumen rápido

1. Descarga el proyecto (ZIP o Git).
2. Instala Python 3.12.
3. Instala dependencias en `backend`.
4. Ejecuta `start_dev.bat`.
5. Abre http://localhost:5500.
6. (Opcional) Crea API Key en AI Studio y pégala en la app.

---

¿Usas Mac? Sigue esta guía equivalente: [Guía para No Informáticos (macOS)](GUIA_MAC_NO_INFORMATICOS.md).