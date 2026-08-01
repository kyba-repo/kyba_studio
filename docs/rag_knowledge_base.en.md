# RAG and Knowledge Base

Kyba Studio integrates the **RAG** (Retrieval-Augmented Generation) technique to provide language models with long-term memory and access to specific technical information supplied by the user.

## RAG Architecture

The knowledge retrieval infrastructure resides entirely in the Python backend (`server.py`) and relies on the open-source vector database **ChromaDB**.

### 1. Document Ingestion (Ingest Pipeline)
When a user adds documents to a project or model in the interface:
1. **Frontend:** Invokes the `ingest-docs` IPC channel. Electron receives the instruction and physically copies the uploaded files to the user's temporary knowledge directory (`Path.home() / ".kyba/knowledge"`).
2. **API Call:** Electron sends an HTTP POST request to the `/ingest` endpoint in Uvicorn, providing the folder path.
3. **Extraction (Loaders):** 
   - The script analyzes the extension using the `SUPPORTED_EXTENSIONS` matrix.
   - It utilizes specific **Langchain Community** parsers: `PyPDFLoader` for PDFs, `Docx2txtLoader` for Word documents, `CSVLoader` for spreadsheets, and `TextLoader` for source code and markdown.
4. **Chunking:**
   - The `RecursiveCharacterTextSplitter` class from Langchain is employed. This function ensures that if a fragment is cut in the middle of a paragraph, it looks for logical separators (like line breaks `\n\n`) to keep the semantics intact, limiting the size to approximately 1000 tokens per chunk.

### 2. Embeddings Generation
The text fragments are transformed into multi-dimensional mathematical vectors known as *Embeddings*.
- To create the embeddings, Kyba utilizes `HuggingFaceEmbeddings`. By default, it downloads and executes the `nomic-ai/nomic-embed-text-v1.5` model on the local CPU, which is highly optimized for large context windows without requiring massive GPUs.
- These vectors, along with their metadata (such as file origin via `Document.metadata['source']`), are permanently saved in the ChromaDB collections hosted at `~/.kyba/chroma_db`.

### 3. Semantic Retrieval Phase
In the standard chat loop (`/chat` endpoint):
1. **Query:** The text the user enters into the chat (the *prompt*) is intercepted and simultaneously converted into an *embedding* vector.
2. **Vector Search (K-Nearest Neighbors):** ChromaDB calculates semantic similarity by iterating over the vector space. Typically, the `k=4` documents with the lowest Euclidean/Cosine distance are extracted.
3. **Context Injection:** The fragments are concatenated into a single string and dynamically injected into the `system` attribute of the payload sent to Ollama.
   ```python
   # Simplified prompt construction in server.py
   context_str = "\n\n".join([doc.page_content for doc in retrieved_docs])
   augmented_system_prompt = f"{base_prompt}\n\nUSE THE FOLLOWING CONTEXT:\n{context_str}"
   ```
4. **Synthesized Response:** The LLM receives both the retrieved context and the question, which dramatically reduces hallucinations and forces the model to cite the user's documentation.
