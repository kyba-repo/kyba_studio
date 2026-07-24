// custom_chat_preload.js – exposes chatAPI to the custom chat renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chatAPI', {
  // Send a prompt to the local model and receive the generated answer
  send: (prompt, opts) => ipcRenderer.invoke('generate-local', { prompt, ...(opts || {}) }),
  executeTool: (name, args, extra) => ipcRenderer.invoke('execute-tool', { name, args, extra }),

  // Abort the current generation
  abort: () => ipcRenderer.send('abort-generation'),

  // Change execution mode (cpu / gpu)
  setMode: (mode) => ipcRenderer.send('set-execution-mode', mode),

  // Get current execution mode
  getMode: () => ipcRenderer.invoke('get-execution-mode'),

  // Ingest documents into local RAG backend. Payload: { path?: string }
  ingest: (payload) => ipcRenderer.invoke('ingest-docs', payload),
  // Open native file selector and return array of selected file paths (or null)
  selectFiles: (options) => ipcRenderer.invoke('select-files', options),

  // Get current working directory for terminal
  getCwd: () => process.cwd(),

  // Interactive Terminal (node-pty) methods
  initTerminal: () => ipcRenderer.send('terminal-init'),
  sendTerminalData: (data) => ipcRenderer.send('terminal-input', data),
  onTerminalData: (callback) => ipcRenderer.on('terminal-output', (event, data) => callback(data)),
  resizeTerminal: (cols, rows) => ipcRenderer.send('terminal-resize', { cols, rows }),

  // Transcribe audio buffer
  transcribeAudio: (buffer) => ipcRenderer.invoke('transcribe-audio', buffer),

  // Listen for GPU-fallback notifications
  onGpuFallback: (callback) => ipcRenderer.on('gpu-fallback', callback),

  // Send code to main IDE view
  sendToIDE: (code) => ipcRenderer.send('send-code-to-ide', code),

  // Save string content to file
  saveFile: (content, ext) => ipcRenderer.invoke('save-file', content, ext),

  // Model management exposed to chat
  checkModel: (model) => ipcRenderer.invoke('check-model', model),
  pullModel: (model) => ipcRenderer.invoke('pull-model', model),
  onPullProgress: (callback) => ipcRenderer.on('pull-progress', callback)
});

// Streaming helpers (subscribe/unsubscribe)
contextBridge.exposeInMainWorld('chatStream', {
  onStream: (cb) => ipcRenderer.on('model-stream', cb),
  offStream: (cb) => ipcRenderer.removeListener('model-stream', cb),
  onDone: (cb) => ipcRenderer.on('model-done', cb),
  offDone: (cb) => ipcRenderer.removeListener('model-done', cb),
  onModelChanged: (cb) => ipcRenderer.on('kyba-model-changed-ipc', cb),
  onClearChat: (cb) => ipcRenderer.on('kyba-clear-chat-ipc', cb)
});
