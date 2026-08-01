from __future__ import annotations

import os
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

from pathlib import Path  # noqa: E402
from typing import Any, Optional  # noqa: E402

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks  # noqa: E402
from pydantic import BaseModel  # noqa: E402
import requests  # noqa: E402

from langchain_chroma import Chroma  # noqa: E402
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader, CSVLoader  # noqa: E402
from langchain_huggingface import HuggingFaceEmbeddings  # noqa: E402
from langchain_text_splitters import RecursiveCharacterTextSplitter  # noqa: E402
from langchain_core.documents import Document  # noqa: E402

USER_KYBA_DIR = Path.home() / ".kyba"
KNOWLEDGE_BASE_DIR = USER_KYBA_DIR / "knowledge"
DB_BASE_DIR = USER_KYBA_DIR / "chroma_db"
SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".rst", ".json", ".csv", ".html", ".htm", ".pdf", ".docx", ".xlsx"}

import asyncio
import json
from fastapi.responses import StreamingResponse

app = FastAPI(title="Kyba RAG Server", version="0.1.0")

agent_log_queue = asyncio.Queue()
server_loop = None

@app.on_event("startup")
async def on_startup():
    global server_loop
    server_loop = asyncio.get_running_loop()

@app.get("/agent_logs")
async def agent_logs():
    async def event_generator():
        while True:
            try:
                data = await agent_log_queue.get()
                payload = json.dumps({"chunk": data})
                yield f"data: {payload}\n\n"
            except asyncio.CancelledError:
                break
    return StreamingResponse(event_generator(), media_type="text/event-stream")

def stream_subprocess(process, timeout=120):
    import subprocess
    import sys
    out_chunks = []
    
    def enqueue(chunk):
        if server_loop and not server_loop.is_closed():
            asyncio.run_coroutine_threadsafe(agent_log_queue.put(chunk), server_loop)
            
    while True:
        chunk = process.stdout.read(1)
        if not chunk and process.poll() is not None:
            break
        if chunk:
            text = chunk.decode("utf-8", errors="replace")
            out_chunks.append(text)
            enqueue(text)
            
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        enqueue("\n\n[Timeout Expired]\n")
        return "".join(out_chunks) + "\n[Timeout Expired]"
        
    return "".join(out_chunks)



@app.get("/models")
async def list_models():
    import time
    llm_base = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip('/')
    for attempt in range(10):
        try:
            resp = requests.get(f"{llm_base}/api/tags", timeout=5)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            print(f"[Kyba] Error fetching Ollama models: {e}")
        if attempt < 9:
            await asyncio.sleep(1)
    return {"models": []}

class ChatRequest(BaseModel):
    question: str
    options: Optional[dict] = None
    system_prompt: Optional[str] = None
    history: Optional[list[dict[str, Any]]] = None
    profile_id: str = "default"
    model: str = "gemma4:e2b"
    images: Optional[list[str]] = None
    documents: Optional[list[dict[str, str]]] = None
    reasoning_effort: Optional[str] = "medium"


class IngestRequest(BaseModel):
    path: Optional[str] = None
    profile_id: str = "default"


vectorstores: dict[str, Chroma] = {}
retrievers: dict[str, Any] = {}
global_embeddings = None
whisper_model = None

import contextlib
try:
    from mcp.client.stdio import stdio_client, StdioServerParameters
    from mcp.client.session import ClientSession
except ImportError:
    pass

class MCPConnectionManager:
    def __init__(self):
        self.servers = {}
        self.exit_stack = contextlib.AsyncExitStack()
    
    async def sync_servers(self, servers_config):
        print(f"[MCP] Syncing {len(servers_config)} servers...")
        if self.exit_stack:
            try:
                await self.exit_stack.aclose()
            except Exception as e:
                print(f"[MCP] Error closing connections: {e}")
                
        self.exit_stack = contextlib.AsyncExitStack()
        self.servers = {}
        
        for cfg in servers_config:
            try:
                # Default to disabled if not specified
                if not cfg.get("enabled", False):
                    continue
                    
                cmd = cfg.get("command")
                if not cmd:
                    continue
                args = cfg.get("args", "")
                args_list = args.split() if args else []
                
                # Copy current env and inject user-provided env variables
                env = os.environ.copy()
                user_env_str = cfg.get("env", "")
                if user_env_str:
                    for pair in user_env_str.split(","):
                        pair = pair.strip()
                        if "=" in pair:
                            k, v = pair.split("=", 1)
                            env[k.strip()] = v.strip()
                
                server_params = StdioServerParameters(
                    command=cmd,
                    args=args_list,
                    env=env
                )
                
                transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
                read_stream, write_stream = transport
                session = await self.exit_stack.enter_async_context(ClientSession(read_stream, write_stream))
                await session.initialize()
                
                self.servers[cfg.get("id")] = session
                print(f"[MCP] Successfully connected to {cfg.get('name')}")
            except Exception as e:
                print(f"[MCP] Failed to connect to {cfg.get('name')}: {e}")

mcp_manager = MCPConnectionManager()

class McpSyncRequest(BaseModel):
    servers: list[dict[str, Any]]

@app.post("/mcp/sync")
async def mcp_sync(payload: McpSyncRequest) -> dict[str, Any]:
    await mcp_manager.sync_servers(payload.servers)
    return {"status": "ok"}



def _ensure_whisper() -> Any:
    global whisper_model
    if whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            import os
            
            # Search for locally packaged model
            cwd = os.getcwd()
            local_model_path = os.path.join(cwd, "models", "faster-whisper-tiny")
            
            if os.path.exists(local_model_path):
                print(f"[Kyba] Using local Whisper model at {local_model_path}")
                whisper_model = WhisperModel(local_model_path, device="cpu", compute_type="int8", local_files_only=True)
            else:
                print("[Kyba] Local model not found, using HuggingFace cache...")
                whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
        except ImportError:
            raise RuntimeError("faster-whisper is not installed.")
    return whisper_model


llm_model: str = os.getenv("OLLAMA_MODEL", "gemma4:e2b")
llm_base_url: str = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")


def _ensure_runtime(profile_id: str = "default") -> tuple[Chroma, Any]:
    global global_embeddings
    if global_embeddings is None:
        try:
            global_embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        except Exception:
            # Fallback to offline mode if there is no internet (assumes it was downloaded before)
            os.environ["HF_HUB_OFFLINE"] = "1"
            os.environ["TRANSFORMERS_OFFLINE"] = "1"
            global_embeddings = HuggingFaceEmbeddings(
                model_name="all-MiniLM-L6-v2",
                model_kwargs={"local_files_only": True}
            )
    
    if profile_id not in vectorstores:
        db_path = DB_BASE_DIR / profile_id
        db_path.mkdir(parents=True, exist_ok=True)
        vectorstores[profile_id] = Chroma(
            collection_name=f"kyba_knowledge_{profile_id}",
            embedding_function=global_embeddings,
            persist_directory=str(db_path),
        )
        retrievers[profile_id] = vectorstores[profile_id].as_retriever(search_kwargs={"k": 4})
    
    return vectorstores[profile_id], retrievers[profile_id]


def _load_single_document(file_path: Path) -> list[Any]:
    suffix = file_path.suffix.lower()
    try:
        if suffix == ".pdf":
            loader = PyPDFLoader(str(file_path))
            return loader.load()
        elif suffix == ".docx":
            loader = Docx2txtLoader(str(file_path))
            return loader.load()
        elif suffix == ".csv":
            loader = CSVLoader(str(file_path), encoding="utf-8")
            return loader.load()
        elif suffix == ".xlsx":
            import openpyxl
            wb = openpyxl.load_workbook(str(file_path), data_only=True)
            text_content = ""
            for sheet in wb.worksheets:
                text_content += f"\n--- Sheet: {sheet.title} ---\n"
                for row in sheet.iter_rows(values_only=True):
                    row_text = "\t".join([str(cell) if cell is not None else "" for cell in row])
                    text_content += row_text + "\n"
            return [Document(page_content=text_content, metadata={"source": str(file_path)})]

        loader = TextLoader(str(file_path), encoding="utf-8")
        return loader.load()
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Could not load {file_path}: {exc}") from exc


def _load_documents(path: Optional[str] = None, profile_id: str = "default") -> list[Any]:
    default_target = KNOWLEDGE_BASE_DIR / profile_id
    target_path = Path(path).resolve() if path else default_target
    if not target_path.exists():
        return []

    if target_path.is_file():
        return _load_single_document(target_path)

    documents: list[Any] = []
    for file_path in sorted(target_path.rglob("*")):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        try:
            documents.extend(_load_single_document(file_path))
        except Exception as e:
            print(f"Skipping {file_path} due to error: {e}")
    return documents


def _ingest_documents(path: Optional[str] = None, profile_id: str = "default") -> int:
    vs, _ = _ensure_runtime(profile_id)
    if vs is None:
        raise RuntimeError(f"Could not initialize vector database for profile {profile_id}.")

    docs = _load_documents(path, profile_id)
    if not docs:
        return 0

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    chunks = splitter.split_documents(docs)
    if not chunks:
        return 0

    # Batch add documents to reduce embedding calls and I/O.
    batch_size = int(os.getenv("INGEST_BATCH_SIZE", "128"))
    persist_every = int(os.getenv("INGEST_PERSIST_EVERY", "10"))
    indexed = 0
    failed = 0
    batch_count = 0
    last_error = None
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        try:
            vs.add_documents(batch)
            indexed += len(batch)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            # Fallback: try adding documents one-by-one to isolate failures
            print(f"Batch add failed (size={len(batch)}): {exc}. Falling back to per-chunk add.")
            for chunk in batch:
                try:
                    vs.add_documents([chunk])
                    indexed += 1
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    try:
                        src = chunk.metadata.get("source", "no source")
                    except Exception:
                        src = "no source"
                    print(f"Failed chunk: {src} -> {e}")

        batch_count += 1
        # Persist periodically to avoid large in-memory state and I/O spikes
        if batch_count % persist_every == 0:
            try:
                if hasattr(vs, "persist"):
                    vs.persist()
            except Exception as e:  # noqa: BLE001
                print(f"Persist failed in batch {batch_count}: {e}")

    if indexed == 0:
        raise RuntimeError(
            f"Could not index any chunks. Last error: {last_error if last_error else 'no details'}"
        )

    # Final persist to ensure everything is written to disk
    try:
        if hasattr(vs, "persist"):
            vs.persist()
    except Exception as e:  # noqa: BLE001
        print(f"Final persist failed: {e}")

    if failed:
        print(f"Indexed {indexed} chunks and skipped {failed} problematic chunks.")
    return indexed


def _format_context(docs: list[Any]) -> str:
    if not docs:
        return "No relevant context available."
    parts = []
    for idx, doc in enumerate(docs, start=1):
        source = doc.metadata.get("source", "no source")
        parts.append(f"[{idx}] Source: {source}\n{doc.page_content}")
    return "\n\n".join(parts)


@app.on_event("startup")
def startup() -> None:
    # Ensure default profile runs on startup
    _ensure_runtime("default")
    try:
        if not os.path.exists(DB_BASE_DIR):
            os.makedirs(DB_BASE_DIR, exist_ok=True)
        # Background ingest for default profile
        import threading
        threading.Thread(target=_ingest_documents, args=(None, "default"), daemon=True).start()
    except Exception:
        pass


@app.get("/")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": "gemma4:e2b", "knowledge_dir": str(KNOWLEDGE_BASE_DIR)}


@app.post("/report")
async def report_issue(request: Request) -> dict[str, Any]:
    try:
        data = await request.json()
        headers = {
            "Origin": "https://kybasoftware.com",
            "Referer": "https://kybasoftware.com",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        attachment_b64 = data.pop("attachment_b64", None)
        attachment_name = data.pop("attachment_name", "attachment")
        
        loop = asyncio.get_running_loop()
        def _send():
            import requests
            import base64
            import tempfile
            import os
            
            if attachment_b64:
                try:
                    file_data = base64.b64decode(attachment_b64)
                    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(attachment_name)[1]) as tmp:
                        tmp.write(file_data)
                        tmp_path = tmp.name
                    
                    with open(tmp_path, 'rb') as f:
                        upload_resp = requests.post("https://tmpfiles.org/api/v1/upload", files={'file': (attachment_name, f)}, timeout=30)
                    os.unlink(tmp_path)
                    
                    if upload_resp.ok:
                        url = upload_resp.json().get('data', {}).get('url', '')
                        if url:
                            dl_url = url.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
                            data['message'] += f"\n\n--- Attachment ---\n{dl_url}"
                except Exception as e:
                    print("Error uploading attachment:", e)
                    
            return requests.post("https://formsubmit.co/ajax/kyba.prog@gmail.com", json=data, headers=headers, timeout=15)
            
        resp = await loop.run_in_executor(None, _send)
        return {"status": "ok", "response": resp.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe")
async def transcribe(request: Request) -> dict[str, Any]:
    try:
        model = _ensure_whisper()
        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="No audio provided")
        
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(body)
            tmp_path = tmp.name
        
        try:
            segments, info = model.transcribe(tmp_path, language="es")
            text = "".join([segment.text for segment in segments])
            return {"text": text.strip()}
        finally:
            import os
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ingest")
def ingest(payload: IngestRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    try:
        background_tasks.add_task(_ingest_documents, payload.path, payload.profile_id)
        return {"status": "ok", "message": "Background indexing started"}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class DeleteDocRequest(BaseModel):
    filename: str
    profile_id: str = "default"


@app.post("/knowledge/delete")
def delete_knowledge_doc(payload: DeleteDocRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    file_path = KNOWLEDGE_BASE_DIR / payload.profile_id / payload.filename
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {exc}")
    
    global vectorstores, retrievers
    vs, _ = _ensure_runtime(payload.profile_id)
    if vs is not None:
        try:
            vs.delete_collection()
        except Exception:
            pass
    
    vectorstores.pop(payload.profile_id, None)
    retrievers.pop(payload.profile_id, None)

    background_tasks.add_task(_ingest_documents, None, payload.profile_id)
    return {"status": "ok", "message": f"Document {payload.filename} deleted and re-indexing started."}


@app.post("/chat")
def chat(payload: ChatRequest) -> dict[str, Any]:
    if not payload.question or not payload.question.strip():
        raise HTTPException(status_code=400, detail="You must send a question.")

    try:
        _, retriever = _ensure_runtime(payload.profile_id)
        docs = retriever.invoke(payload.question)  # type: ignore[union-attr]
        context = _format_context(docs)
        # Allow overriding the system prompt from the request; otherwise use the default template
        if payload.system_prompt is not None:
            system_prompt = payload.system_prompt.strip()
        else:
            system_prompt = (
                "You are an advanced generative AI model with deep expertise across diverse subjects. Always respond in the same language as the user. Strictly follow these rules:\n\n"
                "Role and objective: Act as a versatile and highly capable assistant. You have the ability to manage tools, write programming code in any language, execute functions agentically, and use vision modes to see and analyze images.\n"
                "Execution Environment: You are running locally on the user's machine with FULL administrative privileges, FULL internet access, and NO network restrictions. If the user asks you to run a command, install a package (e.g., pip install), or fetch data from the internet, DO IT using your tools. Do not refuse claiming network restrictions or lack of permissions.\n"
                "Output: Provide ONLY the requested result (code, explanations, and/or tests). Do not show your \"thinking\", internal processes, or intermediate steps.\n"
                "Code style: When programming, write clean, tested, and maintainable code. Follow best practices for the requested language. Write small functions with a single responsibility.\n"
                "Security and robustness: Validate inputs and handle errors properly. Avoid arbitrary code execution unless explicitly requested and confirmed by the user.\n"
                "Delivery format: If the user requests code or files, deliver them clearly formatted. When multiple files are required, deliver one file per section and precede each with a comment indicating the file name.\n"
                "Conversation constraints: Do not dig unnecessarily; if information is missing, ask only what is essential in a short and concrete question. Do not include long explanations unless the user asks for a review or comments.\n"
            )
        
        # Limit the length of the "thinking" if it's a reasoning model
        effort = payload.reasoning_effort or "medium"
        if effort == "low":
            system_prompt += "\nRULE: You can briefly analyze the question before answering, but get straight to the point quickly and without rambling."
        elif effort == "medium":
            system_prompt += "\nRULE: Take a moment to organize your ideas and think logically, but keep your analysis concise before giving the final answer."
        elif effort == "high":
            system_prompt += "\nRULE: You are free to think in detail, explore options and reason step by step as much as you need before delivering the best possible answer."
            
        import base64
        import tempfile
        
        print(f"DEBUG: /chat received {len(payload.images) if getattr(payload, 'images', None) else 0} images and {len(payload.documents) if getattr(payload, 'documents', None) else 0} documents")
        
        extra_context = ""
        if getattr(payload, "documents", None):
            for doc in payload.documents:
                try:
                    filename = doc.get("filename", "documento.pdf")
                    content_b64 = doc.get("content", "")
                    if content_b64.startswith("data:"):
                        content_b64 = content_b64.split(",")[1]
                    
                    file_data = base64.b64decode(content_b64)
                    suffix = os.path.splitext(filename)[1].lower()
                    
                    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                        tmp_file.write(file_data)
                        tmp_path = tmp_file.name
                        
                    docs = _load_single_document(Path(tmp_path))
                    extra_context += f"\n--- Content of {filename} ---\n"
                    for d in docs:
                        extra_context += d.page_content + "\n"
                        
                    os.unlink(tmp_path)
                except Exception as e:
                    print(f"Error processing document: {e}")
                    
        # When images are present, skip the RAG context wrapper — it confuses vision models
        has_images = bool(getattr(payload, "images", None))
        if has_images:
            user_prompt = payload.question
            # Use a short, vision-friendly system prompt instead of the long code-focused one
            system_prompt = "You are a helpful AI assistant with vision capabilities. Describe what you see in images accurately. Always answer in Spanish."
        else:
            user_prompt = f"Context:\n{context}\n{extra_context}\nQuestion: {payload.question}"
        options = payload.options if getattr(payload, 'options', None) else {"temperature": 0.2}
        options.setdefault("num_ctx", 8192)
        
        messages = [{"role": "system", "content": system_prompt}]
        if payload.history:
            # Keep only the last 6 messages to avoid overflowing the model's context
            history_msgs = []
            for h in payload.history[-6:]:
                if h.get("role") == "user" and "attachments" in h:
                    clean_imgs = []
                    for att in h["attachments"]:
                        if att.get("type") == "image":
                            img = att.get("dataUrl", "")
                            if img.startswith("data:"):
                                img = img.split(",")[1]
                            clean_imgs.append(img)
                    if clean_imgs:
                        h["images"] = clean_imgs
                    h.pop("attachments", None)
                history_msgs.append(h)
            messages.extend(history_msgs)
            
        user_msg = {"role": "user", "content": user_prompt}
        if has_images:
            clean_images = []
            for img in payload.images:
                if img.startswith("data:"):
                    clean_images.append(img.split(",")[1])
                else:
                    clean_images.append(img)
            user_msg["images"] = clean_images
            
        messages.append(user_msg)
        
        # Unload any other model from VRAM that is not the requested one using /api/ps
        try:
            ps_response = requests.get(f"{llm_base_url}/api/ps", timeout=5)
            if ps_response.ok:
                loaded_models = ps_response.json().get("models", [])
                for m in loaded_models:
                    m_name = m.get("name", "")
                    if m_name and m_name != payload.model:
                        print(f"[Kyba][backend] Unloading previous model from VRAM: {m_name}")
                        requests.post(
                            f"{llm_base_url}/api/generate",
                            json={"model": m_name, "keep_alive": 0},
                            timeout=10
                        )
        except Exception as e:
            print(f"Error checking/unloading previous models: {e}")
        
        ollama_payload = {
                "model": payload.model,
                "messages": messages,
                "stream": False,
                "options": options,
                "keep_alive": "15m",
            }
        
        # Debug: log exactly what we're sending to Ollama
        for i, msg in enumerate(messages):
            role = msg.get("role", "?") if isinstance(msg, dict) else "?"
            has_img = "images" in msg if isinstance(msg, dict) else False
            img_count = len(msg.get("images", [])) if has_img else 0
            content_preview = str(msg.get("content", ""))[:80] if isinstance(msg, dict) else str(msg)[:80]
            print(f"DEBUG /chat msg[{i}]: role={role}, has_images={has_img}, img_count={img_count}, content={content_preview}")
            if has_img:
                for j, im in enumerate(msg["images"]):
                    print(f"  DEBUG img[{j}]: type={type(im).__name__}, len={len(im)}, starts_with={im[:40]}...")
        
        response = requests.post(
            f"{llm_base_url}/api/chat",
            json=ollama_payload,
            timeout=600,
        )
        response.raise_for_status()
        data = response.json()
        
        # Debug: log the Ollama response
        print(f"DEBUG /chat Ollama response status={response.status_code}, keys={list(data.keys())}")
        message = data.get("message", {})
        answer = message.get("content", "") or data.get("response", "")
        print(f"DEBUG /chat answer length={len(answer)}, preview={answer[:100]}")
        if not answer and has_images:
            print(f"DEBUG /chat WARNING: Empty answer with images! Full Ollama response: {str(data)[:500]}")
        
        # Filter <think> tags from reasoning models (like DeepSeek-R1)
        import re
        answer = re.sub(r"<think>.*?</think>", "", answer, flags=re.DOTALL).strip()
        
        return {
            "answer": answer,
            "sources": [doc.metadata.get("source", "no source") for doc in docs],
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# --- Agent Capabilities ---

from langchain_core.tools import tool
from langchain_ollama import ChatOllama

@tool
def run_command(command: str) -> str:
    """Executes a shell command on the local machine and returns the output."""
    import subprocess, os
    if server_loop:
        asyncio.run_coroutine_threadsafe(agent_log_queue.put(f"\r\n\x1b[32mPS {os.getcwd()}> {command}\x1b[0m\r\n"), server_loop)
    try:
        process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        out = stream_subprocess(process, timeout=120)
        return out if out else "Command executed successfully with no output."
    except Exception as e:
        return str(e)

@tool
def read_file(path: str) -> str:
    """Reads the content of a local file."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return str(e)

@tool
def write_file(path: str, content: str) -> str:
    """Writes content to a local file."""
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"File {path} written successfully."
    except Exception as e:
        return str(e)

@tool
def run_python(code: str) -> str:
    """Executes python code in the current environment and returns the output."""
    import sys, subprocess, tempfile, os
    if server_loop:
        asyncio.run_coroutine_threadsafe(agent_log_queue.put(f"\r\n\x1b[33mPS {os.getcwd()}> [Running Python Script]\x1b[0m\r\n"), server_loop)
    try:
        fd, path = tempfile.mkstemp(suffix=".py")
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(code)
        
        executable = sys.executable
        process = subprocess.Popen([executable, path], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        out = stream_subprocess(process, timeout=120)
        os.remove(path)
        return out if out else "Python script executed successfully with no output."
    except Exception as e:
        return str(e)

@tool
def search_web(query: str) -> str:
    """Searches the internet for real-time information and returns a summary of results."""
    from ddgs import DDGS
    import asyncio, os
        
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            if not results:
                return "No results found."
            
            output = ""
            for r in results:
                output += f"Title: {r.get('title')}\nLink: {r.get('href')}\nSnippet: {r.get('body')}\n\n"
                
            return output
    except Exception as e:
        return f"Error searching the web: {e}"

@tool
def read_webpage(url: str) -> str:
    """Fetches a web page and returns its text content. Use this to read full articles or websites from search results."""
    import requests
    import asyncio, os
    from bs4 import BeautifulSoup
    if server_loop:
        asyncio.run_coroutine_threadsafe(agent_log_queue.put(f"\r\n\x1b[35mPS {os.getcwd()}> [Reading Webpage] {url}\x1b[0m\r\n"), server_loop)
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()
        text = soup.get_text(separator="\n")
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = "\n".join(chunk for chunk in chunks if chunk)
        return text[:10000] if len(text) > 10000 else text
    except Exception as e:
        return f"Error reading webpage: {e}"

@tool
def pip_install(package_names: str) -> str:
    """Installs one or more python packages (space-separated) using pip in the current environment."""
    import sys, subprocess, os
    command_str = f"pip install {package_names}"
    if server_loop:
        asyncio.run_coroutine_threadsafe(agent_log_queue.put(f"\r\n\x1b[34mPS {os.getcwd()}> {command_str}\x1b[0m\r\n"), server_loop)
    try:
        executable = sys.executable
        command = [executable, "-m", "pip", "install"] + package_names.split()
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        out = stream_subprocess(process, timeout=120)
        return out if out else f"Successfully installed: {package_names}"
    except Exception as e:
        return str(e)

@tool
def delegate_task(agent_name: str, task: str) -> str:
    """Delegates a specific task to another specialized agent. Only use this if you are the orchestrator."""
    return "Task delegated."

@tool
def analyze_image_clip(image_path_or_url: str, prompt: str = "Describe this image in detail.") -> str:
    """Uses a vision model (CLIP) to analyze and describe an image from a local path or URL."""
    try:
        import base64
        import requests
        import os
        
        if image_path_or_url.startswith("http://") or image_path_or_url.startswith("https://"):
            resp = requests.get(image_path_or_url, timeout=10)
            img_bytes = resp.content
        else:
            if not os.path.exists(image_path_or_url):
                return f"Error: File {image_path_or_url} not found."
            with open(image_path_or_url, "rb") as f:
                img_bytes = f.read()
                
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        
        llm_api_url = f"{llm_base_url}/api/generate"
        payload = {
            "model": "llava:latest", 
            "prompt": prompt,
            "images": [img_b64],
            "stream": False
        }
        
        resp = requests.post(llm_api_url, json=payload, timeout=60)
        if resp.ok:
            return resp.json().get("response", "Could not analyze image.")
        else:
            if resp.status_code == 404:
                return "Error: Vision model 'llava' is not installed in Ollama. Please run 'kyba run llava' to install it so this tool can analyze images."
            return f"Error from vision model: {resp.text}"
    except Exception as e:
        return f"Error analyzing image: {e}"

tools_by_name = {
    "run_command": run_command,
    "read_file": read_file,
    "write_file": write_file,
    "run_python": run_python,
    "pip_install": pip_install,
    "search_web": search_web,
    "read_webpage": read_webpage,
    "analyze_image_clip": analyze_image_clip,
    "delegate_task": delegate_task
}
agent_tools = list(tools_by_name.values())

class AgentChatRequest(BaseModel):
    model: str
    messages: list[dict[str, Any]]
    options: Optional[dict] = None
    images: Optional[list[str]] = None
    documents: Optional[list[dict[str, Any]]] = None

class AgentExecuteRequest(BaseModel):
    tool_name: str
    tool_args: dict[str, Any]
    extra: Optional[dict[str, Any]] = None

@app.post("/agent_chat")
async def agent_chat(payload: AgentChatRequest) -> dict[str, Any]:
    try:
        options = payload.options or {"temperature": 0.2}
        options["keep_alive"] = "15m"
        options.setdefault("num_ctx", 8192)
        llm = ChatOllama(model=payload.model, base_url=llm_base_url, **options)
        
        combined_tools = agent_tools.copy()
        
        # Inject MCP Tools
        for server_id, session in mcp_manager.servers.items():
            try:
                tools_res = await session.list_tools()
                for t in tools_res.tools:
                    raw_tool = {
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": f"{t.description or 'MCP Tool'} (from {server_id})",
                            "parameters": t.inputSchema
                        }
                    }
                    combined_tools.append(raw_tool)
            except Exception as e:
                print(f"Error fetching tools for {server_id}: {e}")
                
        # Try to bind tools; some models (e.g. llava) don't support tool calling
        supports_tools = True
        try:
            llm_with_tools = llm.bind_tools(combined_tools)
        except Exception:
            supports_tools = False
            llm_with_tools = llm
        
        messages = payload.messages
        
        print(f"DEBUG: agent_chat received {len(payload.images) if payload.images else 0} images")
        
        from langchain_core.messages import HumanMessage
        processed_messages = []
        for i, m in enumerate(messages):
            if isinstance(m, dict) and m.get("role") == "user":
                content_text = m.get("content", "")
                
                # Check if this is the last user message in the list
                is_last_user_msg = all(not (isinstance(m2, dict) and m2.get("role") == "user") for m2 in messages[i+1:])
                if is_last_user_msg and getattr(payload, "documents", None):
                    extra_context = ""
                    for doc in payload.documents:
                        try:
                            import base64
                            import tempfile
                            filename = doc.get("filename", "documento.pdf")
                            content_b64 = doc.get("content", "")
                            if content_b64.startswith("data:"):
                                content_b64 = content_b64.split(",")[1]
                            
                            file_data = base64.b64decode(content_b64)
                            suffix = os.path.splitext(filename)[1].lower()
                            
                            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                                tmp_file.write(file_data)
                                tmp_path = tmp_file.name
                                
                            docs = _load_single_document(Path(tmp_path))
                            extra_context += f"\n--- Content of {filename} ---\n"
                            for d in docs:
                                extra_context += d.page_content + "\n"
                                
                            os.unlink(tmp_path)
                        except Exception as e:
                            print(f"Error processing document in agent: {e}")
                    
                    if extra_context:
                        content_text = f"Context from documents:\n{extra_context}\n\nQuestion: {content_text}"
                        print(f"DEBUG: Appended document context to last user message. Length of extra_context: {len(extra_context)}")
                
                content_list = [{"type": "text", "text": content_text}]
                has_images = False
                
                if "attachments" in m:
                    for att in m["attachments"]:
                        if att.get("type") == "image":
                            has_images = True
                            img = att.get("dataUrl", "")
                            if not img.startswith("data:"):
                                img = f"data:image/jpeg;base64,{img}"
                            content_list.append({"type": "image_url", "image_url": {"url": img}})
                            
                if i == len(messages) - 1 and payload.images:
                    for img in payload.images:
                        has_images = True
                        if not img.startswith("data:"):
                            img = f"data:image/jpeg;base64,{img}"
                        content_list.append({"type": "image_url", "image_url": {"url": img}})
                        
                if has_images:
                    processed_messages.append(HumanMessage(content=content_list))
                else:
                    m["content"] = content_text
                    processed_messages.append(m)
            else:
                processed_messages.append(m)
                
        messages = processed_messages

        tool_instructions = (
            "You are a local AI agent with access to tools. "
            "CRITICAL: If the user asks you to check system state, run a command, search the internet, or install something, "
            "you MUST use the appropriate tool. DO NOT hallucinate the output of a command. "
            "ALWAYS use tools when requested, especially the 'search_web' tool if the user mentions internet or web searches. "
            "IMPORTANT: Always respond in the same language as the user. "
            "When the user requests something that can be resolved with a tool, handle all necessary requests to the tool agentically so the user does not have to repeat the request again just for the tool to receive it."
        )

        system_found = False
        for m in messages:
            role = m.get("role") if isinstance(m, dict) else getattr(m, "type", "")
            if role == "system":
                if isinstance(m, dict):
                    m["content"] = f"{m.get('content', '')}\n\n{tool_instructions}"
                else:
                    m.content = f"{m.content}\n\n{tool_instructions}"
                system_found = True
                break

        if not system_found:
            system_msg = {
                "role": "system",
                "content": tool_instructions
            }
            messages = [system_msg] + messages
        
        try:
            response = await llm_with_tools.ainvoke(messages)
        except Exception as tool_err:
            # If it fails because of tool support, retry without tools
            err_msg = str(tool_err).lower()
            if "does not support tools" in err_msg or "tool" in err_msg:
                print(f"[Kyba][backend] Model {payload.model} does not support tools, invoking without tools...")
                supports_tools = False
                response = await llm.ainvoke(messages)
            else:
                raise
        
        if supports_tools and response.tool_calls:
            calls = []
            for call in response.tool_calls:
                calls.append({
                    "id": call.get("id"),
                    "name": call.get("name"),
                    "args": call.get("args")
                })
            return {"type": "tool_call", "calls": calls}
        else:
            content = response.content
            if isinstance(content, str):
                import re
                import json
                import uuid
                content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                
                # Fallback: Check if the model outputted a raw tool call JSON string
                try:
                    cleaned_content = content.strip()
                    if cleaned_content.startswith('"name"'):
                        cleaned_content = "{" + cleaned_content
                        
                    match = re.search(r'"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{.*\})', cleaned_content.replace('\n', ' '))
                    if match:
                        name = match.group(1)
                        args_str = match.group(2)
                        parsed_args = None
                        
                        # Find the first valid JSON object from the end to handle trailing garbage
                        for i in range(len(args_str), 0, -1):
                            if args_str[i-1] == '}':
                                try:
                                    parsed_args = json.loads(args_str[:i])
                                    break
                                except json.JSONDecodeError:
                                    pass
                                    
                        if parsed_args is not None:
                            call_id = f"call_{uuid.uuid4().hex[:8]}"
                            return {"type": "tool_call", "calls": [{"id": call_id, "name": name, "args": parsed_args}]}
                except Exception as e:
                    print(f"[Kyba][backend] Fallback tool parse error: {e}")
                    pass
                    
            return {"type": "message", "content": content}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/agent_execute")
async def agent_execute(payload: AgentExecuteRequest) -> dict[str, Any]:
    try:
        if payload.tool_name == "delegate_task":
            agent_name = payload.tool_args.get("agent_name")
            task = payload.tool_args.get("task")
            if server_loop:
                asyncio.run_coroutine_threadsafe(agent_log_queue.put(f"\r\n\x1b[36m[Orchestrator]\x1b[0m Delegating task to \x1b[35m{agent_name}\x1b[0m...\r\n"), server_loop)
            
            extra = payload.extra or {}
            custom_models = extra.get("custom_models", [])
            target_agent = next((m for m in custom_models if m.get("name") == agent_name), None)
            if not target_agent:
                return {"result": f"Error: Agent '{agent_name}' not found or not available."}
            
            agent_system = target_agent.get("systemPrompt", "You are an AI assistant.")
            agent_model = target_agent.get("baseModel", "gemma4:e2b")
            agent_options = {"temperature": float(target_agent.get("temperature", 0.2)), "top_p": float(target_agent.get("top_p", 0.9)), "num_ctx": 4096, "keep_alive": "15m"}
            
            llm = ChatOllama(model=agent_model, base_url=llm_base_url, **agent_options)
            messages = [{"role": "system", "content": agent_system}]
            
            history = extra.get("history", [])
            if history:
                valid_history = []
                for m in history:
                    if m.get("role") in ["user", "assistant"]:
                        # Exclude messages that have no content (e.g., pure tool calls without text)
                        if m.get("content"):
                            valid_history.append({"role": m["role"], "content": m.get("content", "")})
                messages.extend(valid_history[-6:])
                
            messages.append({"role": "user", "content": f"Task from orchestrator: {task}"})
            response = await llm.ainvoke(messages)
            
            if server_loop:
                asyncio.run_coroutine_threadsafe(agent_log_queue.put(f"\x1b[36m[Orchestrator]\x1b[0m Agent \x1b[35m{agent_name}\x1b[0m finished task.\r\n"), server_loop)
            
            return {"result": response.content}
            
        tool_func = tools_by_name.get(payload.tool_name)
        if tool_func:
            result = tool_func.invoke(payload.tool_args)
            return {"result": str(result)}
            
        # If not a native tool, check if it's an MCP tool
        for server_id, session in mcp_manager.servers.items():
            try:
                tools_res = await session.list_tools()
                if any(t.name == payload.tool_name for t in tools_res.tools):
                    if server_loop:
                        asyncio.run_coroutine_threadsafe(agent_log_queue.put(f"\r\n\x1b[35mPS {os.getcwd()}> [MCP] {payload.tool_name}({payload.tool_args})\x1b[0m\r\n"), server_loop)
                    
                    result = await session.call_tool(payload.tool_name, arguments=payload.tool_args)
                    
                    output = ""
                    for c in result.content:
                        if c.type == "text":
                            output += c.text + "\n"
                    
                    return {"result": output if output else "Tool executed successfully with no output."}
            except Exception as e:
                print(f"Error executing MCP tool {payload.tool_name} on {server_id}: {e}")
                
        return {"result": f"Error: Tool {payload.tool_name} not found."}
    except Exception as exc:
        return {"result": f"Tool execution failed: {str(exc)}"}

# --- OpenAI Compatible Endpoints ---

@app.get("/v1/models")
async def openai_models():
    """
    Returns the list of models in an OpenAI compatible format.
    """
    llm_base_url = "http://127.0.0.1:11434"
    try:
        r = requests.get(f"{llm_base_url}/v1/models", timeout=5)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return {"object": "list", "data": []}

@app.post("/v1/completions")
async def openai_completions(request: Request):
    """
    OpenAI-compatible legacy completions endpoint.
    Translates to Ollama's /api/generate since Ollama doesn't have /v1/completions.
    Used by Continue.dev for tab autocomplete (FIM / Fill-In-the-Middle).
    """
    llm_base_url = "http://127.0.0.1:11434"
    
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    # Check if the requested model is a custom Kyba model (same logic as /v1/chat/completions)
    requested_model = payload.get("model", "")
    user_data_path = os.environ.get("KYBA_USER_DATA")
    if user_data_path:
        custom_models_path = os.path.join(user_data_path, "kyba_custom_models.json")
        if os.path.exists(custom_models_path):
            try:
                with open(custom_models_path, "r", encoding="utf-8") as f:
                    custom_models = json.load(f)
                matched_model = next((m for m in custom_models if m.get("id") == requested_model or m.get("name") == requested_model), None)
                if matched_model:
                    print(f"[Kyba Link] /v1/completions: Intercepted custom model '{requested_model}'. Swapping to base model '{matched_model.get('baseModel')}'")
                    payload["model"] = matched_model.get("baseModel", requested_model)
            except Exception as e:
                print(f"[Kyba Link] Error processing custom models in /v1/completions: {e}")
    
    # Translate OpenAI completions format -> Ollama /api/generate format
    ollama_payload = {
        "model": payload.get("model", ""),
        "prompt": payload.get("prompt", ""),
        "raw": True,  # Skip prompt template wrapping for FIM
        "stream": payload.get("stream", False),
    }
    
    # FIM suffix support
    if "suffix" in payload and payload["suffix"]:
        ollama_payload["suffix"] = payload["suffix"]
    
    # Map options
    options = {}
    if "temperature" in payload:
        options["temperature"] = payload["temperature"]
    if "max_tokens" in payload:
        options["num_predict"] = payload["max_tokens"]
    if "top_p" in payload:
        options["top_p"] = payload["top_p"]
    if "stop" in payload:
        ollama_payload["stop"] = payload["stop"] if isinstance(payload["stop"], list) else [payload["stop"]]
    if options:
        ollama_payload["options"] = options
    
    import uuid, time
    request_id = f"cmpl-{uuid.uuid4().hex[:24]}"
    model_name = payload.get("model", "")
    
    is_stream = payload.get("stream", False)
    
    if is_stream:
        try:
            r = requests.post(f"{llm_base_url}/api/generate", json=ollama_payload, stream=True, timeout=120)
            if r.status_code != 200:
                text = r.text
                r.close()
                raise HTTPException(status_code=r.status_code, detail=text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
        async def stream_generator():
            try:
                for line in r.iter_lines():
                    if not line:
                        continue
                    try:
                        chunk_data = json.loads(line)
                    except Exception:
                        continue
                    
                    text_chunk = chunk_data.get("response", "")
                    done = chunk_data.get("done", False)
                    
                    sse_chunk = {
                        "id": request_id,
                        "object": "text_completion",
                        "created": int(time.time()),
                        "model": model_name,
                        "choices": [{
                            "text": text_chunk,
                            "index": 0,
                            "logprobs": None,
                            "finish_reason": "stop" if done and not text_chunk else None
                        }]
                    }
                    yield f"data: {json.dumps(sse_chunk)}\n\n"
                    
                    if done:
                        yield "data: [DONE]\n\n"
            finally:
                r.close()
                
        return StreamingResponse(stream_generator(), media_type="text/event-stream")
    else:
        try:
            r = requests.post(f"{llm_base_url}/api/generate", json=ollama_payload, timeout=300)
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail=r.text)
            
            ollama_resp = r.json()
            
            # Translate Ollama response -> OpenAI completions format
            return {
                "id": request_id,
                "object": "text_completion",
                "created": int(time.time()),
                "model": model_name,
                "choices": [{
                    "text": ollama_resp.get("response", ""),
                    "index": 0,
                    "logprobs": None,
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": ollama_resp.get("prompt_eval_count", 0),
                    "completion_tokens": ollama_resp.get("eval_count", 0),
                    "total_tokens": ollama_resp.get("prompt_eval_count", 0) + ollama_resp.get("eval_count", 0)
                }
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions")
async def openai_chat_completions(request: Request):
    """
    OpenAI-compatible endpoint proxy.
    Allows external tools (like Cline, Cursor, LM Studio, etc.) to use Kyba as a local API server.
    """
    llm_base_url = "http://127.0.0.1:11434"
    
    try:
        ollama_payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
        
    # Check if the requested model is a custom Kyba model
    requested_model = ollama_payload.get("model", "")
    user_data_path = os.environ.get("KYBA_USER_DATA")
    if user_data_path:
        custom_models_path = os.path.join(user_data_path, "kyba_custom_models.json")
        if os.path.exists(custom_models_path):
            try:
                import json
                with open(custom_models_path, "r", encoding="utf-8") as f:
                    custom_models = json.load(f)
                
                # Find matching custom model by ID or Name
                matched_model = next((m for m in custom_models if m.get("id") == requested_model or m.get("name") == requested_model), None)
                
                if matched_model:
                    print(f"[Kyba Link] Intercepted custom model '{requested_model}'. Swapping to base model '{matched_model.get('baseModel')}'")
                    # Swap model
                    ollama_payload["model"] = matched_model.get("baseModel", "gemma4:e2b")
                    
                    # Apply temperature if set
                    if "temperature" in matched_model:
                        ollama_payload["temperature"] = matched_model["temperature"]
                    
                    if "top_p" in matched_model:
                        ollama_payload["top_p"] = matched_model["top_p"]
                        
                    # Inject system prompt
                    sys_prompt = matched_model.get("systemPrompt", "").strip()
                    if sys_prompt:
                        messages = ollama_payload.get("messages", [])
                        
                        # Replace or prepend system prompt
                        if len(messages) > 0 and messages[0].get("role") == "system":
                            # Merge or replace. Here we replace to enforce the agent's persona
                            messages[0]["content"] = sys_prompt + "\n\n" + messages[0].get("content", "")
                        else:
                            messages.insert(0, {"role": "system", "content": sys_prompt})
                        
                        ollama_payload["messages"] = messages
            except Exception as e:
                print(f"[Kyba Link] Error processing custom models: {e}")

    is_stream = ollama_payload.get("stream", False)
    
    if is_stream:
        try:
            r = requests.post(f"{llm_base_url}/v1/chat/completions", json=ollama_payload, stream=True, timeout=120)
            if r.status_code != 200:
                text = r.text
                r.close()
                raise HTTPException(status_code=r.status_code, detail=text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
        async def stream_generator():
            try:
                for chunk in r.iter_content(chunk_size=None):
                    if chunk:
                        yield chunk
            finally:
                r.close()
                
        return StreamingResponse(stream_generator(), media_type="text/event-stream")
    else:
        try:
            r = requests.post(f"{llm_base_url}/v1/chat/completions", json=ollama_payload, timeout=300)
            if r.status_code != 200:
                raise HTTPException(status_code=r.status_code, detail=r.text)
            return r.json()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# E2E ENCRYPTION PROXY (Opción 1: Encriptación a nivel de aplicación)
# ==============================================================================
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Clave compartida AES-256 (32 bytes). DEBE ser idéntica en la extensión.
E2E_PSK = b"kyba-secret-key-2026-00000000000"

def decrypt_payload(encrypted_b64: str) -> dict:
    data = base64.b64decode(encrypted_b64)
    nonce = data[:12]
    ciphertext = data[12:]
    aesgcm = AESGCM(E2E_PSK)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode('utf-8'))

def encrypt_string(text: str) -> str:
    import os
    aesgcm = AESGCM(E2E_PSK)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, text.encode('utf-8'), None)
    return base64.b64encode(nonce + ciphertext).decode('utf-8')

class EncryptedRequest(BaseModel):
    payload: str

@app.post("/e2e/api/chat")
@app.post("/e2e/api/generate")
async def e2e_proxy(request: Request, body: EncryptedRequest):
    try:
        decrypted_json = decrypt_payload(body.payload)
        # Extraer el path original (/api/chat o /api/generate)
        path = request.url.path.replace("/e2e", "")
        
        is_stream = decrypted_json.get("stream", True)
        
        if is_stream:
            def stream_generator():
                with requests.post(f"{llm_base_url}{path}", json=decrypted_json, stream=True, timeout=300) as r:
                    for line in r.iter_lines():
                        if line:
                            text = line.decode('utf-8')
                            encrypted_chunk = encrypt_string(text)
                            yield encrypted_chunk + "\n"
            return StreamingResponse(stream_generator(), media_type="text/plain")
        else:
            resp = requests.post(f"{llm_base_url}{path}", json=decrypted_json, timeout=300)
            return {"payload": encrypt_string(resp.text)}
    except Exception as e:
        print(f"[E2E] Error en proxy: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/e2e/api/tags")
async def e2e_tags():
    try:
        resp = requests.get(f"{llm_base_url}/api/tags", timeout=10)
        return {"payload": encrypt_string(resp.text)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
