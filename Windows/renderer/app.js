// app.js – UI logic for Kyba renderer
window.addEventListener('DOMContentLoaded', () => {
  const ingestBtn = document.getElementById('ingestBtn');
  const activeModelSelect = document.getElementById('activeModelSelect');
  const newChatBtn = document.getElementById('newChatBtn');

  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      window.dispatchEvent(new Event('kyba_clear_chat'));
      localStorage.setItem('kyba_clear_chat_trigger', Date.now());
      if (window.electronAPI && typeof window.electronAPI.notifyClearChat === 'function') {
        window.electronAPI.notifyClearChat();
      }
    });
  }

  // Settings DOM elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const profileSelect = document.getElementById('profileSelect');
  const newProfileBtn = document.getElementById('newProfileBtn');
  const deleteProfileBtn = document.getElementById('deleteProfileBtn');
  const profileName = document.getElementById('profileName');
  const profileBaseModel = document.getElementById('profileBaseModel');
  const tempSlider = document.getElementById('tempSlider');
  const topPSlider = document.getElementById('topPSlider');
  const tempVal = document.getElementById('tempVal');
  const topPVal = document.getElementById('topPVal');
  const modelPrompt = document.getElementById('modelPrompt');
  const saveSettings = document.getElementById('saveSettings');
  const cancelSettings = document.getElementById('cancelSettings');

  // Default Base Model Profile
  const defaultProfile = {
    id: 'default',
    name: 'Base Model (gemma4:e2b)',
    baseModel: 'gemma4:e2b',
    temperature: 0.2,
    top_p: 0.9,
    systemPrompt: ''
  };

  // State
  let customModels = [];
  let currentEditingId = 'default';

  function loadData() {
    try {
      customModels = JSON.parse(localStorage.getItem('kyba_custom_models')) || [];
      if (!Array.isArray(customModels)) customModels = [];
    } catch (e) { customModels = []; }
  }

  function getActiveModelId() {
    return localStorage.getItem('kyba_active_model_id') || 'default';
  }

  function setActiveModelId(id) {
    localStorage.setItem('kyba_active_model_id', id);
    // Triggers a custom event in window (so custom_chat.js knows, although it will read it from localStorage when sending)
    window.dispatchEvent(new Event('kyba_model_changed'));
    if (window.electronAPI && typeof window.electronAPI.notifyModelChanged === 'function') {
      window.electronAPI.notifyModelChanged();
    }
  }

  function renderActiveModelSelect() {
    if (!activeModelSelect) return;
    loadData();
    activeModelSelect.innerHTML = `<option value="default">${defaultProfile.name}</option>`;
    customModels.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      activeModelSelect.appendChild(opt);
    });
    activeModelSelect.value = getActiveModelId();
  }

  activeModelSelect && activeModelSelect.addEventListener('change', e => {
    setActiveModelId(e.target.value);
  });

  // Render on startup
  renderActiveModelSelect();

  // ── Settings modal handling ───────────────────────────────────────────────

  function populateProfileSelect() {
    profileSelect.innerHTML = `<option value="default">${defaultProfile.name}</option>`;
    customModels.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      profileSelect.appendChild(opt);
    });
    profileSelect.value = currentEditingId;
  }

  async function loadProfileToForm(id) {
    currentEditingId = id;
    if (id === 'default') {
      const stored = localStorage.getItem('kyba_model_settings');
      let defaultSets = { temperature: 0.2, top_p: 0.9, systemPrompt: '' };
      try { if (stored) defaultSets = { ...defaultSets, ...JSON.parse(stored) }; } catch (e) { }
      profileName.value = defaultProfile.name;
      profileBaseModel.value = defaultProfile.baseModel;
      tempSlider.value = defaultSets.temperature;
      topPSlider.value = defaultSets.top_p;
      modelPrompt.value = defaultSets.system_prompt || defaultSets.systemPrompt || '';
      profileName.disabled = true;
      profileBaseModel.disabled = true;
      deleteProfileBtn.style.display = 'none';
    } else {
      const p = customModels.find(m => m.id === id);
      if (p) {
        profileName.value = p.name;
        profileBaseModel.value = p.baseModel;
        tempSlider.value = p.temperature;
        topPSlider.value = p.top_p;
        modelPrompt.value = p.systemPrompt;
      }
      profileName.disabled = false;
      profileBaseModel.disabled = false;
      deleteProfileBtn.style.display = 'block';
    }
    if (tempVal) tempVal.textContent = parseFloat(tempSlider.value).toFixed(2);
    if (topPVal) topPVal.textContent = parseFloat(topPSlider.value).toFixed(2);

    // Refresh loaded docs
    if (window.electronAPI && typeof window.electronAPI.listModelDocs === 'function') {
      const docsContainer = document.getElementById('loadedDocsContainer');
      if (docsContainer) {
        docsContainer.innerHTML = '<span style="color:#64748b; font-size:12px;">Loading...</span>';
        try {
          const docs = await window.electronAPI.listModelDocs(id);
          docsContainer.innerHTML = '';
          if (docs && docs.length > 0) {
            docs.forEach(doc => {
              const ext = doc.split('.').pop().toLowerCase();
              let icon = '📄';
              if (ext === 'pdf') icon = '📕';
              else if (ext === 'txt' || ext === 'md') icon = '📝';
              else if (ext === 'csv' || ext === 'xlsx') icon = '📊';
              else if (ext === 'docx') icon = '📘';
              
              const item = document.createElement('div');
              item.style.display = 'flex';
              item.style.alignItems = 'center';
              item.style.gap = '8px';
              item.style.fontSize = '12px';
              item.style.color = '#cbd5e1';
              item.innerHTML = `<span>${icon}</span><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" title="${doc}">${doc}</span>`;
              docsContainer.appendChild(item);
            });
          } else {
            docsContainer.innerHTML = '<span style="color:#64748b; font-size:12px;">No indexed documents.</span>';
          }
        } catch (e) {
          docsContainer.innerHTML = '<span style="color:#ef4444; font-size:12px;">Error loading.</span>';
        }
      }
    }
  }

  function openSettings() {
    if (window.electronAPI && window.electronAPI.hideChatView) {
      window.electronAPI.hideChatView();
    }
    loadData();
    currentEditingId = getActiveModelId();
    populateProfileSelect();
    loadProfileToForm(currentEditingId);
    if (settingsModal) settingsModal.style.display = 'flex';
  }

  function closeSettings() {
    if (settingsModal) settingsModal.style.display = 'none';
    if (window.electronAPI && window.electronAPI.showChatView) {
      window.electronAPI.showChatView();
    }
  }

  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (cancelSettings) cancelSettings.addEventListener('click', closeSettings);

  profileSelect && profileSelect.addEventListener('change', e => {
    loadProfileToForm(e.target.value);
  });

  newProfileBtn && newProfileBtn.addEventListener('click', () => {
    const newId = 'custom_' + Date.now();
    const newProfile = {
      id: newId,
      name: 'New Model',
      baseModel: 'gemma4:e2b',
      temperature: 0.2,
      top_p: 0.9,
      systemPrompt: ''
    };
    customModels.push(newProfile);
    populateProfileSelect();
    profileSelect.value = newId;
    loadProfileToForm(newId);
  });

  deleteProfileBtn && deleteProfileBtn.addEventListener('click', () => {
    if (currentEditingId === 'default') return;
    if (confirm('Are you sure you want to delete this profile?')) {
      customModels = customModels.filter(m => m.id !== currentEditingId);
      currentEditingId = 'default';
      populateProfileSelect();
      loadProfileToForm('default');
    }
  });

  // sliders update labels
  if (tempSlider) tempSlider.addEventListener('input', () => { if (tempVal) tempVal.textContent = parseFloat(tempSlider.value).toFixed(2); });
  if (topPSlider) topPSlider.addEventListener('input', () => { if (topPVal) topPVal.textContent = parseFloat(topPSlider.value).toFixed(2); });

  if (saveSettings) saveSettings.addEventListener('click', async () => {
    // If we are editing default, we can only update global kyba_model_settings for legacy support
    // But since custom_chat reads profiles, let's just update the profile
    const settings = {
      temperature: parseFloat(tempSlider.value),
      top_p: parseFloat(topPSlider.value),
      systemPrompt: modelPrompt.value || ''
    };

    let selectedModel = 'gemma4:e2b';
    if (currentEditingId === 'default') {
      // For default profile, we save it in kyba_model_settings for legacy compatibility
      localStorage.setItem('kyba_model_settings', JSON.stringify({
        temperature: settings.temperature,
        top_p: settings.top_p,
        system_prompt: settings.systemPrompt
      }));
    } else {
      selectedModel = profileBaseModel.value.trim() || 'gemma4:e2b';
      const idx = customModels.findIndex(m => m.id === currentEditingId);
      if (idx !== -1) {
        customModels[idx].name = profileName.value.trim() || 'Unnamed';
        customModels[idx].baseModel = selectedModel;
        customModels[idx].temperature = settings.temperature;
        customModels[idx].top_p = settings.top_p;
        customModels[idx].systemPrompt = settings.systemPrompt;
      }
    }

    // Check if the selected model exists
    if (window.electronAPI && window.electronAPI.checkModel && window.electronAPI.pullModel) {
      try {
        saveSettings.disabled = true;
        saveSettings.textContent = 'Verifying...';
        const res = await window.electronAPI.checkModel(selectedModel);
        if (res && !res.installed) {
          const downloadContainer = document.getElementById('modelDownloadContainer');
          const downloadText = document.getElementById('modelDownloadText');
          const downloadPercent = document.getElementById('modelDownloadPercent');
          const downloadBar = document.getElementById('modelDownloadBar');
          const cancelSettings = document.getElementById('cancelSettings');

          downloadContainer.style.display = 'block';
          downloadText.textContent = `Downloading ${selectedModel}...`;
          downloadPercent.textContent = '0%';
          downloadBar.style.width = '0%';

          if (cancelSettings) cancelSettings.disabled = true;
          saveSettings.textContent = 'Downloading...';

          window.electronAPI.onPullProgress((event, chunk) => {
            const str = (chunk || '').toString();
            const match = str.match(/(\d+)%/);
            if (match && match[1]) {
              downloadPercent.textContent = `${match[1]}%`;
              downloadBar.style.width = `${match[1]}%`;
            }
          });

          const pullRes = await window.electronAPI.pullModel(selectedModel);
          if (!pullRes || !pullRes.ok) {
            alert(`Error downloading model: ${pullRes ? pullRes.error : 'Unknown'}`);
          }

          if (cancelSettings) cancelSettings.disabled = false;
          downloadContainer.style.display = 'none';
        }
      } catch (e) {
        console.error('Error checking/pulling model:', e);
      } finally {
        saveSettings.disabled = false;
        saveSettings.textContent = 'Save Changes';
      }
    }

    localStorage.setItem('kyba_custom_models', JSON.stringify(customModels));
    setActiveModelId(currentEditingId); // Auto-select the saved model
    renderActiveModelSelect();
    closeSettings();
  });


  // ── Ingest button: open file selector and ingest into knowledge base ─────────
  ingestBtn && ingestBtn.addEventListener('click', async () => {
    try {
      if (!window.electronAPI || typeof window.electronAPI.selectFiles !== 'function') {
        alert('Selection functionality not available');
        return;
      }
      const files = await window.electronAPI.selectFiles({});
      if (!files || !files.length) return;

      const prevText = ingestBtn.textContent;
      ingestBtn.textContent = 'Sending to index...';
      ingestBtn.disabled = true;

      const res = await window.electronAPI.ingest({ paths: files, profile_id: currentEditingId });

      ingestBtn.textContent = prevText;
      ingestBtn.disabled = false;

      if (res && res.ok) {
        ingestBtn.textContent = `✅ Indexing in background`;
        loadProfileToForm(currentEditingId);
      } else {
        const errorDetail = res && res.body && typeof res.body === 'object' && res.body.detail
          ? res.body.detail
          : (res && res.body ? JSON.stringify(res.body) : (res && res.error ? res.error : 'unknown'));
        ingestBtn.textContent = `⚠️ Error: ${errorDetail}`.substring(0, 40);
        console.error('Ingest Error:', errorDetail);
      }

      setTimeout(() => {
        if (!ingestBtn.disabled) ingestBtn.textContent = prevText;
      }, 4000);
    } catch (e) {
      if (ingestBtn) {
        ingestBtn.disabled = false;
        ingestBtn.textContent = `⚠️ Error processing`;
        setTimeout(() => { ingestBtn.textContent = 'Load Context Documents'; }, 3000);
      }
      console.error('File selection error:', e);
    }
  });

  // ── Theme toggling ─────────────────────────────────────────────────────────
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
    } else {
      document.body.classList.remove('light-mode');
      if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
    }
  }
  const savedTheme = localStorage.getItem('kyba_theme') || 'dark';
  applyTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.body.classList.contains('light-mode') ? 'light' : 'dark';
      const newTheme = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('kyba_theme', newTheme);
      applyTheme(newTheme);
    });
  }

  // ── Notify main process that UI is ready ───────────────────────────────────
  if (window.electronAPI && typeof window.electronAPI.contentReady === 'function') {
    window.electronAPI.contentReady();
  }

  // ── Hide loading overlay when backend is ready ─────────────────────────────
  if (window.electronAPI && typeof window.electronAPI.onBackendReady === 'function') {
    window.electronAPI.onBackendReady(() => {
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => { overlay.style.display = 'none'; }, 500); // match CSS transition duration
      }
    });
  }
});
