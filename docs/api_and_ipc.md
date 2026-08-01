# Flujo de Datos y Comunicación (IPC & API)

En Kyba Studio, el flujo de datos desde la acción del usuario hasta la inferencia de Inteligencia Artificial atraviesa múltiples capas y protocolos para garantizar seguridad y rendimiento. La comunicación se basa en **IPC (Inter-Process Communication)** entre las vistas de Electron y el proceso principal, y en peticiones **HTTP REST** hacia el backend en Python y Ollama.

## Comunicación Frontend-Backend (IPC)

La Interfaz de Usuario (UI) corre en un entorno *sandboxed* con la política `contextIsolation` activa. No tiene acceso directo a Node.js ni a los módulos del sistema operativo. Para comunicarse, depende de los scripts de precarga (*preloads*).

### Canales IPC Principales (`custom_chat_preload.js`)
El script `custom_chat_preload.js` expone el objeto global `window.chatAPI` al entorno web. Los canales IPC más importantes incluyen:

- **`generate-local`:** Envía un *prompt* (incluyendo opciones, historial, y configuraciones) al proceso principal de Electron.
- **`execute-tool`:** Permite a la UI solicitar la ejecución explícita de herramientas de sistema o web que requiere un Agente.
- **`abort` / `abort-generation`:** Envía una señal IPC interceptada por un `AbortController` nativo de Node.js, para interrumpir inmediatamente las conexiones HTTP (fetch) pendientes y destruir los streams.

## Endpoints del Backend (`server.py`)

El servidor Python está construido con **FastAPI** y actúa como el "cerebro logístico".

### `/chat` y `/agent_chat`
- **Gestión Asíncrona:** Estos endpoints reciben un objeto de tipo `ChatRequest` (definido vía Pydantic). 
- Utilizan `httpx.AsyncClient` o librerías HTTP no bloqueantes para reenviar las peticiones al endpoint local de Ollama (`/api/chat`).
- **Streaming:** Devuelven la respuesta utilizando `StreamingResponse` de FastAPI, permitiendo que Node.js lea el flujo de datos de Ollama a medida que el LLM genera tokens (chunk por chunk) e IPC los retransmite a la UI a través del canal `model-stream`.

### `/agent_logs` (Server-Sent Events)
Este es un endpoint crucial para la experiencia de los agentes autónomos.
```python
@app.get("/agent_logs")
async def agent_logs():
    async def event_generator():
        while True:
            data = await agent_log_queue.get()
            yield f"data: {json.dumps({'chunk': data})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```
Se utiliza una cola asíncrona (`asyncio.Queue()`). Cuando una herramienta de sistema corre un subproceso (como un script de Python en consola), captura el `stdout` byte por byte y lo empuja a esta cola. El Frontend (usando la API nativa de JavaScript `EventSource`) se suscribe a `/agent_logs` y dibuja el progreso de la terminal en tiempo real para el usuario sin bloquear la inferencia principal.

### `/agent_execute`
Recibe el nombre de la herramienta y sus argumentos.
1. Ejecuta tareas mediante el envoltorio `stream_subprocess(process, timeout=120)`.
2. Si el proceso excede el timeout, invoca `process.kill()` y devuelve un log truncado.
3. Retorna el volcado de resultados para que el frontend lo adjunte al historial.

### `/ingest`
Inicia el motor **ChromaDB**. 
- Itera sobre los documentos.
- Genera *Embeddings* vectoriales actualizando la colección.
- Este endpoint corre en segundo plano usando los `BackgroundTasks` de FastAPI si el proceso de ingesta se prevé largo, evitando colgar el cliente HTTP.
