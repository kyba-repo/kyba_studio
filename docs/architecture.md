# Kyba Studio: Arquitectura de Alto Nivel

Kyba Studio es una aplicación de escritorio diseñada para interactuar con modelos de Inteligencia Artificial Generativa y agentes autónomos. El proyecto emplea una arquitectura híbrida que combina tecnologías web modernas con un potente backend en Python, permitiendo inferencia local, generación aumentada por recuperación (RAG) y ejecución de herramientas de sistema.

## Componentes Principales y Ciclo de Vida

El proyecto se divide en tres componentes principales que operan de manera conjunta, coordinados por el proceso principal de Electron.

### 1. Frontend (Contenedor Electron)
Implementado en Node.js mediante el framework **Electron**.
- **Proceso Principal (`main.js`):** Gestiona el ciclo de vida de la aplicación. Orquesta los subprocesos de inteligencia artificial mediante el módulo `child_process.spawn`.
  - **Lógica de Subprocesos:** Inicia `ollama serve` (Ollama CLI) interceptando sus variables de entorno para forzar el uso de GPUs AMD/Nvidia/Intel si están disponibles (`OLLAMA_HOST`).
  - **Detección de Puertos:** Utiliza la función `getFreePort` para instanciar el backend en Python evitando colisiones (típicamente iniciando en el puerto `8000`).
```javascript
// main.js - Detección de puerto dinámico y spawn del backend
const uvicornPort = await getFreePort(8000);
const pythonExecutable = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
backendProcess = spawn(pythonExecutable, ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', uvicornPort.toString()]);
```
- **Proceso de Renderizado (`renderer/`):** Construido con HTML, CSS (Vanilla) y Vanilla JavaScript. Representa la UI sin frameworks pesados, minimizando la huella de memoria. Se vale de la librería `marked.js` para renderizar Markdown dinámicamente y `highlight.js` para el resaltado de sintaxis en tiempo real.
- **Preloads (`preload.js`, `custom_chat_preload.js`):** Utilizan la API nativa de `contextBridge` para exponer llamadas IPC estructuradas al DOM (Document Object Model), protegiendo la API nativa de Node.js de ejecuciones arbitrarias del lado del cliente.

### 2. Backend (Servidor Python / FastAPI)
Implementado en Python (`server.py`) y ejecutado de manera nativa (o empaquetado vía PyInstaller en un `.exe` standalone en modo distribución) a través del servidor ASGI **Uvicorn**.
- **API REST Asíncrona:** Exclusivamente construida con **FastAPI** (`app = FastAPI(title="Kyba RAG Server")`). Las rutas son asíncronas (`async def`) para evitar el bloqueo del Event Loop al procesar I/O intensivo como la vectorización o la comunicación HTTP con Ollama.
- **Gestión de Sesiones (Model Context Protocol - MCP):** Integra manejadores dinámicos que parsean el tráfico `JSON` del motor LLM para transformarlo en peticiones de sistema.

### 3. Motor de Inferencia (Ollama)
- Kyba Studio depende de Ollama como proveedor local de Modelos de Lenguaje (LLMs). En lugar de usar bindings de C++, interactúa nativamente con la API HTTP de Ollama (ej. `POST /api/chat`), lo cual permite desvincular el rendimiento del renderizador UI de la pesada carga en VRAM que requiere la inferencia de *tensors*.

## Diagrama de Interacciones

```mermaid
graph TD
    A[UI Renderer Vanilla JS] -->|IPC Invoke 'generate-local'| B(Electron Main Process)
    B -->|spawn()| D[Ollama CLI]
    B -->|getFreePort + spawn()| C{FastAPI Backend}
    B -->|HTTP POST /chat| C
    C -->|HTTP POST /api/chat| D
    C -->|Chroma Langchain| E[(ChromaDB Vector Store)]
    C -->|Subprocess Popen| F[Ejecución Herramientas OS]
```

## Flujo de Apagado y Limpieza (Graceful Shutdown)

El aislamiento de procesos hijos (backend y ollama) requiere un manejo cuidadoso para evitar fugas de memoria o procesos huérfanos (*zombies*) tras cerrar el IDE:

1. Electron intercepta el evento `app.on('before-quit')`.
2. Se envía una petición HTTP forzada a Ollama (`keep_alive=0`) para desinstalar el modelo gigante de la VRAM de la GPU inmediatamente.
3. Se invoca el comando `taskkill /pid <backend_pid> /f /t` en Windows (o `kill -9` en Linux/Mac) contra el árbol de subprocesos del servidor FastAPI para purgar todas las operaciones concurrentes.
4. Electron culmina la destrucción de sus ventanas (BrowserWindows).
