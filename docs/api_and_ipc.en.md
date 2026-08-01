# Data Flow and Communication (IPC & API)

In Kyba Studio, the data flow from user action to Artificial Intelligence inference goes through multiple layers and protocols to ensure security and performance. The communication relies on **IPC (Inter-Process Communication)** between the Electron views and the main process, and on **HTTP REST** requests to the Python backend and Ollama.

## Frontend-Backend Communication (IPC)

The User Interface (UI) runs in a sandboxed environment with the `contextIsolation` policy enabled. It has no direct access to Node.js or OS modules. To communicate, it relies entirely on preload scripts.

### Main IPC Channels (`custom_chat_preload.js`)
The `custom_chat_preload.js` script exposes the global object `window.chatAPI` to the web environment. The most critical IPC channels include:

- **`generate-local`:** Sends a prompt (including options, history, and settings) to the Electron main process.
- **`execute-tool`:** Allows the UI to request explicit execution of system or web tools required by an Agent.
- **`abort` / `abort-generation`:** Sends an IPC signal intercepted by a native Node.js `AbortController`, to immediately halt any pending HTTP connections (fetch) and tear down the streams.

## Backend Endpoints (`server.py`)

The Python server is built with **FastAPI** and acts as the "logistical brain".

### `/chat` and `/agent_chat`
- **Asynchronous Management:** These endpoints receive a `ChatRequest` object (defined via Pydantic). 
- They utilize `httpx.AsyncClient` or non-blocking HTTP libraries to forward requests to the local Ollama endpoint (`/api/chat`).
- **Streaming:** They return the response using FastAPI's `StreamingResponse`, allowing Node.js to read the data stream from Ollama as the LLM generates tokens (chunk by chunk), which IPC then broadcasts to the UI via the `model-stream` channel.

### `/agent_logs` (Server-Sent Events)
This is a crucial endpoint for the autonomous agents experience.
```python
@app.get("/agent_logs")
async def agent_logs():
    async def event_generator():
        while True:
            data = await agent_log_queue.get()
            yield f"data: {json.dumps({'chunk': data})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```
It utilizes an asynchronous queue (`asyncio.Queue()`). When a system tool runs a subprocess (like a Python script in a console), it captures the `stdout` byte by byte and pushes it into this queue. The Frontend (using the native JavaScript `EventSource` API) subscribes to `/agent_logs` and renders the terminal progress in real-time for the user without blocking the main inference.

### `/agent_execute`
Receives the tool name and its arguments.
1. Executes tasks via the `stream_subprocess(process, timeout=120)` wrapper.
2. If the process exceeds the timeout, it invokes `process.kill()` and returns a truncated log.
3. Returns the execution dump so the frontend can append it to the history.

### `/ingest`
Initializes the **ChromaDB** engine.
- Iterates over the documents.
- Generates vector *Embeddings*, updating the collection.
- This endpoint runs in the background using FastAPI's `BackgroundTasks` if the ingestion process is expected to be long, preventing the HTTP client from hanging.
