const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  contentReady: () => ipcRenderer.send('content-ready'),
  prompt: (options) => ipcRenderer.invoke('show-prompt', options),
  registrarPago: (ws, sec, edit) => ipcRenderer.invoke('registrar-pago', ws, sec, edit),
  buildApp: (type) => ipcRenderer.invoke('build-app', type),
  setAiProvider: (url) => ipcRenderer.send('set-ai-provider', url),
  onImportHtml: (callback) => ipcRenderer.on('import-html-to-workspace', callback),
  onUpdateIde: (callback) => ipcRenderer.on('update-ide', callback),
  onBackendReady: (callback) => ipcRenderer.on('backend-ready', callback),
  ingest: (payload) => ipcRenderer.invoke('ingest-docs', payload),
  listModelDocs: (profileId) => ipcRenderer.invoke('list-model-docs', profileId),
  selectFiles: (options) => ipcRenderer.invoke('select-files', options),
  saveFile: (content, ext) => ipcRenderer.invoke('save-file', content, ext),
  hideChatView: () => ipcRenderer.send('hide-chat-view'),
  showChatView: () => ipcRenderer.send('show-chat-view'),
  preloadModel: (payload) => ipcRenderer.invoke('preload-model', payload),
  notifyModelChanged: () => ipcRenderer.send('notify-model-changed'),
  notifyClearChat: () => ipcRenderer.send('notify-clear-chat'),
  checkModel: (modelName) => ipcRenderer.invoke('check-model', modelName),
  setNetworkExposed: (exposed) => ipcRenderer.send('set-network-exposed', exposed),
  getNetworkExposed: () => ipcRenderer.invoke('get-network-exposed'),
  pullModel: (modelName) => ipcRenderer.invoke('pull-model', modelName),
  onPullProgress: (callback) => {
    ipcRenderer.removeAllListeners('pull-progress');
    ipcRenderer.on('pull-progress', callback);
  }
});
