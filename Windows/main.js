const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const { dialog } = require('electron');
const electronPrompt = require('electron-prompt');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const net = require('net');
const pty = require('node-pty');

const baseCwd = app.isPackaged ? process.resourcesPath : __dirname;

// ── Global state ──────────────────────────────────────────────────────────────
let mainWindow;
let chatView;
let pendingProviderUrl = null;

let backendProcess = null;
let backendPort = Number(process.env.KYBA_RAG_PORT || 8000);
// Track active child processes so we can kill them when the app exits
const _activeChildren = new Set();
let currentAbortController = null;

function cleanupAllProcesses() {
  console.log('[Kyba] Cleaning up background processes...');
  if (backendProcess && !backendProcess.killed) {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        execSync(`taskkill /F /T /PID ${backendProcess.pid}`, { stdio: 'ignore' });
      }
      backendProcess.kill('SIGKILL');
    } catch (e) { }
  }
  for (const child of _activeChildren) {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
      }
      child.kill('SIGKILL');
    } catch (e) { }
  }
  _activeChildren.clear();
}

// Ensure processes are killed on abrupt exit (Ctrl+C in terminal)
process.on('exit', cleanupAllProcesses);
process.on('SIGINT', () => { cleanupAllProcesses(); process.exit(); });
process.on('SIGTERM', () => { cleanupAllProcesses(); process.exit(); });
process.on('uncaughtException', (err) => {
  console.error('[Kyba] Uncaught exception:', err);
  cleanupAllProcesses();
  process.exit(1);
});

let isQuitting = false;

ipcMain.on('abort-generation', () => {
  if (currentAbortController) {
    try { currentAbortController.abort(); } catch (e) { }
    currentAbortController = null;
  }
  for (const child of _activeChildren) {
    try { child.kill(); } catch (e) { }
  }
  _activeChildren.clear();
});

function getBackendPythonExecutable() {
  const candidates = [
    process.env.KYBA_PYTHON,
    path.join(__dirname, '.venv', 'Scripts', 'python.exe'),
    path.join(__dirname, '.venv', 'bin', 'python'),
    'python',
    'python3'
  ].filter(Boolean);
  return candidates.find(candidate => {
    try { return typeof candidate === 'string' && fs.existsSync(candidate); } catch (e) { return false; }
  }) || 'python';
}

function getFreePort(preferredPort = 8000) {
  return new Promise((resolve, reject) => {
    const tryPort = (port, attemptsLeft) => {
      const server = net.createServer();
      server.once('error', err => {
        if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
          return tryPort(port + 1, attemptsLeft - 1);
        }
        reject(err || new Error(`Could not reserve port ${port}`));
      });
      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        const chosenPort = typeof address === 'object' && address ? address.port : port;
        server.close(err => {
          if (err) return reject(err);
          resolve(chosenPort);
        });
      });
    };

    tryPort(preferredPort, 15);
  });
}

function getBackendBaseUrl() {
  if (process.env.KYBA_RAG_URL) return process.env.KYBA_RAG_URL;
  return `http://127.0.0.1:${backendPort}`;
}

let backendReadyPromise = null;

async function ensureBackendServer() {
  if (backendProcess && !backendProcess.killed) {
    if (backendReadyPromise) await backendReadyPromise;
    return backendProcess;
  }

  const exePath = app.isPackaged
    ? path.join(process.resourcesPath, 'kyba-server.exe')
    : path.join(__dirname, 'dist', 'kyba-server.exe');

  const port = Number(process.env.KYBA_RAG_PORT || backendPort || 8000);
  const requestedPort = Number.isFinite(port) && port > 0 ? port : 8000;
  const resolvedPort = await getFreePort(requestedPort);
  backendPort = resolvedPort;
  process.env.KYBA_RAG_PORT = String(resolvedPort);
  process.env.KYBA_RAG_URL = `http://127.0.0.1:${resolvedPort}`;

  let host = '127.0.0.1';
  try {
    const configPath = path.join(app.getPath('userData'), 'network_config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.expose_network) host = '0.0.0.0';
    }
  } catch (e) {
    console.error('Error reading network_config.json:', e);
  }

  if (app.isPackaged && (fs.existsSync(exePath) || fs.existsSync(path.join(__dirname, 'kyba-server.exe')))) {
    const finalExe = fs.existsSync(exePath) ? exePath : path.join(__dirname, 'kyba-server.exe');
    console.log('[Kyba] Starting precompiled backend:', finalExe, '--host', host, '--port', resolvedPort);
    backendProcess = spawn(finalExe, ['--host', host, '--port', String(resolvedPort)], {
      cwd: baseCwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } else {
    const pythonExe = getBackendPythonExecutable();
    const args = ['-m', 'uvicorn', 'server:app', '--host', host, '--port', String(resolvedPort)];
    console.log('[Kyba] Starting backend with', pythonExe, args.join(' '));

    backendProcess = spawn(pythonExe, args, {
      cwd: baseCwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  backendProcess.stdout.on('data', chunk => {
    const text = chunk.toString();
    if (text.trim()) console.log('[Kyba][backend]', text.trim());
  });
  backendProcess.stderr.on('data', chunk => {
    const text = chunk.toString();
    if (text.trim()) console.error('[Kyba][backend]', text.trim());
  });

  backendProcess.on('exit', (code, signal) => {
    console.log('[Kyba] backend exited', { code, signal });
    backendProcess = null;
    backendReadyPromise = null;
  });

  backendProcess.on('error', (err) => {
    console.error('[Kyba] backend spawn error:', err.message);
    backendProcess = null;
  });

  backendReadyPromise = (async () => {
    const healthUrl = `http://127.0.0.1:${resolvedPort}/`;
    for (let i = 0; i < 1200; i++) { // wait up to 20 minutes for first-time model download
      if (!backendProcess || backendProcess.killed) throw new Error('Backend died during startup');
      try {
        const res = await fetch(healthUrl);
        if (res.ok) return;
      } catch (e) {
        // Not ready yet
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Timeout waiting for backend to start');
  })();

  await backendReadyPromise;
  return backendProcess;
}

function optimizeOllamaForIntel() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    const { exec, spawn } = require('child_process');
    exec('wmic path win32_VideoController get name', (err, stdout) => {
      if (err) return resolve(false);
      const out = stdout.toUpperCase();
      const hasNvidia = out.includes('NVIDIA');
      const hasAmd = out.includes('AMD') || out.includes('RADEON');
      const hasIntel = out.includes('INTEL');
      
      if (!hasNvidia && !hasAmd && hasIntel) {
        console.log('[Kyba] Intel iGPU detected (no dedicated GPU found). Optimizing Ollama for iGPU...');
        exec('taskkill /F /IM "ollama app.exe" & taskkill /F /IM "ollama.exe"', () => {
          setTimeout(() => {
            const env = Object.assign({}, process.env, {
              OLLAMA_IGPU_ENABLE: '1',
              OLLAMA_VULKAN: '1',
              OLLAMA_FLASH_ATTENTION: '0'
            });
            const child = spawn('ollama', ['serve'], {
              env,
              stdio: 'ignore',
              windowsHide: true
            });
            child.unref();
            console.log('[Kyba] Ollama restarted with Intel optimizations.');
            setTimeout(() => resolve(true), 3000); // wait for Ollama to boot
          }, 1000);
        });
      } else {
        resolve(false);
      }
    });
  });
}

async function ensureOllamaCLI() {
  const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
  try {
    const res = await fetchFn('http://127.0.0.1:11434/');
    if (res.ok || res.status === 200) {
      console.log('[Kyba] Ollama server is already running.');
      return true;
    }
  } catch (err) { }
  
  console.log('[Kyba] Ollama not running. Attempting to start Ollama CLI...');
  const { spawn } = require('child_process');
  const fs = require('fs');
  const pathMod = require('path');
  let exe = 'ollama';
  const possible = [];
  const up = process.env.USERPROFILE || process.env.HOME;
  if (up) {
    possible.push(
      pathMod.join(up, '.ollama', 'bin', 'ollama.exe'),
      pathMod.join(up, '.ollama', 'bin', 'ollama'),
      pathMod.join(up, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe')
    );
  }
  if (process.env.LOCALAPPDATA) {
    possible.push(pathMod.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'));
  }
  if (process.env.PROGRAMFILES) {
    possible.push(pathMod.join(process.env.PROGRAMFILES, 'Ollama', 'ollama.exe'));
  }
  possible.push(
    pathMod.join('C:', 'Program Files', 'Ollama', 'ollama.exe'),
    pathMod.join('C:', 'Program Files (x86)', 'Ollama', 'ollama.exe')
  );
  
  for (const p of possible) {
    try { if (fs.existsSync(p)) { exe = p; break; } } catch (e) { }
  }
  
  try {
    const child = spawn(exe, ['serve'], {
      env: process.env,
      stdio: 'ignore',
      windowsHide: true
    });
    
    _activeChildren.add(child);
    child.on('exit', () => _activeChildren.delete(child));
    
    await new Promise(r => setTimeout(r, 2000));
    return true;
  } catch(e) {
    console.error('[Kyba] Failed to spawn Ollama CLI:', e);
    return false;
  }
}

app.whenReady().then(async () => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true);
    }
    return callback(true);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') {
      return true;
    }
    return true;
  });

  try {
    await optimizeOllamaForIntel();
    await ensureOllamaCLI();
    await ensureBackendServer();
    
    // Preload last used model into RAM
    try {
      let targetModel = 'gemma4:e2b';
      if (mainWindow && mainWindow.webContents) {
        targetModel = await mainWindow.webContents.executeJavaScript(`
          (function() {
            const activeId = localStorage.getItem('kyba_active_model_id') || 'default';
            if (activeId === 'default') return 'gemma4:e2b';
            try {
              const models = JSON.parse(localStorage.getItem('kyba_custom_models') || '[]');
              const m = models.find(x => x.id === activeId);
              return m ? (m.baseModel || 'gemma4:e2b') : 'gemma4:e2b';
            } catch(e) { return 'gemma4:e2b'; }
          })()
        `);
      }
      console.log(`[Kyba] Preloading last used model (${targetModel}) into RAM...`);
      
      const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
      await fetchFn('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          keep_alive: '15m',
          options: { temperature: 0.2, num_ctx: 8192 }
        })
      });
      console.log(`[Kyba] Model ${targetModel} preloaded successfully.`);
    } catch (e) {
      console.warn('[Kyba] Model preload warning (may not be installed yet or Ollama is busy):', e.message);
    }

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('backend-ready');
    }
    if (chatView && chatView.webContents) {
      chatView.webContents.send('backend-ready');
    }
    
    // Attach chatView now that loading is done so it doesn't cover the loading overlay
    if (mainWindow && chatView) {
      try {
        mainWindow.setBrowserView(chatView);
        const { width, height } = mainWindow.getContentBounds();
        chatView.setBounds({ x: 0, y: 45, width: width, height: height - 45 });
      } catch(e) {}
    }

  } catch (e) {
    console.warn('[Kyba] backend startup failed', e && e.message);
    // Even if it fails, dismiss loading screen so app is usable
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('backend-ready');
    }
  }
});

app.on('before-quit', (e) => {
  if (isQuitting) return;
  e.preventDefault();

  (async () => {
    console.log('[Kyba] Unloading all models from VRAM...');
    try {
      const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
      
      // 1. Get list of models currently in memory
      const psRes = await fetchFn('http://127.0.0.1:11434/api/ps');
      if (psRes.ok) {
        const psData = await psRes.json();
        const modelsToUnload = psData.models || [];
        
        // 2. For each loaded model, send keep_alive: 0
        for (const m of modelsToUnload) {
          if (m && m.name) {
            console.log(`[Kyba] Unloading ${m.name}...`);
            await fetchFn('http://127.0.0.1:11434/api/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: m.name, keep_alive: 0 })
            }).catch(() => {});
          }
        }
      } else {
        // Fallback: unload default in case /api/ps fails
        await fetchFn('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gemma4:e2b', keep_alive: 0 })
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('[Kyba] Error unloading models:', err.message);
    }
    cleanupAllProcesses();
    isQuitting = true;
    app.quit();
  })();
});

// ── IPC: Ingest documents into RAG backend ───────────────────────────────────
ipcMain.handle('ingest-docs', async (_, payload) => {
  try {
    const fs = require('fs');
    const os = require('os');
    const pathMod = require('path');
    await ensureBackendServer();
    const backendUrl = `${getBackendBaseUrl()}/ingest`;

    const profileId = payload.profile_id || 'default';
    const targetDir = pathMod.join(os.homedir(), '.kyba', 'knowledge', profileId);

    // If payload contains an array of file paths, copy them into the project's knowledge dir
    if (payload && Array.isArray(payload.paths) && payload.paths.length) {
      try { if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true }); } catch (e) { }

      let existingCount = 0;
      try {
        if (fs.existsSync(targetDir)) {
          existingCount = fs.readdirSync(targetDir).filter(f => fs.statSync(pathMod.join(targetDir, f)).isFile()).length;
        }
      } catch (e) { }

      if (existingCount + payload.paths.length > 10) {
        return { ok: false, error: 'Limit reached: Maximum 10 documents allowed per model.' };
      }

      for (const p of payload.paths) {
        try {
          const basename = pathMod.basename(p);
          let dest = pathMod.join(targetDir, basename);
          // If file exists, append a numeric suffix
          let i = 1;
          while (fs.existsSync(dest)) {
            const ext = pathMod.extname(basename);
            const nameOnly = pathMod.basename(basename, ext);
            dest = pathMod.join(targetDir, `${nameOnly}_${i}${ext}`);
            i++;
          }
          fs.copyFileSync(p, dest);
        } catch (e) {
          console.warn('[Kyba] failed to copy file for ingest:', p, e && e.message);
        }
      }
    }

    // Trigger backend ingest for the knowledge directory explicitly.
    const ingestPath = targetDir;
    const res = await fetch(backendUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: ingestPath, profile_id: profileId }) });
    const text = await res.text();
    try { return { ok: res.ok, status: res.status, body: JSON.parse(text) }; } catch (e) { return { ok: res.ok, status: res.status, body: text }; }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

// ── IPC: Transcribe Audio ───────────────────────────────────────────────────
ipcMain.handle('transcribe-audio', async (_, buffer) => {
  try {
    await ensureBackendServer();
    const backendUrl = `${getBackendBaseUrl()}/transcribe`;
    
    // Convert generic buffer back to Blob/Buffer and send it
    const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
    const res = await fetchFn(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm' },
      body: Buffer.from(buffer)
    });
    
    const data = await res.json();
    if (res.ok) {
      return { ok: true, text: data.text || '' };
    } else {
      return { ok: false, error: data.detail || 'Error during transcription' };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Open file selector and return file paths
ipcMain.handle('select-files', async (_, options) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const res = await dialog.showOpenDialog(win, Object.assign({ properties: ['openFile', 'multiSelections'] }, options || {}));
    if (res.canceled) return null;
    return res.filePaths;
  } catch (e) {
    console.warn('[Kyba] select-files error', e && e.message);
    return null;
  }
});

// ── IPC: List documents in knowledge base ───────────────────────────────────────
ipcMain.handle('list-model-docs', async (_, profileId) => {
  try {
    const fs = require('fs');
    const os = require('os');
    const pathMod = require('path');
    const targetDir = pathMod.join(os.homedir(), '.kyba', 'knowledge', profileId);
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir);
      return files.filter(f => fs.statSync(pathMod.join(targetDir, f)).isFile());
    }
    return [];
  } catch (e) {
    console.error('[Kyba] list-model-docs error:', e);
    return [];
  }
});

// ── Pre-check model via IPC ───────────────────────────────────────────────────
ipcMain.handle('check-model', async (_, modelName) => {
  return new Promise((resolve) => {
    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const pathMod = require('path');
      let exe = 'ollama';
      try {
        if (process.platform === 'win32') {
          const out = execSync('where ollama', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/)[0].trim();
          if (out) exe = out;
        } else {
          const out = execSync('which ollama', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
          if (out) exe = out;
        }
      } catch (e) { }

      if (exe === 'ollama') {
        const possible = [];
        const up = process.env.USERPROFILE || process.env.HOME;
        if (up) possible.push(pathMod.join(up, '.ollama', 'bin', 'ollama.exe'), pathMod.join(up, '.ollama', 'bin', 'ollama'));
        if (process.env.PROGRAMFILES) possible.push(pathMod.join(process.env.PROGRAMFILES, 'Ollama', 'ollama.exe'));
        possible.push(pathMod.join('C:', 'Program Files', 'Ollama', 'ollama.exe'), pathMod.join('C:', 'Program Files (x86)', 'Ollama', 'ollama.exe'));
        for (const p of possible) {
          try { if (fs.existsSync(p)) { exe = p; break; } } catch (e) { }
        }
      }

      const { exec } = require('child_process');
      exec(`"${exe}" show ${modelName}`, { env: process.env }, (err, stdout, stderr) => {
        if (!err) {
          resolve({ installed: true });
        } else {
          resolve({ installed: false });
        }
      });
    } catch (e) {
      resolve({ installed: false });
    }
  });
});

ipcMain.handle('pull-model', async (event, modelName) => {
  return new Promise((resolve, reject) => {
    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const pathMod = require('path');
      let exe = 'ollama';
      try {
        if (process.platform === 'win32') {
          const out = execSync('where ollama', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/)[0].trim();
          if (out) exe = out;
        } else {
          const out = execSync('which ollama', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
          if (out) exe = out;
        }
      } catch (e) { }

      if (exe === 'ollama') {
        const possible = [];
        const up = process.env.USERPROFILE || process.env.HOME;
        if (up) possible.push(pathMod.join(up, '.ollama', 'bin', 'ollama.exe'), pathMod.join(up, '.ollama', 'bin', 'ollama'));
        if (process.env.PROGRAMFILES) possible.push(pathMod.join(process.env.PROGRAMFILES, 'Ollama', 'ollama.exe'));
        possible.push(pathMod.join('C:', 'Program Files', 'Ollama', 'ollama.exe'), pathMod.join('C:', 'Program Files (x86)', 'Ollama', 'ollama.exe'));
        for (const p of possible) {
          try { if (fs.existsSync(p)) { exe = p; break; } } catch (e) { }
        }
      }

      const pullChild = pty.spawn(exe, ['pull', modelName], { cols: 80, rows: 30, env: process.env });
      _activeChildren.add(pullChild);

      pullChild.on('data', d => {
        const txt = d.toString();
        event.sender.send('pull-progress', txt);
      });

      const handleExit = (code) => {
        _activeChildren.delete(pullChild);
        if (code === 0) resolve({ ok: true });
        else resolve({ ok: false, error: `Exit code ${code}` });
      };

      if (typeof pullChild.onExit === 'function') {
        pullChild.onExit(({ exitCode }) => handleExit(exitCode));
      } else {
        pullChild.on('exit', handleExit);
      }
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
});

async function ensureOllamaModel(modelName, sendToViews, abortSignal) {
  return new Promise((resolve, reject) => {
    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const pathMod = require('path');

      // Find ollama executable
      let exe = 'ollama';
      try {
        if (process.platform === 'win32') {
          const out = execSync('where ollama', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/)[0].trim();
          if (out) exe = out;
        } else {
          const out = execSync('which ollama', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
          if (out) exe = out;
        }
      } catch (e) { }

      if (exe === 'ollama') {
        const possible = [];
        const up = process.env.USERPROFILE || process.env.HOME;
        if (up) possible.push(pathMod.join(up, '.ollama', 'bin', 'ollama.exe'), pathMod.join(up, '.ollama', 'bin', 'ollama'));
        if (process.env.PROGRAMFILES) possible.push(pathMod.join(process.env.PROGRAMFILES, 'Ollama', 'ollama.exe'));
        possible.push(pathMod.join('C:', 'Program Files', 'Ollama', 'ollama.exe'), pathMod.join('C:', 'Program Files (x86)', 'Ollama', 'ollama.exe'));
        for (const p of possible) {
          try { if (fs.existsSync(p)) { exe = p; break; } } catch (e) { }
        }
      }

      const { exec } = require('child_process');
      exec(`"${exe}" show ${modelName}`, { env: process.env }, (err, stdout, stderr) => {
        try {
          if (!err) {
            return resolve();
          }

          sendToViews('model-stream', `\n[System] Starting download of model ${modelName}. This may take a few minutes...\n`);
          const pullChild = pty.spawn(exe, ['pull', modelName], { cols: 80, rows: 30, env: process.env });
          _activeChildren.add(pullChild);

          let onAbort = null;
          if (abortSignal) {
            onAbort = () => {
              try { pullChild.kill(); } catch (e) { }
              reject(new Error('AbortError'));
            };
            abortSignal.addEventListener('abort', onAbort);
          }

          pullChild.on('data', d => {
            const txt = d.toString();
            sendToViews('model-stream', txt);
          });

          const handleExit = (code) => {
            _activeChildren.delete(pullChild);
            if (abortSignal && onAbort) abortSignal.removeEventListener('abort', onAbort);
            if (code === 0) {
              sendToViews('model-stream', `\n[System] Download completed successfully.\n\n`);
              resolve();
            } else {
              reject(new Error(`Failed to download model (code ${code})`));
            }
          };

          if (typeof pullChild.onExit === 'function') {
            pullChild.onExit(({ exitCode }) => handleExit(exitCode));
          } else {
            pullChild.on('exit', handleExit);
          }
        } catch (e) {
          console.error('[Kyba] ensureOllamaModel inner error:', e);
          resolve();
        }
      });
    } catch (e) {
      console.error('[Kyba] ensureOllamaModel outer error:', e);
      resolve();
    }
  });
}

// ── Local model wrapper (llama-cli) ───────────────────────────────────────────
async function generateLocal(payload) { // payload: string or { prompt, options, system_prompt, history, profile_id }
  let userPrompt = '';
  let modelOptions = null;
  let systemPrompt = '';
  let history = [];
  let profileId = 'default';
  let targetModel = 'gemma4:e2b';
  let images = null;
  let documents = null;
  let reasoningEffort = 'medium';

  if (typeof payload === 'string') userPrompt = payload;
  else if (payload && typeof payload === 'object') {
    userPrompt = payload.prompt || '';
    modelOptions = payload.options || null;
    systemPrompt = payload.system_prompt || '';
    history = payload.history || [];
    profileId = payload.profile_id || 'default';
    targetModel = payload.model || 'gemma4:e2b';
    images = payload.images || null;
    documents = payload.documents || null;
    reasoningEffort = payload.reasoning_effort || 'medium';
  }
  // Try the local RAG backend first so the chat can use knowledge retrieval.
  function sendToViews(channel, payload) {
    try { if (chatView && chatView.webContents) chatView.webContents.send(channel, payload); } catch (e) { }
    try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send(channel, payload); } catch (e) { }
  }

  try {
    currentAbortController = new AbortController();

    await ensureOllamaModel(targetModel, sendToViews, currentAbortController.signal);
    await ensureBackendServer();
    const backendUrl = `${getBackendBaseUrl()}/chat`;
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ question: userPrompt, profile_id: profileId, system_prompt: systemPrompt, model: targetModel, reasoning_effort: reasoningEffort }, modelOptions ? { options: modelOptions } : {}, history && history.length ? { history: history } : {}, images && images.length ? { images: images } : {}, documents && documents.length ? { documents: documents } : {})),
      signal: currentAbortController.signal
    });

    if (response.ok) {
      const data = await response.json();
      const answer = String(data && data.answer ? data.answer : '').trim();
      if (answer) {
        sendToViews('model-stream', answer);
        sendToViews('model-done', { ok: true, answer, model: targetModel });
        return answer;
      }
      throw new Error('Backend returned an empty response.');
    }

    const errorText = await response.text().catch(() => '');
    throw new Error(`Backend HTTP ${response.status}: ${errorText || 'no details'}`);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      console.log('[Kyba] generation aborted during RAG fetch.');
      sendToViews('model-done', { ok: false, error: 'Generación detenida' });
      return;
    }
    console.warn('[Kyba] RAG backend unavailable, falling back to legacy flow:', err && err.message);
  }

  // Fallback to direct Ollama REST API
  async function runAttempt(prompt, attempt = 1) {
    return new Promise(async (resolve, reject) => {
      console.log('[Kyba] generateLocal.runAttempt start via REST API', { attempt, targetModel });
      try {
        const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

        const messages = [];
        let finalSystemPrompt = systemPrompt;
        if (reasoningEffort === 'low') {
          finalSystemPrompt += "\nREGLA: Puedes analizar brevemente la pregunta antes de responder, pero ve directo al grano rápidamente y sin rodeos.";
        } else if (reasoningEffort === 'medium') {
          finalSystemPrompt += "\nREGLA: Tómate un momento para organizar tus ideas y pensar lógicamente, pero mantén tu análisis conciso antes de dar la respuesta final.";
        } else if (reasoningEffort === 'high') {
          finalSystemPrompt += "\nREGLA: Eres libre de pensar detalladamente, explorar opciones y razonar paso a paso todo lo que necesites antes de entregar la mejor respuesta posible.";
        }

        if (finalSystemPrompt) {
          messages.push({ role: 'system', content: finalSystemPrompt });
        }
        if (history && history.length) {
          history.forEach(m => messages.push({ role: m.role, content: m.content }));
        }
        messages.push({ role: 'user', content: prompt });

        // Unload other models before starting
        try {
          const psRes = await fetchFn('http://127.0.0.1:11434/api/ps');
          if (psRes.ok) {
            const psData = await psRes.json();
            for (const m of (psData.models || [])) {
              if (m.name && m.name !== targetModel) {
                console.log(`[Kyba] Unloading previous model via REST: ${m.name}`);
                await fetchFn('http://127.0.0.1:11434/api/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ model: m.name, keep_alive: 0 })
                }).catch(() => {});
              }
            }
          }
        } catch(e) {}

        const response = await fetchFn('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: targetModel,
            messages: messages,
            options: modelOptions || { temperature: 0.2, top_p: 0.9 }
          }),
          signal: currentAbortController.signal
        });

        if (!response.ok) {
          throw new Error(`Ollama API returned HTTP ${response.status}`);
        }

        let fullAnswer = '';
        if (response.body) {
          if (typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop(); // keep incomplete line
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.message && parsed.message.content) {
                    fullAnswer += parsed.message.content;
                    sendToViews('model-stream', parsed.message.content);
                  }
                } catch (e) { }
              }
            }
            if (buffer.trim()) {
              try {
                const parsed = JSON.parse(buffer);
                if (parsed.message && parsed.message.content) {
                  fullAnswer += parsed.message.content;
                  sendToViews('model-stream', parsed.message.content);
                }
              } catch (e) { }
            }
          } else {
            // For Node.js iterables
            let buffer = '';
            for await (const chunk of response.body) {
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop();
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.message && parsed.message.content) {
                    fullAnswer += parsed.message.content;
                    sendToViews('model-stream', parsed.message.content);
                  }
                } catch (e) { }
              }
            }
            if (buffer.trim()) {
              try {
                const parsed = JSON.parse(buffer);
                if (parsed.message && parsed.message.content) {
                  fullAnswer += parsed.message.content;
                  sendToViews('model-stream', parsed.message.content);
                }
              } catch (e) { }
            }
          }
        }
        sendToViews('model-done', { ok: true, answer: fullAnswer, model: targetModel });
        resolve(fullAnswer);
      } catch (err) {
        if (err && err.name === 'AbortError') {
          sendToViews('model-done', { ok: false, error: 'Generation stopped' });
          resolve('');
        } else {
          console.error('[Kyba] legacy runAttempt failed:', err);
          sendToViews('model-done', { ok: false, error: err.message });
          reject(err);
        }
      }
    });
  }

  return runAttempt(userPrompt);
}

ipcMain.handle('generate-local', async (_, payload) => {
  try {
    // payload may be a string (legacy) or an object { prompt, options, system_prompt }
    let prompt = '';
    let options = null;
    let system_prompt = '';
    let history = [];
    let model = undefined;
    let profile_id = undefined;
    let images = undefined;
    let documents = undefined;

    if (typeof payload === 'string') prompt = payload;
    else if (payload && typeof payload === 'object') {
      prompt = payload.prompt || payload.text || '';
      options = payload.options || null;
      system_prompt = payload.system_prompt || '';
      history = payload.history || [];
      model = payload.model || undefined;
      profile_id = payload.profile_id || undefined;
      images = payload.images || undefined;
      documents = payload.documents || undefined;
    }
    const answer = await generateLocal({ prompt, options, system_prompt, history, model, profile_id, images, documents });
    return { ok: true, answer };
  } catch (e) {
    console.error('[Kyba] generate-local error:', e && e.message ? e.message : e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

// ── Window creation ───────────────────────────────────────────────────────────
function createWindow() {
  console.log('Creating main window...');

  mainWindow = new BrowserWindow({
    title: 'Kyba Studio',
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'renderer', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const setupWindowOpenHandler = (webContents) => {
    webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        openKybaWebView(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // Ignorar websockets locales
        if (url.includes('127.0.0.1') || url.includes('localhost')) return;
        event.preventDefault();
        openKybaWebView(url);
      }
    });
  };

  setupWindowOpenHandler(mainWindow.webContents);

  // ── BrowserView: AI/chat panel ────────────────────────────────────────────
  const createChatView = () => {
    chatView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,                          // false so preload can access IPC
        preload: path.join(__dirname, 'renderer', 'custom_chat_preload.js'),
        webSecurity: false,                      // allow cross-origin for ChatGPT/Gemini
        allowRunningInsecureContent: true
      }
    });

    // mainWindow.setBrowserView(chatView); // Retrasado hasta backend-ready para no tapar el loading screen

    // Load initial page (custom chat by default; change here if you prefer ChatGPT)
    chatView.webContents.loadFile(path.join(__dirname, 'renderer', 'custom_chat.html'))
      .catch(e => console.error('[Kyba] Error loading chat panel:', e));

    // In development (unpackaged) open DevTools for the chat view so logs are visible
    try {
      // Only open DevTools if explicitly requested via env `OPEN_DEVTOOLS=1`.
      if (process.env.OPEN_DEVTOOLS === '1') {
        chatView.webContents.once('did-finish-load', () => {
          try { chatView.webContents.openDevTools({ mode: 'right' }); } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { }

    // Bounds se establecen al hacer setBrowserView en app.whenReady()
  };

  function openKybaWebView(url) {
    const webWin = new BrowserWindow({
      title: 'Kyba WebView',
      width: 1000,
      height: 700,
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'renderer', 'icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    webWin.loadURL(url);
  }

  mainWindow.once('ready-to-show', () => {
    createChatView();
    setupWindowOpenHandler(chatView.webContents);
  });

  // Ensure menu bar is hidden (force) so it doesn't show at startup
  try {
    mainWindow.setMenuBarVisibility(false);
  } catch (e) { }

  // Keep chatView docked to the left when the window is resized or maximized
  mainWindow.on('resize', () => {
    try {
      if (!chatView) return;
      setChatViewBounds();
    } catch (e) {
      console.error('[Kyba] Error updating chat view bounds on resize:', e);
    }
  });

  // ── Helper: update chat panel bounds ────────────────────────────────────────
  const setChatViewBounds = () => {
    if (!chatView) return;
    const { width, height } = mainWindow.getContentBounds();
    chatView.setBounds({
      x: 0,
      y: 45,
      width: width,
      height: height - 45
    });
  };

  // ── IPC handlers ────────────────────────────────────────────────────────

  ipcMain.on('set-ai-provider', (_, providerUrl) => {
    if (!chatView) return;

    if (providerUrl === 'custom') {
      // Use custom_chat_preload.js (already set on chatView) for local chat
      chatView.webContents.loadFile(
        path.join(__dirname, 'renderer', 'custom_chat.html')
      ).catch(e => console.error('[Kyba] custom chat load error:', e));
    } else {
      // External provider: switch preload to ai-preload.js won't happen at runtime,
      // but we can simply load the URL (webSecurity:false handles login cookies)
      pendingProviderUrl = providerUrl;
      chatView.webContents.loadURL(providerUrl)
        .catch(e => console.error('[Kyba] provider load error:', e));
    }
  });

  ipcMain.on('content-ready', () => {
    console.log('Content ready signal received from renderer');
    if (mainWindow) {
      console.log('Showing main window...');
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.on('send-code-to-ide', (_, codeContent) => {
    console.log('[Kyba] Code received from AI panel, sending to IDE');
    if (mainWindow) mainWindow.webContents.send('update-ide', codeContent);
  });

  ipcMain.on('notify-model-changed', () => {
    if (chatView && !chatView.webContents.isDestroyed()) {
      chatView.webContents.send('kyba-model-changed-ipc');
    }
  });

  ipcMain.on('notify-clear-chat', () => {
    if (chatView && !chatView.webContents.isDestroyed()) {
      chatView.webContents.send('kyba-clear-chat-ipc');
    }
  });

  // Hide/show chatView so the settings modal in the main window is visible
  ipcMain.on('hide-chat-view', () => {
    if (chatView) {
      try { mainWindow.removeBrowserView(chatView); } catch (e) { }
    }
  });

  ipcMain.on('show-chat-view', () => {
    if (chatView && mainWindow) {
      try {
        mainWindow.setBrowserView(chatView);
        setChatViewBounds();
      } catch (e) { }
    }
  });

  // Fallback show if content-ready is never received
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.warn('[Kyba] Fallback: showing window after timeout');
      mainWindow.show();
    }
  }, 6000);

  // ── Save file to disk via native dialog ──────────────────────────────────
  ipcMain.on('set-network-exposed', (_, exposed) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'network_config.json');
      fs.writeFileSync(configPath, JSON.stringify({ expose_network: exposed }), 'utf8');
    } catch(e) {
      console.error('Error saving network config', e);
    }
  });

  ipcMain.handle('get-network-exposed', () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'network_config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.expose_network === true;
      }
    } catch(e) {}
    return false;
  });

  ipcMain.handle('save-file', async (_, content, ext) => {
    try {
      const win = BrowserWindow.getFocusedWindow() || mainWindow;
      const extMap = {
        python: { name: 'Python', extensions: ['py'] },
        javascript: { name: 'JavaScript', extensions: ['js'] },
        typescript: { name: 'TypeScript', extensions: ['ts'] },
        html: { name: 'HTML', extensions: ['html'] },
        css: { name: 'CSS', extensions: ['css'] },
        json: { name: 'JSON', extensions: ['json'] },
        java: { name: 'Java', extensions: ['java'] },
        cpp: { name: 'C++', extensions: ['cpp'] },
        c: { name: 'C', extensions: ['c'] },
        csharp: { name: 'C#', extensions: ['cs'] },
        ruby: { name: 'Ruby', extensions: ['rb'] },
        go: { name: 'Go', extensions: ['go'] },
        rust: { name: 'Rust', extensions: ['rs'] },
        php: { name: 'PHP', extensions: ['php'] },
        sql: { name: 'SQL', extensions: ['sql'] },
        shell: { name: 'Shell', extensions: ['sh'] },
        bash: { name: 'Bash', extensions: ['sh'] },
        markdown: { name: 'Markdown', extensions: ['md'] },
        yaml: { name: 'YAML', extensions: ['yml', 'yaml'] },
        xml: { name: 'XML', extensions: ['xml'] },
        csv: { name: 'CSV', extensions: ['csv'] },
      };
      const filterEntry = extMap[(ext || '').toLowerCase()] || { name: 'Text', extensions: ['txt'] };
      const res = await dialog.showSaveDialog(win, {
        title: 'Save file',
        defaultPath: `archivo.${filterEntry.extensions[0]}`,
        filters: [
          filterEntry,
          { name: 'All files', extensions: ['*'] }
        ]
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(res.filePath, content, 'utf-8');
      return { ok: true, filePath: res.filePath };
    } catch (e) {
      console.error('[Kyba] save-file error:', e && e.message);
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
const { autoUpdater } = require('electron-updater');

app.on('ready', () => {
  createWindow();

  // Setup auto-updater
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: 'A new version of KYBA has been downloaded. Do you want to restart the application to install it now?',
      buttons: ['Restart and Update', 'Later']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
});

// Ensure any running child processes are killed when the app quits
app.on('will-quit', () => {
  cleanupAllProcesses();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── Misc IPC handlers (outside createWindow so they register only once) ──────
ipcMain.handle('registrar-pago', async (_, ws, sec, edit) => {
  if (edit) return { error: 'Editor is enabled, cannot register payment.' };
  const items = ws[sec] || [];
  const tablaIdx = items.findIndex(i => i.tipo === 'table' || i.tipo === 'datatable');
  if (tablaIdx === -1) return { error: 'No table found in current tab.' };
  const nuevaFila = [
    'Payment ' + (items[tablaIdx].rows ? items[tablaIdx].rows.length + 1 : 1),
    '20/08/2025', '$1000', 'Approved'
  ];
  if (!items[tablaIdx].rows) items[tablaIdx].rows = [];
  items[tablaIdx].rows.push(nuevaFila);
  ws[sec] = items;
  return { ws };
});

ipcMain.handle('show-prompt', async (event, options) => {
  try {
    return await electronPrompt(options, mainWindow);
  } catch (e) {
    console.error('[Kyba] show-prompt error:', e);
    return null;
  }
});

ipcMain.handle('build-app', async (_, type) => {
  return new Promise(resolve => {
    const cmd = type === 'portable' ? 'npm run build:win:portable' : 'npm run build:win';
    exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) resolve({ success: false, error: error.message, stderr });
      else resolve({ success: true, output: stdout });
    });
  });
});
