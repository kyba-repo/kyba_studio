# Agents and Tools Model

Kyba Studio stands out from standard Artificial Intelligence clients by integrating an **Autonomous Agentic Environment**. When "Agent Mode" is enabled, the local engine acquires the capability not only to output text but to perceive the host operating system environment and execute real actions.

## Agent Mode Flow

1. **Dynamic Prompt Injection (System Prompting):**
   Upon activating the agent mode, `main.js` alters the core context of the request, informing the model about its new capabilities at the *System* level:
   `"You have access to local tools that can interact with the user's operating system... YOU MUST USE THESE TOOLS..."`.

2. **LLM Decision (Tool Call):**
   The model evaluates the user's query. If it requires an action, the model utilizes Ollama's *Tools* API, returning a structured JSON response indicating the specific tool (`tool_call`), rather than answering with plain text directly.

3. **Interruption and Asynchronous Execution:**
   The backend (`server.py`) extracts the tool name and its arguments. The flow is passed to the `execute_tool(name, args)` function or delegated back to the Frontend for sandboxed execution confirmation.
   ```python
   # Illustrative snippet from server.py (Tool Routing)
   if tool_name == "run_python":
       result = run_python_script(args['code'])
   elif tool_name == "run_bash":
       result = run_shell_command(args['command'])
   ```

4. **Real-Time Capture (stream_subprocess):**
   For tools that trigger lengthy subprocesses (e.g., installing dependencies), a Python `stream_subprocess` wrapper is used:
   ```python
   def stream_subprocess(process, timeout=120):
       out_chunks = []
       while True:
           chunk = process.stdout.read(1)
           if not chunk and process.poll() is not None: break
           # Pushes to the Server-Sent Events (SSE) queue for the UI
           asyncio.run_coroutine_threadsafe(agent_log_queue.put(text), server_loop)
   ```
   This ensures that the graphical interface doesn't freeze during execution, allowing the user to watch the agent's script progress in the simulated web terminal.

## Tool Catalog (Tool Use)

Tools are isolated Python scripts handled in `server.py`:

- **`search_web`**: Semantic search using Langchain's `DuckDuckGoSearchAPIWrapper` or direct HTTP requests.
- **`run_bash` / `run_powershell`**: Executes terminal scripts using `subprocess.Popen` with captured output *pipes*.
- **`run_python`**: Saves code snippets into temporary files (e.g., `BA_Temp_Agent.py`) and executes them with the current runtime interpreter (`sys.executable`).

## Model Context Protocol (MCP)

Kyba includes native integration with the emerging **Model Context Protocol (MCP)** standard.
- **`MCPConnectionManager`**: Located in `server.py`, this class allows Kyba to dynamically couple with external MCP servers (via `stdio_client`) to expand its tool catalog without modifying Kyba's core codebase.
- Clients send and receive wrapped `JSON-RPC` metadata, enabling the Kyba agent to read corporate SQL databases or interact with APIs like Slack/GitHub using community-provided MCP servers.

## Specialized Agents (Orchestration)

When the Orchestration context is active:
1. The backend sends the LLM the special `delegate_task` tool.
2. Upon invocation, the backend spawns a child *Event Loop* and loads a sub-agent (e.g., *Coder* or *Researcher*), completely isolating its memory.
3. The final result from the sub-agent is returned to the original orchestrator's short-term memory as a `ToolResponse`.
