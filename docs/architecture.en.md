# Kyba Studio: High-Level Architecture

Kyba Studio is a desktop application designed to interact with Generative Artificial Intelligence models and autonomous agents. The project uses a hybrid architecture that combines modern web technologies with a powerful Python backend, enabling local inference, Retrieval-Augmented Generation (RAG), and system tool execution.

## Core Components and Lifecycle

The project is divided into three main components that operate seamlessly together, orchestrated by the Electron main process.

### 1. Frontend (Electron Container)
Implemented in Node.js using the **Electron** framework.
- **Main Process (`main.js`):** Manages the application lifecycle. It orchestrates artificial intelligence subprocesses using the `child_process.spawn` module.
  - **Subprocess Logic:** Spawns `ollama serve` (Ollama CLI) intercepting its environment variables to force the use of AMD/Nvidia/Intel GPUs if available (`OLLAMA_HOST`).
  - **Port Detection:** Utilizes a `getFreePort` function to instantiate the Python backend while avoiding collisions (typically starting at port `8000`).
```javascript
// main.js - Dynamic port detection and backend spawn
const uvicornPort = await getFreePort(8000);
const pythonExecutable = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
backendProcess = spawn(pythonExecutable, ['-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', uvicornPort.toString()]);
```
- **Renderer Process (`renderer/`):** Built with HTML, CSS (Vanilla), and Vanilla JavaScript. It renders the UI without heavy frameworks, minimizing memory footprint. It relies on the `marked.js` library to render Markdown dynamically and `highlight.js` for real-time syntax highlighting.
- **Preloads (`preload.js`, `custom_chat_preload.js`):** These use the native `contextBridge` API to expose structured IPC calls to the DOM (Document Object Model), shielding the native Node.js API from arbitrary client-side executions.

### 2. Backend (Python / FastAPI Server)
Implemented in Python (`server.py`) and executed natively (or packaged via PyInstaller into a standalone `.exe` in distribution mode) through the **Uvicorn** ASGI server.
- **Asynchronous REST API:** Exclusively built with **FastAPI** (`app = FastAPI(title="Kyba RAG Server")`). The routes are asynchronous (`async def`) to prevent blocking the Event Loop when processing intensive I/O operations such as vectorization or HTTP communication with Ollama.
- **Session Management (Model Context Protocol - MCP):** Integrates dynamic handlers that parse JSON traffic from the LLM engine to transform it into system requests.

### 3. Inference Engine (Ollama)
- Kyba Studio relies on Ollama as the local Large Language Model (LLM) provider. Instead of using C++ bindings directly in the UI, it interacts natively with Ollama's HTTP API (e.g., `POST /api/chat`). This decouples the UI renderer's performance from the heavy VRAM load required by tensor inference.

## Interaction Diagram

```mermaid
graph TD
    A[Vanilla JS UI Renderer] -->|IPC Invoke 'generate-local'| B(Electron Main Process)
    B -->|spawn()| D[Ollama CLI]
    B -->|getFreePort + spawn()| C{FastAPI Backend}
    B -->|HTTP POST /chat| C
    C -->|HTTP POST /api/chat| D
    C -->|Chroma Langchain| E[(ChromaDB Vector Store)]
    C -->|Subprocess Popen| F[OS Tool Execution]
```

## Graceful Shutdown Flow

Isolating child processes (backend and Ollama) requires careful handling to prevent memory leaks or zombie processes after closing the IDE:

1. Electron intercepts the `app.on('before-quit')` event.
2. A forced HTTP request (`keep_alive=0`) is dispatched to Ollama to immediately unload the massive model from the GPU's VRAM.
3. The `taskkill /pid <backend_pid> /f /t` command in Windows (or `kill -9` in Linux/Mac) is invoked against the FastAPI server's subprocess tree to purge all concurrent operations.
4. Electron finalizes the destruction of its windows (`BrowserWindows`).
