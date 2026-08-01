// custom_chat.js – renderer logic for the local GPT-OSS chat panel

const form = document.getElementById('inputArea');
const promptEl = document.getElementById('prompt');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const messages = document.getElementById('messages');
const statusBar = document.getElementById('statusBar');

const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const previewArea = document.getElementById('previewArea');
let pendingAttachments = [];

if (attachBtn && fileInput) {
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    for (const file of files) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });
      const type = file.type.startsWith('image/') ? 'image' : 'document';
      pendingAttachments.push({ file, dataUrl, type });
    }
    renderPreview();
    fileInput.value = '';
  });
}

function renderPreview() {
  if (!previewArea) return;
  previewArea.innerHTML = '';
  if (pendingAttachments.length === 0) {
    previewArea.style.display = 'none';
    return;
  }
  previewArea.style.display = 'flex';
  pendingAttachments.forEach((att, index) => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    if (att.type === 'image') {
      const img = document.createElement('img');
      img.src = att.dataUrl;
      item.appendChild(img);
    } else {
      item.textContent = '📄 ' + att.file.name;
    }

    const rmBtn = document.createElement('button');
    rmBtn.className = 'remove-btn';
    rmBtn.innerHTML = '×';
    rmBtn.onclick = () => {
      pendingAttachments.splice(index, 1);
      renderPreview();
    };

    item.appendChild(rmBtn);
    previewArea.appendChild(item);
  });
}

let chatHistory = []; // Tracks conversation memory
let currentChatId = Date.now().toString();
let savedChats = [];
try {
  savedChats = JSON.parse(localStorage.getItem('kyba_chats') || '[]');
} catch(e) {}

function saveCurrentChat() {
  if (chatHistory.length === 0) return;
  const existingIndex = savedChats.findIndex(c => c.id === currentChatId);
  const firstUserMsg = chatHistory.find(m => m.role === 'user')?.content || 'New Chat';
  const title = firstUserMsg.substring(0, 30).trim() + (firstUserMsg.length > 30 ? '...' : '');
  
  const chatData = {
    id: currentChatId,
    title: title || 'New Chat',
    updatedAt: Date.now(),
    messages: chatHistory
  };

  if (existingIndex >= 0) {
    savedChats[existingIndex] = chatData;
  } else {
    savedChats.unshift(chatData);
  }
  
  savedChats.sort((a, b) => b.updatedAt - a.updatedAt);
  localStorage.setItem('kyba_chats', JSON.stringify(savedChats));
  renderSidebar();
}

function renderSidebar() {
  const list = document.getElementById('chatHistoryList');
  if (!list) return;
  list.innerHTML = '';
  
  savedChats.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'chat-history-item' + (chat.id === currentChatId ? ' active' : '');
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'chat-title-text';
    titleSpan.textContent = chat.title || 'Untitled Chat';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'chat-delete-btn';
    delBtn.innerHTML = '×';
    delBtn.title = 'Delete chat';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    };
    
    item.appendChild(titleSpan);
    item.appendChild(delBtn);
    
    item.onclick = () => loadChat(chat.id);
    list.appendChild(item);
  });
}

function startNewChat() {
  currentChatId = Date.now().toString();
  handleClearChat();
  renderSidebar();
}

function deleteChat(id) {
  savedChats = savedChats.filter(c => c.id !== id);
  localStorage.setItem('kyba_chats', JSON.stringify(savedChats));
  if (id === currentChatId) {
    startNewChat();
  } else {
    renderSidebar();
  }
}

function loadChat(id) {
  if (typeof isGenerating !== 'undefined' && isGenerating) return;
  const chat = savedChats.find(c => c.id === id);
  if (!chat) return;
  
  currentChatId = id;
  chatHistory = [...chat.messages];
  
  if (messages) messages.innerHTML = '';
  
  chatHistory.forEach(msg => {
    addBubble(msg.role, msg.content, msg.attachments || []);
  });
  
  renderSidebar();
  updateStatusBar();
}

document.addEventListener('DOMContentLoaded', () => {
  const newChatBtn = document.getElementById('newChatBtn');
  if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);
  renderSidebar();
  if (savedChats.length > 0 && chatHistory.length === 0) {
     startNewChat();
  }
});


// ── Voice Dictation (Local Whisper) ───────────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioStream = null;

async function startRecording() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    
    mediaRecorder.onstart = () => {
      isRecording = true;
      if (micBtn) micBtn.classList.add('recording');
      if (promptEl) promptEl.placeholder = 'Recording (local Whisper)...';
    };
    
    mediaRecorder.onstop = async () => {
      isRecording = false;
      if (micBtn) micBtn.classList.remove('recording');
      if (promptEl) promptEl.placeholder = 'Processing transcription...';
      
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioChunks = [];
      
      try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        if (window.chatAPI && window.chatAPI.transcribeAudio) {
          const result = await window.chatAPI.transcribeAudio(arrayBuffer);
          if (result && result.ok && result.text) {
            const currentVal = promptEl.value;
            promptEl.value = currentVal + (currentVal.endsWith(' ') || currentVal.length === 0 ? '' : ' ') + result.text;
            promptEl.dispatchEvent(new Event('input')); // auto-resize
          } else if (result && !result.ok) {
            console.error('[chat] Transcription error:', result.error);
            alert('Error transcribing audio: ' + result.error);
          }
        }
      } catch (e) {
        console.error('[chat] Audio processing error', e);
      } finally {
        if (promptEl) promptEl.placeholder = 'Type a message...';
      }
      
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }
    };
    
    mediaRecorder.start();
  } catch (err) {
    console.error('[chat] Mic access error:', err);
    alert('Could not access microphone. Check permissions.');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else {
      isRecording = false;
      if (micBtn) micBtn.classList.remove('recording');
      if (promptEl) promptEl.placeholder = 'Type a message...';
  }
}

if (micBtn) {
  micBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });
}

function updateMicState() {
  if (micBtn) {
    micBtn.disabled = false;
    micBtn.title = "Record audio (local Whisper)";
    micBtn.style.opacity = "1";
    micBtn.style.cursor = "pointer";
  }
}
window.addEventListener('online', updateMicState);
window.addEventListener('offline', updateMicState);
updateMicState();



// Utility: sanitize text from model (ANSI/control chars) — used by streams and final bubble
function sanitizeText(s) {
  if (!s && s !== 0) return '';
  let t = s.toString();
  // Remove ANSI escape sequences but keep CR/LF/tab for processing
  t = t.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '');
  // Remove other non-printable control chars except newline (\n), carriage return (\r) and tab
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, '');
  return t;
}

function stripReasoningNoise(text) {
  let t = sanitizeText(String(text || ''));
  if (!t) return '';
  t = t.replace(/<(thinking|reasoning|analysis|thought)[^>]*>[\s\S]*?<\/\1>/gi, '');
  t = t.replace(/<think[\s\S]*?<\/think>/gi, '');
  t = t.replace(/^\s*(thinking|reasoning|analysis|thoughts?)\s*[:\-]?\s*$/gim, '');
  t = t.replace(/^\s*(let me think|let's think|i'll think|voy a pensar|pienso|analizo|analizaré)\b.*$/gim, '');
  t = t.replace(/^\s*(paso|step)\s*\d+[\s:.-]*/gim, '');
  t = t.replace(/^\s*[\.\- ?]{2,}\s*$/gm, '');
  return t;
}

function setStatus(message, kind = 'info') {
  if (!statusBar) return;
  statusBar.textContent = message || '';
  if (kind === 'loading') {
    statusBar.className = 'loading';
  } else if (kind === 'error') {
    statusBar.className = 'error';
  } else {
    statusBar.className = 'ok';
  }
}

function updateStatusBar() {
  const activeId = localStorage.getItem('kyba_active_model_id') || 'default';
  let profileName = 'Base Model (gemma4:e2b)';
  let modelName = 'gemma4:e2b';

  if (activeId !== 'default') {
    try {
      const customModels = JSON.parse(localStorage.getItem('kyba_custom_models') || '[]');
      const p = customModels.find(m => m.id === activeId);
      if (p) {
        profileName = p.name;
        modelName = p.baseModel;
      }
    } catch (e) { }
  }
  setStatus(`Model: ${profileName.replace(/\s*\(.*?\)/g, '')} · ready`, 'ok');
}

function handleClearChat() {
  if (messages) messages.innerHTML = '';
  chatHistory = [];
  try { if (currentThinking) { currentThinking.remove(); currentThinking = null; } } catch (e) { }
  try { if (currentAssistant) currentAssistant = null; } catch (e) { }
  updateStatusBar();
}

window.addEventListener('kyba_model_changed', handleClearChat);
window.addEventListener('kyba_clear_chat', handleClearChat);
window.addEventListener('storage', (e) => {
  if (e.key === 'kyba_clear_chat_trigger' || e.key === 'kyba_active_model_id') {
    handleClearChat();
  } else if (e.key === 'kyba_theme') {
    applyTheme(e.newValue);
  }
});

function applyTheme(theme) {
  const hljsLink = document.getElementById('hljs-theme');
  if (theme === 'light') {
    document.body.classList.add('light-mode');
    if (hljsLink) hljsLink.href = "../node_modules/highlight.js/styles/github.min.css";
  } else {
    document.body.classList.remove('light-mode');
    if (hljsLink) hljsLink.href = "../node_modules/highlight.js/styles/github-dark.min.css";
  }
}
applyTheme(localStorage.getItem('kyba_theme') || 'dark');

// Use IPC fallback for robust cross-window communication
if (window.chatStream && typeof window.chatStream.onModelChanged === 'function') {
  window.chatStream.onModelChanged(() => handleClearChat());
}

if (window.chatStream && typeof window.chatStream.onClearChat === 'function') {
  window.chatStream.onClearChat(() => handleClearChat());
}

updateStatusBar();



// ── Auto-resize textarea ──────────────────────────────────────────────────────
promptEl.addEventListener('input', () => {
  promptEl.style.height = 'auto';
  promptEl.style.height = Math.min(promptEl.scrollHeight, 100) + 'px';
});

// Submit on Enter (Shift+Enter = newline)
promptEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event('submit'));
  }
});

// ── Send message ──────────────────────────────────────────────────────────────
// Global streaming state (single shared handlers)
let accumulated = '';
let currentThinking = null;
let currentAssistant = null; // element that will be updated during streaming
let streamListening = false;
// Only render model output that appears after this marker (accept variants)
const DONE_MARKER = '...done thinking.';
const DONE_MARKER_RE = /\.{0,3}\s*done thinking\s*[.!?]?/i;
let seenDoneThinking = false;
let pendingEmptyFallback = null;
let receivedAnyChunk = false;
let renderTimer = null;
let lastRendered = '';
let progressiveTimer = null;
let revealIndex = 0; // index of revealed word-token
const REVEAL_DELAY_MS = 80; // ms per token (word + trailing spaces)
let finalizing = false;

function tokenizeForReveal(s) {
  // split into tokens of non-space characters plus following spaces, preserving punctuation
  if (!s) return [];
  return String(s).match(/(\S+\s*)/g) || [];
}

// Determine whether a text chunk contains significant (letter/number) content
function isSignificantText(s) {
  if (!s) return false;
  try { return /[\p{L}\p{N}]/u.test(s); } catch (e) { return /[A-Za-z0-9]/.test(s); }
}

const streamHandler = (_, chunk) => {
  try {
    const raw = (chunk || '').toString();
    const cleaned = sanitizeText(raw);

    // If we didn't create a thinking bubble (panel opened late or UI race), create it now
    if (!currentThinking) {
      currentThinking = addBubble('thinking', '● thinking…');
      console.log('[chat] thinking bubble created (on stream)');
      sendBtn.disabled = true;
      setStatus('Generating response…', 'loading');
    }

    // Always append incoming cleaned chunk to accumulated. We'll detect the DONE_MARKER
    // after concatenation so markers split across chunk boundaries are found.
    accumulated += cleaned;
    // Only start rendering once we detect the DONE_MARKER in the accumulated stream
    if (!seenDoneThinking) {
      const m = accumulated.match(DONE_MARKER_RE);
      if (!m) {
        // not yet reached the marker; keep waiting
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      // Marker found: start rendering only the content after the marker
      seenDoneThinking = true;
      // keep only the part after the marker as the initial displayed content
      const idx = m.index + (m[0] ? m[0].length : DONE_MARKER.length);
      accumulated = accumulated.slice(idx);
      // reset progressive reveal index so we reveal from start
      revealIndex = 0;
      if (currentAssistant) { try { currentAssistant.textContent = ''; } catch (e) { } }
    }

    // cancel pending empty fallback (we have activity)
    try {
      if (pendingEmptyFallback) { clearTimeout(pendingEmptyFallback); pendingEmptyFallback = null; }
      receivedAnyChunk = true;
    } catch (e) { }
    // Strip common "thinking" artifacts that sometimes get mixed into the stream
    try {
      let candidateText = stripReasoningNoise(accumulated);
      const thinkingPatterns = [/(^|\n)[\s\-\*•●\.]{0,6}\s*(pensando|thinking)[^\n]*/ig, /(^|\n)\.{2,}\s*pensando[^\n]*/ig];
      for (const p of thinkingPatterns) {
        candidateText = candidateText.replace(p, '\n');
      }
      // remove lines that are just ellipses or bullets
      candidateText = candidateText.replace(/^\s*[\.\-•●]{2,}\s*$/gm, '');
      // If the word "pensando" appears and there's useful content after it, prefer the content after the last occurrence
      try {
        const low = candidateText.toLowerCase();
        const last = low.lastIndexOf('pensando');
        if (last > -1 && candidateText.length > last + 8) {
          candidateText = candidateText.slice(last + 8).replace(/^[\s\:\-\.\,]+/, '').trim();
        }
      } catch (e) { }
      // Instead of destructive trims, just replace known noise patterns.
      // Do NOT replace \n{2,} or trim, because it drops streaming spaces/newlines.
      accumulated = candidateText;
    } catch (e) { /* ignore cleaning errors */ }

    // Further strip status-like prefixes (lines like '● pensando…', '...thinking', '▌')
    try {
      function isStatusLine(line) {
        if (!line) return true;
        const t = line.trim();
        // lines that are mostly punctuation or very short are considered status/noise
        if (/^[\s\-\*\u2022\u25CF\.▌>]+$/.test(t)) return true;
        if (t.length < 4 && !/[\p{L}\p{N}]/u.test(t)) return true;
        if (/\b(pensando|thinking|generando|loading|esperando|wait|espera|done thinking|done)\b/i.test(t)) return true;
        return false;
      }

      const alines = (accumulated || '').split(/\r?\n/);
      let astart = 0;
      while (astart < alines.length && isStatusLine(alines[astart])) astart++;
      if (astart > 0 && astart < alines.length) accumulated = alines.slice(astart).join('\n').trim();
      accumulated = String(accumulated || '').replace(/^[\s>\-\*\u2022\u25CF▌\.]{0,10}/, '').trim();
    } catch (e) { }
    messages.scrollTop = messages.scrollHeight;
    console.log('[chat] RCV CHUNK len=', cleaned.length, 'preview=', cleaned.replace(/\n/g, ' ').slice(0, 80));

    // If we've found the done marker, start/continue progressive reveal (character-by-character)
    if (seenDoneThinking) {
      // ensure assistant bubble exists (empty text for progressive reveal)
      if (currentAssistant && currentAssistant.dataset && currentAssistant.dataset.finalized === 'true') {
        // previous bubble was finalized; don't reuse it
        currentAssistant = null;
      }
      if (!currentAssistant) {
        currentAssistant = addBubble('assistant', '');
      }
      // start reveal loop if not running
      if (!progressiveTimer) {
        progressiveTimer = setInterval(() => {
          try {
            const src = String(accumulated || '');
            const tokens = tokenizeForReveal(src);
            // increase reveal index but not beyond token count
            if (revealIndex < tokens.length) revealIndex = Math.min(tokens.length, revealIndex + 1);
            const toShow = tokens.slice(0, revealIndex).join('');
            // show a caret while streaming — render inline markdown progressively
            const needsCaret = (revealIndex < tokens.length || !finalizing);
            try {
              let html = renderProgressiveMarkdownToHTML(toShow + (needsCaret ? ' \u258C' : ''));
              if (needsCaret) {
                const caretHtml = '<span class="caret">▌</span>';
                const lastIdx = html.lastIndexOf('\u258C');
                if (lastIdx !== -1) {
                  html = html.substring(0, lastIdx) + caretHtml + html.substring(lastIdx + 1);
                } else {
                  html += caretHtml;
                }
              }
              currentAssistant.innerHTML = html;
            } catch (e) {
              currentAssistant.textContent = toShow + (needsCaret ? '▌' : '');
            }
            messages.scrollTop = messages.scrollHeight;
            // If we've been asked to finalize and we've revealed all tokens, stop interval
            if (finalizing && revealIndex >= tokens.length) {
              // remove caret and stop
              try { currentAssistant.innerHTML = renderProgressiveMarkdownToHTML(src); } catch (e) { currentAssistant.textContent = src; }
              // mark bubble as finalized so future streams won't overwrite it
              try { if (currentAssistant) currentAssistant.dataset.finalized = 'true'; } catch (e) { }
              clearInterval(progressiveTimer);
              progressiveTimer = null;
              finalizing = false;
            }
          } catch (e) { console.error('[chat] progressiveTimer error', e && e.message); }
        }, REVEAL_DELAY_MS);
      }
    }
  } catch (e) {
    console.error('[chat] streamHandler error', e && e.message);
  }
};

const doneHandler = (_, payload) => {
  try {
    let finalText = '';
    // Normalize payload.answer: accept string, JSON string, or object {answer:...}
    let payloadAnswer = payload && payload.answer;
    if (payloadAnswer && typeof payloadAnswer === 'object') {
      if (typeof payloadAnswer.answer !== 'undefined') payloadAnswer = payloadAnswer.answer;
      else payloadAnswer = String(payloadAnswer);
    }
    if (typeof payloadAnswer === 'string') {
      // If the model returned a JSON blob as string, try to parse
      try {
        const maybe = payloadAnswer.trim();
        if (maybe.startsWith('{') && maybe.indexOf('"answer"') !== -1) {
          const obj = JSON.parse(maybe);
          if (obj && obj.answer) payloadAnswer = obj.answer;
        }
      } catch (e) { }
      // Remove any injected markers if accidentally echoed
      try {
        const m = payloadAnswer.match(/<<<RESPUESTA_INICIO>>>([\s\S]*?)<<<RESPUESTA_FIN>>>/m);
        if (m && m[1]) payloadAnswer = m[1];
      } catch (e) { }
      if (payload && payload.ok && payloadAnswer && payloadAnswer.toString().trim().length > 0) {
        finalText = sanitizeText(payloadAnswer);
      }
    }
    // === CRITICAL: Extract ONLY content between markers from accumulated ===
    try {
      let acc = String(accumulated || '').trim();
      // Search for markers with any suffix: <<<RESPUESTA_START_...>>> to <<<RESPUESTA_END_...>>>
      const markerRe = /<<<RESPUESTA_START_[\w]+>>>([\s\S]*?)<<<RESPUESTA_END_[\w]+>>>/;
      const mm = acc.match(markerRe);
      if (mm && mm[1]) {
        // Found markers! Use only the content between them
        acc = mm[1].trim();
        console.log('[chat] Extracted content between markers, length=', acc.length);
      } else {
        // No markers found — apply aggressive cleanup
        // Remove footer
        acc = acc.replace(/>{2,}\s*Send a message[\s\S]*$/i, '');
        acc = acc.split(/\n/).filter(l => !/send a message/i.test(l) && !/for help/i.test(l)).join('\n');
        // Collapse multiple horizontal spaces (preserve newlines for code blocks)
        acc = acc.replace(/[^\S\n]+/g, ' ');
        acc = acc.replace(/\n{3,}/g, '\n\n').trim();
      }
      acc = acc.replace(/^[\s\n]+|[\s\n]+$/g, '').trim();
      if (acc && acc.length > 0) {
        finalText = acc;
      } else if (!finalText || finalText.trim().length === 0) {
        if (accumulated && accumulated.toString().trim().length > 0) {
          finalText = accumulated;
        }
      }
    } catch (e) { console.error('[chat] marker extraction error:', e && e.message); }
    // If we have the marker instruction anywhere, prefer only the content between markers
    try {
      // Extract content between RESPUESTA_START and RESPUESTA_END (with any random suffix)
      const markerRe = /<<<RESPUESTA_START_[\w]+>>>([\s\S]*?)<<<RESPUESTA_END_[\w]+>>>/;
      const mm = (finalText || '').match(markerRe);
      if (mm && mm[1]) {
        const extracted = mm[1].trim();
        if (extracted && extracted.length > 0) {
          finalText = extracted;
          console.log('[chat] Extracted via marker-end match, length=', extracted.length);
        }
      }
    } catch (e) { console.error('[chat] marker-end extraction error:', e && e.message); }

    // Remove known interactive prompt/footer injected by the model runtime
    try {
      if (finalText && typeof finalText === 'string') {
        // Remove common 'Send a message' footers, with or without leading '>' arrows
        // Remove entire lines that contain the phrase (case-insensitive)
        finalText = finalText.replace(/(^|\n).*send a message.*(\n|$)/ig, '\n');
        // Also remove standalone help hints like '(?/', '/? for help', etc.
        finalText = finalText.replace(/(^|\n).*for help.*(\n|$)/ig, '\n');
        // Fallback: remove trailing arrow-footers like '>>> Send a message (/? for help)'
        finalText = finalText.replace(/\s*>+\s*Send a message\s*(\([^)]*\))?\s*$/i, '');
        // Trim leftover whitespace/newlines
        finalText = finalText.replace(/^[\s\n]+|[\s\n]+$/g, '');
      }
      // Also strip the same patterns from accumulated fallback
      try {
        if (accumulated && typeof accumulated === 'string') {
          accumulated = accumulated.replace(/(^|\n).*send a message.*(\n|$)/ig, '\n');
          accumulated = accumulated.replace(/(^|\n).*for help.*(\n|$)/ig, '\n');
          accumulated = accumulated.replace(/\s*>+\s*Send a message\s*(\([^)]*\))?\s*$/i, '');
          accumulated = accumulated.replace(/^[\s\n]+|[\s\n]+$/g, '');
        }
      } catch (e) { }
    } catch (e) { }


    // === FINAL CLEANUP: Remove any remaining thinking blocks and instruction prose ===
    try {
      finalText = stripReasoningNoise(finalText);
      finalText = (finalText || '').replace(/<think[\s\S]*?<\/think>/gi, '').trim();
      finalText = (finalText || '').replace(/<thinking[\s\S]*?<\/thinking>/gi, '').trim();
      finalText = (finalText || '').replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '').trim();

      // Remove remaining markers if somehow they weren't caught earlier
      finalText = (finalText || '').replace(/<<<[\w_]+>>>/g, '').trim();

      // Remove lines that start with thinking/instruction keywords
      finalText = (finalText || '').split('\n').filter(line => {
        const t = line.trim().toLowerCase();
        // Skip instruction prose patterns
        if (/^(user\s+wants|they\s+want|we\s+|thus\s+|so\s+|so we|to provide|to answer)/.test(t)) return false;
        // Skip thinking/status lines
        if (/\b(pensando|thinking|razonando|reasoning|meditando|generando|elaborando|escribiendo|done\s+thinking|done thinking)\b/.test(t)) return false;
        // Skip pure noise/bullets
        if (/^[\s\-\*\u2022\u25CF\.▌>]+$/.test(t)) return false;
        return true;
      }).join('\n').trim();

      // Remove leading bullets/symbols
      finalText = (finalText || '').replace(/^[\s\-\*\u2022\u25CF\.▌>]{0,10}/, '').trim();

      // Collapse excessive newlines
      finalText = (finalText || '').replace(/\n{3,}/g, '\n\n').trim();


    } catch (e) { console.error('[chat] final cleanup error:', e && e.message); }

    // Detect placeholder-like responses (e.g. "<texto>", "<TU_RESPUESTA_AQUÍ>") and treat as invalid
    try {
      if (finalText && /^\s*<[^>]{1,80}>\s*$/.test(finalText)) {
        console.log('[chat] detected placeholder-only answer, falling back to accumulated');
        if (accumulated && accumulated.toString().trim().length > 0) {
          finalText = accumulated;
        } else {
          finalText = '[sin contenido: modelo devolvió un marcador]';
        }
      }
    } catch (e) { }
    if (!finalText || finalText.trim().length === 0 || (payload && payload.error)) {
      if (payload && payload.error) {
        if (payload.error === 'Generation stopped' || payload.error.includes('AbortError')) {
          // If aborted and nothing was generated, just clean up and exit
          if (!accumulated || accumulated.trim().length === 0) {
            try { if (currentThinking) { try { currentThinking.remove(); } catch (e) { } currentThinking = null; } } catch (e) { }
            statusBar.textContent = 'Listo';
            statusBar.className = '';
            sendBtn.innerHTML = '&#9658;'; // Play icon
            sendBtn.style.color = '';
            isGenerating = false;
            return; // Abort silently
          }
          // Otherwise, keep what we have
          finalText = accumulated;
        } else {
          finalText = '⚠️ ' + payload.error;
          // If the main process attached raw terminal output, append a trimmed preview
          try {
            if (payload.raw) {
              const rawText = sanitizeText(String(payload.raw || '')).trim();
              const preview = rawText.length > 1500 ? rawText.slice(-1500) : rawText;
              finalText += '\n\n--- salida del proceso (reciente) ---\n' + preview;
            }
          } catch (e) { }
        }
      } else {
        // If we received stream chunks, prefer accumulated; otherwise delay the
        // empty fallback so the UI keeps showing the 'pensando' bubble briefly.
        if (receivedAnyChunk) {
          finalText = accumulated || '[no content]';
        } else if (currentThinking && !currentAssistant) {
          // schedule fallback after short delay; it will be cancelled if chunks arrive
          pendingEmptyFallback = setTimeout(() => {
            try { if (currentThinking) currentThinking.remove(); } catch (e) { }
            addBubble('assistant', '[no content]');
            pendingEmptyFallback = null;
            sendBtn.disabled = false;
          }, 250);
          // keep thinking bubble for now and exit
          return;
        } else {
          finalText = '[no content]';
        }
      }
    }

    // Insert final assistant bubble (remove thinking bubble first so it's a direct swap)
    try { if (currentThinking) { try { currentThinking.remove(); } catch (e) { } currentThinking = null; } } catch (e) { }
    console.log('[chat] finalText preview:', (finalText || '').slice(0, 200).replace(/\n/g, ' '));

    // Code blocks are now displayed inline in the chat response (no IDE editor)
    // Instead of replacing with rendered Markdown immediately, set accumulated to the final text
    // and let the progressive reveal finish naturally; mark finalizing so the reveal stops when complete.
    try {
      // ensure progressive reveal will show the remainder
      accumulated = String(finalText || '');
      finalizing = true;
      // if reveal loop is not running, start it to finish revealing
      if (!progressiveTimer) {
        // start a small interval to drive reveal until completion
        progressiveTimer = setInterval(() => {
          try {
            const src = String(accumulated || '');
            const tokens = tokenizeForReveal(src);
            if (revealIndex < tokens.length) revealIndex = Math.min(tokens.length, revealIndex + 1);
            const toShow = tokens.slice(0, revealIndex).join('');
            if (!currentAssistant) { currentAssistant = addBubble('assistant', ''); }
            const needsCaret2 = (revealIndex < tokens.length || !finalizing);
            try {
              let html2 = renderProgressiveMarkdownToHTML(toShow + (needsCaret2 ? ' \u258C' : ''));
              if (needsCaret2) {
                const caretHtml2 = '<span class="caret">▌</span>';
                const lastIdx2 = html2.lastIndexOf('\u258C');
                if (lastIdx2 !== -1) {
                  html2 = html2.substring(0, lastIdx2) + caretHtml2 + html2.substring(lastIdx2 + 1);
                } else {
                  html2 += caretHtml2;
                }
              }
              currentAssistant.innerHTML = html2;
            } catch (e) {
              currentAssistant.textContent = toShow + (needsCaret2 ? '▌' : '');
            }
            messages.scrollTop = messages.scrollHeight;
            if (finalizing && revealIndex >= tokens.length) {
              try { currentAssistant.innerHTML = renderProgressiveMarkdownToHTML(src); } catch (e) { currentAssistant.textContent = src; }
              clearInterval(progressiveTimer);
              progressiveTimer = null;
              finalizing = false;
            }
          } catch (e) { console.error('[chat] finalize reveal error', e && e.message); }
        }, REVEAL_DELAY_MS);
      }
    } catch (e) {
      addBubble('assistant', finalText);
    }
    if (payload && payload.ok) {
      if (finalText) {
        chatHistory.push({ role: 'assistant', content: finalText });
        saveCurrentChat();

        // Add a small badge indicating the model used
        if (payload.model && currentAssistant) {
          const badge = document.createElement('div');
          badge.className = 'model-badge';
          badge.textContent = `⚡ Generated by ${payload.model}`;
          badge.style.fontSize = '0.70rem';
          badge.style.color = 'var(--text-secondary, #888)';
          badge.style.marginTop = '4px';
          badge.style.textAlign = 'right';
          badge.style.opacity = '0.7';
          badge.style.fontStyle = 'italic';
          currentAssistant.parentElement.appendChild(badge);
        }
      }
      updateStatusBar();
    } else {
      setStatus('Error generating response', 'error');
    }
  } catch (e) {
    console.error('[chat] doneHandler error', e && e.message);
  } finally {
    try { if (currentThinking) currentThinking.remove(); } catch (e) { }
    currentThinking = null;

    // reset button
    sendBtn.innerHTML = '&#9658;';
    sendBtn.style.color = '';
    isGenerating = false;
    sendBtn.disabled = false;

    // reset assistant streaming state
    // keep currentAssistant so final bubble stays; timers will stop when reveal completes
    receivedAnyChunk = false;
    if (pendingEmptyFallback) { clearTimeout(pendingEmptyFallback); pendingEmptyFallback = null; }
  }
};

function ensureStreamListeners() {
  if (streamListening) return;
  try {
    if (window.chatStream) {
      window.chatStream.onStream(streamHandler);
      window.chatStream.onDone(doneHandler);
      streamListening = true;
    }
  } catch (e) { console.error('[chat] ensureStreamListeners error', e && e.message); }
}

let isGenerating = false;
ensureStreamListeners();



form.addEventListener('submit', async e => {
  e.preventDefault();

  if (isGenerating) {
    if (window.chatAPI && typeof window.chatAPI.abort === 'function') {
      window.chatAPI.abort();
    }
    return;
  }

  const text = promptEl.value.trim();
  if (!text && pendingAttachments.length === 0) return;
  console.log('[chat] submit:', text.slice(0, 120));
  // If there's an active progressive reveal from a previous response, finalize it
  // so it doesn't get overwritten by the new response stream. We render the
  // accumulated content as final HTML (fallback to text) and clear the timer.
  try {
    if (progressiveTimer) {
      clearInterval(progressiveTimer);
      progressiveTimer = null;
      if (currentAssistant) {
        try {
          // Prefer accumulated text if present; otherwise use current bubble content
          const srcCandidate = (String(accumulated || '').trim().length > 0) ? String(accumulated) : (currentAssistant.textContent || currentAssistant.innerText || currentAssistant.innerHTML || '');
          if (srcCandidate && String(srcCandidate).trim().length > 0) {
            const finalHtml = renderMessageMarkdown(String(srcCandidate));
            currentAssistant.innerHTML = finalHtml;
            try { currentAssistant.dataset.finalized = 'true'; } catch (e) { }
          } else {
            // nothing to set — leave existing bubble content as-is and mark finalized
            try { currentAssistant.dataset.finalized = 'true'; } catch (e) { }
          }
        } catch (e) {
          try { currentAssistant.textContent = String(accumulated || currentAssistant.textContent || ''); } catch (ee) { }
        }
      }
      // detach reference so new response creates its own bubble
      currentAssistant = null;
    }
  } catch (e) { console.error('[chat] finalize previous reveal error', e && e.message); }

  // Detach any reference to the previous assistant bubble to prevent
  // the stream handler from deleting it when the new response starts.
  currentAssistant = null;

  let uiText = text;
  addBubble('user', text, pendingAttachments);
  promptEl.value = '';
  promptEl.style.height = 'auto';

  // remove any previous thinking bubble
  try { if (currentThinking) currentThinking.remove(); } catch (e) { }

  // Read active profile to determine modelName
  const activeId = localStorage.getItem('kyba_active_model_id') || 'default';
  let profile = null;
  if (activeId !== 'default') {
    try {
      const customModels = JSON.parse(localStorage.getItem('kyba_custom_models') || '[]');
      profile = customModels.find(m => m.id === activeId);
    } catch (e) { }
  }

  let options = { temperature: 0.2, top_p: 0.9, num_ctx: 8192 };
  let system_prompt = '';
  let modelName = 'gemma4:e2b';

  if (profile) {
    options.temperature = typeof profile.temperature === 'number' ? profile.temperature : 0.2;
    options.top_p = typeof profile.top_p === 'number' ? profile.top_p : 0.9;
    system_prompt = profile.systemPrompt || '';
    modelName = profile.baseModel || 'gemma4:e2b';
  } else {
    try {
      const s = JSON.parse(localStorage.getItem('kyba_model_settings') || '{}');
      if (typeof s.temperature === 'number') options.temperature = s.temperature;
      if (typeof s.top_p === 'number') options.top_p = s.top_p;
      if (s.systemPrompt) system_prompt = s.systemPrompt;
      if (s.baseModel) modelName = s.baseModel;
    } catch (e) { }
  }

  // Check and download model before proceeding
  isGenerating = true;
  sendBtn.innerHTML = '&#9724;'; // Stop icon (square)
  sendBtn.style.color = '#ef4444'; // Red color
  const downloadSuccess = await checkAndDownloadModel(modelName);
  if (!downloadSuccess) {
    isGenerating = false;
    sendBtn.innerHTML = '&#9658;'; // Send icon
    sendBtn.style.color = '#fff';
    statusBar.textContent = 'Model download error';
    statusBar.className = '';
    return;
  }

  currentThinking = addBubble('thinking', '● thinking…');
  console.log('[chat] thinking bubble created');
  statusBar.textContent = 'Generating response…';
  statusBar.className = 'loading';

  accumulated = '';
  seenDoneThinking = false;
  revealIndex = 0;
  finalizing = false;

  try {
    if (!window.chatAPI || typeof window.chatAPI.send !== 'function') {
      throw new Error('chatAPI not available. Check that custom_chat_preload.js is loaded.');
    }

    // Send the user's prompt directly to the model (no forced language or markers)
    const sendPrompt = text;


    // Copy current history to send, then append user's message
    const historyPayload = [...chatHistory];
    
    let userAttachments = [];
    pendingAttachments.forEach(att => {
        userAttachments.push({ type: att.type, dataUrl: att.dataUrl, file: { name: att.file.name } });
    });
    chatHistory.push({ role: 'user', content: uiText, attachments: userAttachments });
    saveCurrentChat();

    let images = [];
    let documents = [];
    pendingAttachments.forEach(att => {
      if (att.type === 'image') images.push(att.dataUrl);
      else documents.push({ filename: att.file.name, content: att.dataUrl });
    });

    pendingAttachments = [];
    renderPreview();
    const reasoning_effort = typeof selectedReasoning !== 'undefined' ? selectedReasoning : 'medium';

    await window.chatAPI.send(sendPrompt, { model: modelName, profile_id: activeId, options, system_prompt, history: historyPayload, images, documents, reasoning_effort });
    console.log('[chat] send() returned with reasoning_effort:', reasoning_effort);
  } catch (err) {
    try { if (currentThinking) currentThinking.remove(); } catch (e) { }
    addBubble('assistant', '⚠️ ' + err.message);
    statusBar.textContent = 'Error: ' + err.message;
    statusBar.className = 'error';
    statusBar.className = 'error';
    sendBtn.innerHTML = '&#9658;';
    sendBtn.style.color = '';
    isGenerating = false;
    currentThinking = null;
    accumulated = '';
  }
});

// ── Helper: add a message bubble ─────────────────────────────────────────────
function addBubble(sender, text, attachments = []) {
  const el = document.createElement('div');
  el.className = `bubble ${sender}`;

  if (sender === 'user' && attachments && attachments.length > 0) {
    const attContainer = document.createElement('div');
    attContainer.style.display = 'flex';
    attContainer.style.gap = '8px';
    attContainer.style.marginBottom = text ? '8px' : '0';
    attContainer.style.flexWrap = 'wrap';

    attachments.forEach(att => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '6px';
      item.style.background = 'rgba(0,0,0,0.15)';
      item.style.padding = '6px 10px';
      item.style.borderRadius = '8px';
      item.style.fontSize = '12.5px';

      if (att.type === 'image') {
        const img = document.createElement('img');
        img.src = att.dataUrl;
        img.style.width = '24px';
        img.style.height = '24px';
        img.style.borderRadius = '4px';
        img.style.objectFit = 'cover';
        item.appendChild(img);
      } else {
        item.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
      }
      const span = document.createElement('span');
      span.textContent = att.file.name || att.name;
      item.appendChild(span);
      attContainer.appendChild(item);
    });
    el.appendChild(attContainer);
  }

  // Ensure newlines are preserved and control chars removed
  try {
    const cleaned = sanitizeText(text || '');
    if (sender === 'user' || sender === 'thinking') {
      const textNode = document.createElement('div');
      textNode.style.whiteSpace = 'pre-wrap';
      textNode.textContent = cleaned;
      el.appendChild(textNode);
    } else {
      // Assistant bubbles: render full markdown
      const mdDiv = document.createElement('div');
      mdDiv.innerHTML = renderMessageMarkdown(cleaned);
      el.appendChild(mdDiv);
    }
  } catch (e) {
    const fallback = document.createElement('div');
    fallback.textContent = text;
    el.appendChild(fallback);
  }
  messages.appendChild(el);
  console.log('[chat] addBubble', { sender, len: (text || '').toString().length, children: messages.children.length, lastClass: messages.lastElementChild && messages.lastElementChild.className, preview: (text || '').toString().slice(0, 80).replace(/\n/g, ' ') });
  messages.scrollTop = messages.scrollHeight;
  return el;
}

// ── Markdown rendering with marked + highlight.js ────────────────────────────
// Configure marked with a custom renderer for Copilot-style code blocks
const markedRenderer = new marked.Renderer();

// Code blocks: wrap in a container with header (lang tag + copy button)
markedRenderer.code = function (code, language, escaped) {
  // marked v14+ may pass an object: { text, lang, escaped }
  let codeText = code;
  let lang = language;
  if (typeof code === 'object' && code !== null) {
    codeText = code.text || code.raw || '';
    lang = code.lang || language || '';
  }
  lang = (lang || '').trim();
  const displayLang = lang || 'text';
  // Highlight the code
  let highlighted;
  if (lang && window.hljs && window.hljs.getLanguage(lang)) {
    try {
      highlighted = window.hljs.highlight(codeText, { language: lang }).value;
    } catch (e) {
      highlighted = escapeHtml(codeText);
    }
  } else if (window.hljs) {
    try {
      highlighted = window.hljs.highlightAuto(codeText).value;
    } catch (e) {
      highlighted = escapeHtml(codeText);
    }
  } else {
    highlighted = escapeHtml(codeText);
  }
  let previewBtn = '';
  if ((lang || '').toLowerCase() === 'html') {
    previewBtn = `<button class="copy-btn" onclick="previewHtmlCode(this)" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border-color: rgba(59, 130, 246, 0.3);">Preview</button>`;
  }

  return `<div class="code-block-wrapper">` +
    `<div class="code-block-header">` +
    `<span class="code-lang">${escapeHtml(displayLang)}</span>` +
    `<div style="display: flex; gap: 6px;">` +
    previewBtn +
    `<button class="copy-btn" onclick="saveCodeBlock(this, '${escapeHtml(displayLang)}')">Save</button>` +
    `<button class="copy-btn" onclick="copyCodeBlock(this)">Copy</button>` +
    `</div>` +
    `</div>` +
    `<pre><code class="hljs language-${escapeHtml(lang)}">${highlighted}</code></pre>` +
    `</div>`;
};

// Add markdown table renderer
const defaultTableRenderer = markedRenderer.table;
markedRenderer.table = function (...args) {
  const originalHtml = defaultTableRenderer.apply(this, args);
  return `<div class="code-block-wrapper table-wrapper" style="margin: 14px 0; overflow-x: auto;">` +
    `<div class="code-block-header">` +
    `<span class="code-lang">table</span>` +
    `<button class="copy-btn" onclick="saveTableAsCSV(this)">Download CSV</button>` +
    `</div>` +
    `<div class="table-container" style="padding: 10px; border-radius: 0 0 8px 8px;">` +
    originalHtml +
    `</div>` +
    `</div>`;
};

// Configure marked options
marked.setOptions({
  renderer: markedRenderer,
  breaks: true,
  gfm: true,
  pedantic: false,
  smartypants: false
});

// Simple HTML escape utility
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Global copy handler for code blocks
window.copyCodeBlock = async function (btn) {
  try {
    const wrapper = btn.closest('.code-block-wrapper');
    if (!wrapper) return;
    const codeEl = wrapper.querySelector('pre code');
    if (!codeEl) return;
    const textToCopy = codeEl.innerText || codeEl.textContent || '';
    await navigator.clipboard.writeText(textToCopy);
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 1500);
  } catch (e) {
    btn.textContent = 'Error';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  }
};

window.saveCodeBlock = async function (btn, ext) {
  try {
    const wrapper = btn.closest('.code-block-wrapper');
    if (!wrapper) return;
    const codeEl = wrapper.querySelector('pre code');
    if (!codeEl) return;
    const textToSave = codeEl.innerText || codeEl.textContent || '';

    const extMap = { 'python': 'py', 'javascript': 'js', 'typescript': 'ts', 'html': 'html', 'css': 'css', 'json': 'json', 'csv': 'csv', 'markdown': 'md', 'text': 'txt' };
    const extension = extMap[ext.toLowerCase()] || ext.toLowerCase() || 'txt';

    if (window.chatAPI && window.chatAPI.saveFile) {
      const result = await window.chatAPI.saveFile(textToSave, extension);
      if (result && result.success) {
        const originalText = btn.textContent;
        btn.textContent = '✓ Saved';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copied');
        }, 1500);
      }
    }
  } catch (e) {
    btn.textContent = 'Error';
    setTimeout(() => { btn.textContent = 'Save'; }, 1500);
  }
};

window.saveTableAsCSV = async function (btn) {
  try {
    const wrapper = btn.closest('.code-block-wrapper');
    if (!wrapper) return;
    const tableEl = wrapper.querySelector('table');
    if (!tableEl) return;

    let csvContent = "";
    const rows = tableEl.querySelectorAll('tr');
    rows.forEach(row => {
      const cols = row.querySelectorAll('th, td');
      const rowData = Array.from(cols).map(col => {
        let text = (col.innerText || col.textContent || '').replace(/"/g, '""');
        if (text.includes(',') || text.includes('"') || text.includes('\\n')) {
          text = `"${text}"`;
        }
        return text;
      });
      csvContent += rowData.join(",") + "\\n";
    });

    if (window.chatAPI && window.chatAPI.saveFile) {
      const result = await window.chatAPI.saveFile(csvContent, 'csv');
      if (result && result.success) {
        const originalText = btn.textContent;
        btn.textContent = '✓ Downloaded';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copied');
        }, 1500);
      }
    }
  } catch (e) {
    btn.textContent = 'Error';
    setTimeout(() => { btn.textContent = 'Download CSV'; }, 1500);
  }
};

// Canvas Preview functions
window.previewHtmlCode = function (btn) {
  try {
    const wrapper = btn.closest('.code-block-wrapper');
    if (!wrapper) return;
    const codeEl = wrapper.querySelector('pre code');
    if (!codeEl) return;
    const htmlCode = codeEl.innerText || codeEl.textContent || '';

    const overlay = document.getElementById('canvasModalOverlay');
    const iframe = document.getElementById('canvasFrame');

    // Inject HTML into iframe using srcdoc
    iframe.srcdoc = htmlCode;
    overlay.classList.add('visible');
  } catch (e) {
    console.error('[Canvas Preview Error]', e);
  }
};

window.closeHtmlPreview = function () {
  const overlay = document.getElementById('canvasModalOverlay');
  const iframe = document.getElementById('canvasFrame');
  overlay.classList.remove('visible');
  // Clear the iframe to stop any scripts, audio, etc.
  setTimeout(() => {
    iframe.srcdoc = '';
  }, 300); // Wait for transition
};

// Setup canvas close button listener
document.addEventListener('DOMContentLoaded', () => {
  const canvasCloseBtn = document.getElementById('canvasCloseBtn');
  if (canvasCloseBtn) {
    canvasCloseBtn.addEventListener('click', window.closeHtmlPreview);
  }
});

// Preprocess LaTeX math delimiters to marked-katex format ($ and $$)
// and escape pipe characters (|) inside math blocks so Markdown tables don't break
function prepareMath(text) {
  if (!text) return '';

  const hasTableSeparator = (str) => /\n\s*\|?[\s-:]+\|[\s-:]+\|?/.test(str);

  // 1. Convert \[ ... \] and \( ... \) to $$ and $ while escaping |
  let s = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, p1) => {
    if (hasTableSeparator(p1)) return match;
    return '$$' + p1.replace(/\|/g, '\\vert ') + '$$';
  });
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (match, p1) => {
    if (hasTableSeparator(p1) || p1.includes('\n\n')) return match;
    return '$' + p1.replace(/\|/g, '\\vert ') + '$';
  });

  // 2. Also escape | inside native $$...$$ blocks
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (match, p1) => {
    if (hasTableSeparator(p1)) return match;
    return '$$' + p1.replace(/\|/g, '\\vert ') + '$$';
  });

  // 3. And inside native $...$ blocks (heuristic: no space after opening $)
  s = s.replace(/\$([^\s][\s\S]*?[^\s])\$/g, (match, p1) => {
    if (hasTableSeparator(p1) || p1.includes('\n\n')) return match;
    return '$' + p1.replace(/\|/g, '\\vert ') + '$';
  });

  // --- NEW FIXES FOR MATH PARSING ---

  // 4. Force blank lines around $$ blocks so marked parses them as block tokens.
  //    This prevents them from being absorbed into paragraph tokens or list items improperly.
  s = s.replace(/([^\n])\n\s*\$\$/g, '$1\n\n$$');
  s = s.replace(/\$\$\s*\n([^\n])/g, '$$\n\n$1');

  // 5. Remove newlines inside inline $...$ blocks (useful for markdown tables).
  //    Since markdown tables break if a cell has a newline, and LLMs sometimes
  //    emit multiline LaTeX inside a single $...$ block in a table, we flatten it.
  s = s.replace(/\$([\s\S]+?)\$/g, (match, p1) => {
    // Skip if it's actually a $$ block
    if (match.startsWith('$$')) return match;
    if (hasTableSeparator(p1) || p1.includes('\n\n')) return match; // skip swallowed tables
    return '$' + p1.replace(/\n/g, ' ') + '$';
  });

  return s;
}

// Full markdown render (used for final bubble content)
function renderMessageMarkdown(md) {
  if (!md) return '';
  try {
    return marked.parse(prepareMath(md));
  } catch (e) {
    console.error('[chat] marked.parse error', e);
    return escapeHtml(md);
  }
}

// Progressive render (lighter: inline markdown only, no code block processing)
// Used during streaming to show partial content safely
function renderProgressiveMarkdownToHTML(raw) {
  if (!raw) return '';
  try {
    // Use marked for full parsing even during streaming
    // This handles partial code blocks gracefully
    return marked.parse(prepareMath(raw));
  } catch (e) {
    // Fallback: escape and do basic inline formatting
    let s = escapeHtml(raw);
    s = s.replace(/`([^`]+)`/g, (m, code) => `<code>${code}</code>`);
    s = s.replace(/\*\*((?:[^*]|\*(?!\*))+)\*\*/g, (m, g1) => `<strong>${g1}</strong>`);
    s = s.replace(/\*(?:([^*]|\*(?!\*))+?)\*/g, (m, g1) => `<em>${g1}</em>`);
    return s;
  }
}

// ── Model Selector & Reasoning Controls ─────────────────────────────────────
const modelBtn = document.getElementById('modelBtn');
const modelMenu = document.getElementById('modelMenu');
const modelBtnText = document.getElementById('modelBtnText');

const reasoningBtn = document.getElementById('reasoningBtn');
const reasoningMenu = document.getElementById('reasoningMenu');
let selectedReasoning = 'medium';

function renderActiveModelSelect() {
  if (!modelMenu || !modelBtnText) return;
  let customModels = [];
  try {
    customModels = JSON.parse(localStorage.getItem('kyba_custom_models') || '[]');
  } catch (e) {}

  const activeId = localStorage.getItem('kyba_active_model_id') || 'default';

  modelMenu.innerHTML = '';

  const options = [{ id: 'default', name: 'Base Model (gemma4:e2b)' }, ...customModels];

  options.forEach(m => {
    const opt = document.createElement('div');
    opt.className = 'model-option';
    if (m.id === activeId) opt.classList.add('selected');
    opt.dataset.value = m.id;
    opt.textContent = m.name;

    if (m.id === activeId) {
      modelBtnText.textContent = m.name;
    }

    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem('kyba_active_model_id', m.id);
      window.dispatchEvent(new Event('kyba_model_changed'));
      renderActiveModelSelect();
      modelMenu.style.display = 'none';
    });

    modelMenu.appendChild(opt);
  });
}

if (modelBtn && modelMenu) {
  modelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (modelMenu.style.display === 'block') {
      modelMenu.style.display = 'none';
    } else {
      modelMenu.style.display = 'block';
    }
    if (reasoningMenu) reasoningMenu.style.display = 'none';
  });

  renderActiveModelSelect();
  window.addEventListener('storage', (e) => {
    if (e.key === 'kyba_custom_models') renderActiveModelSelect();
  });
}

if (reasoningBtn && reasoningMenu) {
  reasoningBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (reasoningMenu.style.display === 'block') {
      reasoningMenu.style.display = 'none';
    } else {
      reasoningMenu.style.display = 'block';
    }
    if (modelMenu) modelMenu.style.display = 'none';
  });

  reasoningMenu.querySelectorAll('.reasoning-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      reasoningMenu.querySelectorAll('.reasoning-option').forEach(o => {
        o.classList.remove('selected');
      });
      opt.classList.add('selected');
      selectedReasoning = opt.dataset.value;
      reasoningMenu.style.display = 'none';
    });
  });
}

// Global click to close both menus
document.addEventListener('click', (e) => {
  if (modelMenu && !modelMenu.contains(e.target)) modelMenu.style.display = 'none';
  if (reasoningMenu && !reasoningMenu.contains(e.target)) reasoningMenu.style.display = 'none';
});

// ── In-Chat Model Download Manager ──────────────────────────────────────────
const OLLAMA_HOST = 'http://127.0.0.1:11434';

async function checkAndDownloadModel(modelName) {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return true; // If we can't connect, just return and let the backend fail
    const data = await res.json();
    const models = data.models || [];
    const hasModel = models.some(m => m.name === modelName || m.name === modelName + ':latest');

    if (!hasModel) {
      return await startChatDownload(modelName);
    }
    return true;
  } catch (err) {
    return true; // Let the backend handle errors if Ollama is down
  }
}

function startChatDownload(modelName) {
  return new Promise((resolve) => {
    // Create a chat bubble for the download
    const bubble = document.createElement('div');
    bubble.className = 'bubble assistant';
    bubble.style.width = '100%';
    bubble.style.maxWidth = '100%';
    bubble.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <svg width="20" height="20" fill="none" stroke="#a78bfa" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
        <strong style="color:#e2e8f0; font-size:14px;">Downloading model: ${modelName}</strong>
      </div>
      <div id="chatDlStatus" style="font-size:12px; color:#94a3b8; margin-bottom:8px;">Calculating size...</div>
      <div style="width:100%; height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
        <div id="chatDlBar" style="height:100%; width:0%; background:linear-gradient(90deg, #6366f1, #a78bfa); transition:width 0.2s;"></div>
      </div>
    `;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;

    if (promptEl) promptEl.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    const statusEl = bubble.querySelector('#chatDlStatus');
    const barEl = bubble.querySelector('#chatDlBar');

    fetch(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true })
    }).then(async response => {
      if (!response.body) throw new Error('Streaming not supported');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim() !== '');
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status) {
              let text = data.status;
              if (data.total) {
                const percent = Math.round((data.completed / data.total) * 100);
                barEl.style.width = `${percent}%`;
                const downloadedGB = (data.completed / 1024 / 1024 / 1024).toFixed(2);
                const totalGB = (data.total / 1024 / 1024 / 1024).toFixed(2);
                text = `${downloadedGB} GB / ${totalGB} GB (${percent}%)`;
              }
              statusEl.textContent = text;
            }
          } catch (e) { }
        }
      }
      statusEl.textContent = 'Download completed and verified!';
      barEl.style.width = '100%';
      barEl.style.background = '#34d399';
      if (promptEl) promptEl.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      resolve(true);
    }).catch(err => {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.style.color = '#f87171';
      barEl.style.background = '#f87171';
      if (promptEl) promptEl.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      resolve(false);
    });
  });
}

