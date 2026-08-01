# RAG y Base de Conocimientos (Knowledge Base)

Kyba Studio integra la técnica **RAG** (Retrieval-Augmented Generation o Generación Aumentada por Recuperación) para dotar a los modelos de lenguaje de memoria a largo plazo y acceso a información técnica específica provista por el usuario.

## Arquitectura de RAG

La infraestructura de recuperación de conocimientos reside por completo en el backend de Python (`server.py`) y depende de la base de datos vectorial de código abierto **ChromaDB**.

### 1. Ingesta de Documentos (Ingest Pipeline)
Cuando un usuario añade documentos a un proyecto o modelo en la interfaz:
1. **Frontend:** Invoca el canal IPC `ingest-docs`. Electron recibe la instrucción y copia físicamente los archivos subidos al directorio temporal de conocimiento del usuario (`Path.home() / ".kyba/knowledge"`).
2. **Llamada API:** Electron envía un HTTP POST al endpoint `/ingest` en Uvicorn proporcionando la ruta de la carpeta.
3. **Extracción (Loaders):** 
   - El script analiza la extensión utilizando la matriz `SUPPORTED_EXTENSIONS`.
   - Se utilizan parsers específicos de **Langchain Community**: `PyPDFLoader` para PDFs, `Docx2txtLoader` para Word, `CSVLoader` para hojas de cálculo, y `TextLoader` para código fuente y markdown.
4. **Chunking (Segmentación):**
   - Se emplea la clase `RecursiveCharacterTextSplitter` de Langchain. Esta función garantiza que si un fragmento se corta a la mitad de un párrafo, busque separadores lógicos (como saltos de línea `\n\n`) para mantener la semántica intacta, limitando el tamaño a aproximadamente 1000 tokens por chunk.

### 2. Generación de Embeddings
Los fragmentos de texto se transforman en vectores matemáticos de múltiples dimensiones conocidos como *Embeddings*.
- Para la creación de los embeddings, Kyba utiliza `HuggingFaceEmbeddings`. Por defecto, descarga y ejecuta en la CPU local el modelo `nomic-ai/nomic-embed-text-v1.5`, que está altamente optimizado para ventanas de contexto amplias sin requerir GPUs masivas.
- Estos vectores, junto con sus metadatos (origen del archivo como `Document.metadata['source']`), se guardan permanentemente en las colecciones de ChromaDB alojadas en `~/.kyba/chroma_db`.

### 3. Fase de Recuperación Semántica (Retrieval)
En el ciclo de chat estándar (endpoint `/chat`):
1. **Consulta (Query):** El texto que el usuario introduce en el chat (el *prompt*) se intercepta y se convierte simultáneamente en un vector de *embedding*.
2. **Búsqueda Vectorial (K-Nearest Neighbors):** ChromaDB calcula la similitud semántica iterando sobre el espacio vectorial. Se extraen típicamente los `k=4` documentos con menor distancia euclidiana/coseno.
3. **Inyección de Contexto:** Los fragmentos se concatenan en una cadena de texto y se inyectan dinámicamente en el atributo `system` del payload enviado a Ollama.
   ```python
   # Simplificación del armado del prompt en server.py
   context_str = "\n\n".join([doc.page_content for doc in retrieved_docs])
   augmented_system_prompt = f"{base_prompt}\n\nUSE THE FOLLOWING CONTEXT:\n{context_str}"
   ```
4. **Respuesta Sintetizada:** El LLM recibe tanto el contexto recuperado como la pregunta, lo que reduce dramáticamente las alucinaciones (hallucinations) y fuerza al modelo a citar la documentación del usuario.
