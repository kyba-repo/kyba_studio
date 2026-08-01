# Modelo de Agentes y Herramientas (Agents & Tools)

Kyba Studio se diferencia de un cliente estándar de Inteligencia Artificial al integrar un **Entorno Agentico Autónomo**. Cuando la opción "Modo Agente" (Agent Mode) está habilitada, el motor local adquiere la capacidad no solo de responder texto, sino de percibir el entorno del sistema operativo del usuario y ejecutar acciones reales.

## Flujo del Modo Agente

1. **Inyección Dinámica de Prompt (System Prompting):**
   Al activar el modo agente, `main.js` modifica el contexto principal de la solicitud, informando al modelo sobre sus nuevas capacidades a nivel *System*:
   `"You have access to local tools that can interact with the user's operating system... YOU MUST USE THESE TOOLS..."`.

2. **Decisión del LLM (Tool Call):**
   El modelo evalúa la consulta del usuario. Si requiere una acción, el modelo utiliza la API de *Tools* de Ollama, devolviendo una respuesta en formato JSON estructurado indicando la herramienta (`tool_call`), en lugar de responder texto directamente.

3. **Interrupción y Ejecución Asíncrona:**
   El backend (`server.py`) extrae el nombre de la herramienta y sus argumentos. El flujo pasa a la función `execute_tool(name, args)` o delega la petición de vuelta al Frontend para que confirme si requiere sandbox.
   ```python
   # Fragmento ilustrativo de server.py (Enrutamiento de herramientas)
   if tool_name == "run_python":
       result = run_python_script(args['code'])
   elif tool_name == "run_bash":
       result = run_shell_command(args['command'])
   ```

4. **Captura en Tiempo Real (stream_subprocess):**
   Para herramientas que ejecutan largos subprocesos (ej. instalación de dependencias), se utiliza el contenedor `stream_subprocess` en Python:
   ```python
   def stream_subprocess(process, timeout=120):
       out_chunks = []
       while True:
           chunk = process.stdout.read(1)
           if not chunk and process.poll() is not None: break
           # Envía a la cola de Server-Sent Events (SSE) para la UI
           asyncio.run_coroutine_threadsafe(agent_log_queue.put(text), server_loop)
   ```
   Esto garantiza que la interfaz gráfica no se congele durante la ejecución, y el usuario vea cómo progresa el script del agente en la terminal web simulada.

## Catálogo de Herramientas (Tool Use)

Las herramientas son scripts de Python aislados manejados en `server.py`:

- **`search_web`**: Búsqueda semántica usando `DuckDuckGoSearchAPIWrapper` de Langchain o requests directos.
- **`run_bash` / `run_powershell`**: Ejecuta scripts de terminal utilizando `subprocess.Popen` con *pipes* de salida capturados.
- **`run_python`**: Guarda fragmentos en archivos temporales (ej. `BA_Temp_Agent.py`) y los ejecuta con el intérprete actual (`sys.executable`).

## Model Context Protocol (MCP)

Kyba incluye integración nativa con el estándar emergente **Model Context Protocol (MCP)**.
- **`MCPConnectionManager`**: Ubicado en `server.py`, esta clase permite a Kyba acoplarse dinámicamente con servidores MCP externos (vía `stdio_client`) para expandir su catálogo de herramientas sin modificar el código base de Kyba.
- Los clientes envían y reciben metadatos `JSON-RPC` empaquetados, permitiendo al agente de Kyba leer bases de datos SQL corporativas o interactuar con APIs como Slack/GitHub utilizando servidores MCP provistos por la comunidad.

## Agentes Especializados (Orquestación)

Cuando el contexto de Orquestación está activo:
1. El backend envía al LLM la herramienta especial `delegate_task`.
2. Al invocarla, el backend crea un *Event Loop* hijo y carga un sub-agente (ej. *Coder* o *Researcher*) aislando su memoria.
3. El resultado final del sub-agente se devuelve a la memoria a corto plazo del orquestador original como un `ToolResponse`.
