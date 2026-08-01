# Security and Audit

Because Kyba Studio runs Artificial Intelligence locally, it possesses broad permissions to interact with the host Operating System resources. Consequently, isolation and execution cycle protection are critical priorities.

## Frontend Defensive Architecture (Electron)

The graphical interface processes all chat content through isolated `BrowserView` and `BrowserWindow` instances. These views are strictly configured in `main.js`:

```javascript
// main.js - BrowserView security configuration
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

1. **`contextIsolation: true`:** Firmly prevents client-side JavaScript code from accessing the Node.js context (V8).
2. **`sandbox: true`:** Ensures that renderer processes run within the secure Chromium Sandbox.
3. **`webSecurity: true`:** Guarantees that CORS policies are respected.

## Defense in Depth: Preloads

Preload scripts are the IPC bridge and the most sensitive attack vector. Kyba Studio implements bifurcated architectures:

### Secure Local Views (`custom_chat_preload.js`)
It is only attached to the `BrowserView` in local contexts. As a **defense in depth** measure, the script internally checks the protocol:
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
If an attack managed to inject this preload into an `https://` URL, the protocol evaluation would silently fail, preventing the exposure of the `chatAPI` IPC bridge.

### Untrusted Third-Party Views (`ai-preload.js`)
If the user navigates to ChatGPT or Gemini web, `main.js` destroys the `BrowserView` and recreates it by injecting `ai-preload.js`.
This script **lacks** any invocations to `contextBridge`. It limits itself to the *Isolated World* scope to inject a MutationObserver into the page's DOM that looks for `<code>` tags and appends "Import to Kyba" buttons, sending harmless payloads via `ipcRenderer.send('ai-code-generated')`.

## Session Permission Policies

Kyba Studio proactively intercepts HTML5 web APIs (like `navigator.mediaDevices.getUserMedia`) using Electron's Session API:
```javascript
// main.js - Global Permission Interception
session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  const url = webContents.getURL();
  if (url.startsWith('file://')) {
    return callback(true); // Allow in secure local environment
  }
  return callback(false); // Deny (microphone, camera, notifications) on the web
});
```
This nullifies exfiltration or espionage vectors if the user loads untrusted interfaces inside the application container.
