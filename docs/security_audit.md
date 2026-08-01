# Seguridad y Auditoría (Security & Audit)

Dado que Kyba Studio ejecuta Inteligencia Artificial de forma local, posee amplios permisos para interactuar con los recursos del Sistema Operativo del anfitrión. Por consiguiente, el aislamiento y la protección del ciclo de ejecución son prioridades críticas.

## Arquitectura Defensiva del Frontend (Electron)

La interfaz gráfica procesa todo el contenido de los chats a través de instancias aisladas de `BrowserView` y `BrowserWindow`. Estas vistas están estrictamente configuradas en `main.js`:

```javascript
// main.js - Configuración de seguridad del BrowserView
chatView = new BrowserView({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: isLocal ? path.join(__dirname, 'renderer', 'custom_chat_preload.js') : path.join(__dirname, 'ai-preload.js'),
    webSecurity: true,
    allowRunningInsecureContent: false
  }
});
```

1. **`contextIsolation: true`:** Evita de forma contundente que el código JavaScript del cliente acceda al contexto de Node.js (V8).
2. **`sandbox: true`:** Asegura que los procesos de renderizado se ejecuten dentro del Sandbox seguro de Chromium.
3. **`webSecurity: true`:** Garantiza que se respeten las políticas CORS.

## Defensa en Profundidad: Los Preloads

Los scripts de precarga (*preloads*) son el puente IPC y el vector de ataque más sensible. Kyba Studio implementa arquitecturas bifurcadas:

### Vistas Locales Seguras (`custom_chat_preload.js`)
Solo se asocia al `BrowserView` en contextos locales. Como medida de **defensa en profundidad**, el script chequea internamente el protocolo:
```javascript
// custom_chat_preload.js
if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('chatAPI', {
    executeTool: (name, args) => ipcRenderer.invoke('execute-tool', { name, args }),
    initTerminal: () => ipcRenderer.send('terminal-init'),
    // ...
  });
}
```
Si un ataque lograra inyectar este preload en una URL `https://`, la evaluación de protocolo fallará silenciosamente, previniendo la exposición del puente IPC `chatAPI`.

### Vistas de Terceros no Confiables (`ai-preload.js`)
Si el usuario navega hacia ChatGPT o Gemini web, `main.js` destruye el `BrowserView` y lo recrea inyectando `ai-preload.js`.
Este script **carece** de invocaciones a `contextBridge`. Se limita al ámbito del *Isolated World* para inyectar un MutationObserver en el DOM de la página que busca etiquetas `<code>` y añade botones de "Importar a Kyba", enviando fragmentos inofensivos vía `ipcRenderer.send('ai-code-generated')`.

## Políticas de Permisos de Sesión

Kyba Studio intercepta proactivamente las APIs web de HTML5 (como `navigator.mediaDevices.getUserMedia`) utilizando la API de Sesiones de Electron:
```javascript
// main.js - Interceptación de Permisos Globales
session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  const url = webContents.getURL();
  if (url.startsWith('file://')) {
    return callback(true); // Permitir en entorno local seguro
  }
  return callback(false); // Denegar (micrófono, cámara, notificaciones) en la web
});
```
Esto anula vectores de exfiltración o espionaje si el usuario carga interfaces no confiables dentro del contenedor de la aplicación.
