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
  const contextSlider = document.getElementById('contextSlider');
  const tempVal = document.getElementById('tempVal');
  const topPVal = document.getElementById('topPVal');
  const contextVal = document.getElementById('contextVal');
  const modelPrompt = document.getElementById('modelPrompt');
  const saveSettings = document.getElementById('saveSettings');
  const cancelSettings = document.getElementById('cancelSettings');

  // Default Base Model Profile
  const defaultProfile = {
    id: 'default',
    name: 'Gemma4:e2b',
    baseModel: 'gemma4:e2b',
    temperature: 0.2,
    top_p: 0.9,
    systemPrompt: ''
  };

  // State
  let customModels = [];
  let currentEditingId = 'default';
  
  let customAgents = [];
  let currentEditingAgentId = null;
  let activeAgentConfig = { orchestrator: 'none', subagents: [] };

  let customMcpServers = [];
  let currentEditingMcpId = null;

  function loadData() {
    try {
      customModels = JSON.parse(localStorage.getItem('kyba_custom_models')) || [];
      if (!Array.isArray(customModels)) customModels = [];
      if (window.electronAPI && window.electronAPI.saveCustomModels) window.electronAPI.saveCustomModels(customModels);
    } catch (e) { customModels = []; }
  }

  function loadAgentsData() {
    try {
      customAgents = JSON.parse(localStorage.getItem('kyba_custom_agents')) || [];
    } catch(e) { customAgents = []; }
    try {
      const stored = localStorage.getItem('kyba_agent_orchestration');
      if (stored) activeAgentConfig = JSON.parse(stored);
    } catch(e) {}
  }

  function loadMcpData() {
    try {
      customMcpServers = JSON.parse(localStorage.getItem('kyba_mcp_servers')) || [];
    } catch(e) { customMcpServers = []; }
  }

  function getActiveModelId() {
    return localStorage.getItem('kyba_active_model_id') || 'default';
  }

  function setActiveModelId(id) {
    const current = localStorage.getItem('kyba_active_model_id');
    localStorage.setItem('kyba_active_model_id', id);
    if (current !== id) {
      // Triggers a custom event in window (so custom_chat.js knows)
      window.dispatchEvent(new Event('kyba_model_changed'));
      if (window.electronAPI && typeof window.electronAPI.notifyModelChanged === 'function') {
        window.electronAPI.notifyModelChanged();
      }
    }
  }

  // ── Topbar Dropdowns (Model & Agent) ──────────────────────────────────────
  // (Moved back to custom_chat.html / custom_chat.js as requested by user)
  
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
    renderAgentsList();
  }

  function renderAgentsList() {
    loadAgentsData();
    const listContainer = document.getElementById('agentsListContainer');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (customAgents.length === 0) {
      listContainer.innerHTML = '<span style="color:#64748b; font-size:12px;">No hay agentes creados.</span>';
      return;
    }

    customAgents.forEach(agent => {
      const div = document.createElement('div');
      div.className = 'settings-block';
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      div.style.background = 'rgba(255,255,255,0.03)';
      div.style.padding = '10px 12px';
      div.style.borderRadius = '6px';
      div.style.border = '1px solid rgba(255,255,255,0.05)';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = agent.name;
      nameSpan.style.color = '#e6eef6';
      nameSpan.style.fontSize = '13px';
      nameSpan.style.flex = '1';

      const actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.gap = '8px';

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
      editBtn.title = 'Editar';
      editBtn.onclick = () => showAgentEdit(agent.id);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn';
      deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      deleteBtn.style.color = '#ef4444'; // Optional: Make the delete icon slightly reddish to differentiate
      deleteBtn.title = 'Eliminar';
      deleteBtn.onclick = (e) => {
        try {
          e.stopPropagation();
          if(confirm(window.i18n ? window.i18n.t('msg_delete_confirm') : '¿Seguro que quieres eliminar este agente?')) {
            customAgents = customAgents.filter(a => a.id !== agent.id);
            localStorage.setItem('kyba_custom_agents', JSON.stringify(customAgents));
            if(activeAgentConfig && activeAgentConfig.id === agent.id) {
              activeAgentConfig = { orchestrator: 'none', subagents: [] };
              localStorage.setItem('kyba_agent_orchestration', JSON.stringify(activeAgentConfig));
            }
            renderAgentsList();
            window.dispatchEvent(new Event('kyba_storage_changed'));
          }
        } catch (err) {
          console.error("Error in deleteBtn:", err);
          alert("Error in deleteBtn: " + err.message);
        }
      };

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(deleteBtn);

      div.appendChild(nameSpan);
      div.appendChild(actionsDiv);
      listContainer.appendChild(div);
    });
  }

  function showAgentEdit(agentId) {
    try {
      document.getElementById('agentsListView').style.display = 'none';
      document.getElementById('agentEditView').style.display = 'flex';
      
      let agent = customAgents.find(a => a.id === agentId);
      if (!agent) {
        agent = { id: agentId, name: 'Nuevo Agente', orchestrator: 'none', subagents: [] };
      }
      currentEditingAgentId = agentId;
      
      document.getElementById('agentNameInput').value = agent.name;
      renderOrchestratorUIForAgent(agent);
    } catch (err) {
      console.error("Error in showAgentEdit:", err);
      alert("Error in showAgentEdit: " + err.message);
    }
  }

  function renderSubAgentsListForAgent(agent, allProfiles, orchestratorValue) {
    const subAgentsList = document.getElementById('subAgentsList');
    if (!subAgentsList) return;
    subAgentsList.innerHTML = '';
    const availableForSubAgents = allProfiles.filter(m => m.id !== orchestratorValue);
    if (availableForSubAgents.length === 0) {
      subAgentsList.innerHTML = '<span style="color:#64748b; font-size:12px;">No hay otros perfiles disponibles.</span>';
    } else {
      availableForSubAgents.forEach(m => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '8px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = m.id;
        checkbox.checked = (agent.subagents || []).includes(m.id);
        
        checkbox.addEventListener('change', () => {
          let currentSubagents = agent.subagents || [];
          if (checkbox.checked) {
            if (!currentSubagents.includes(m.id)) currentSubagents.push(m.id);
          } else {
            currentSubagents = currentSubagents.filter(id => id !== m.id);
          }
          agent.subagents = currentSubagents;
        });

        const label = document.createElement('label');
        label.textContent = m.name;
        label.style.color = '#cbd5e1';
        label.style.fontSize = '13px';
        label.style.cursor = 'pointer';
        label.onclick = () => checkbox.click();

        div.appendChild(checkbox);
        div.appendChild(label);
        subAgentsList.appendChild(div);
      });
    }
  }

  function renderOrchestratorUIForAgent(agent) {
    const orchestratorSelect = document.getElementById('orchestratorSelect');
    if (!orchestratorSelect) return;

    let allProfiles = [defaultProfile, ...customModels];
    
    // Only rebuild options if they haven't been built yet or if we just want to be safe, 
    // but not inside onchange to prevent breaking the native select element.
    const defText = (window.i18n && window.i18n.t) ? window.i18n.t('agent_opt_none') : 'Ninguno (Agente sin orquestador)';
    orchestratorSelect.innerHTML = `<option value="none" data-i18n="agent_opt_none">${defText}</option>`;
    allProfiles.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      orchestratorSelect.appendChild(opt);
    });
    orchestratorSelect.value = agent.orchestrator || 'none';

    renderSubAgentsListForAgent(agent, allProfiles, orchestratorSelect.value);

    orchestratorSelect.onchange = (e) => {
      agent.orchestrator = e.target.value;
      agent.subagents = (agent.subagents || []).filter(id => id !== agent.orchestrator);
      renderSubAgentsListForAgent(agent, allProfiles, agent.orchestrator);
    };
  }

  // Bind new UI buttons
  const addAgentBtn = document.getElementById('addAgentBtn');
  if (addAgentBtn) {
    addAgentBtn.addEventListener('click', () => {
      const newId = 'agent_' + Date.now();
      showAgentEdit(newId);
    });
  }

  const backToAgentsBtn = document.getElementById('backToAgentsBtn');
  if (backToAgentsBtn) {
    backToAgentsBtn.addEventListener('click', () => {
      document.getElementById('agentsListView').style.display = 'flex';
      document.getElementById('agentEditView').style.display = 'none';
      renderAgentsList();
    });
  }

  const saveAgentBtn = document.getElementById('saveAgentBtn');
  if (saveAgentBtn) {
    saveAgentBtn.addEventListener('click', () => {
      try {
        let agent = customAgents.find(a => a.id === currentEditingAgentId);
        let isNew = false;
        if (!agent) {
          agent = { id: currentEditingAgentId };
          isNew = true;
        }
        agent.name = document.getElementById('agentNameInput').value || 'Agente Sin Nombre';
        agent.orchestrator = document.getElementById('orchestratorSelect').value;
        
        const subagentCheckboxes = document.querySelectorAll('#subAgentsList input[type="checkbox"]:checked');
        agent.subagents = Array.from(subagentCheckboxes).map(cb => cb.value);

        if (isNew) customAgents.push(agent);
        localStorage.setItem('kyba_custom_agents', JSON.stringify(customAgents));

        if (activeAgentConfig && activeAgentConfig.id === agent.id) {
           activeAgentConfig = { ...agent };
           localStorage.setItem('kyba_agent_orchestration', JSON.stringify(activeAgentConfig));
        } else if (isNew && customAgents.length === 1) {
           // Auto-activate if it's the first agent
           activeAgentConfig = { ...agent };
           localStorage.setItem('kyba_agent_orchestration', JSON.stringify(activeAgentConfig));
        }

        document.getElementById('agentsListView').style.display = 'flex';
        document.getElementById('agentEditView').style.display = 'none';
        renderAgentsList();
        window.dispatchEvent(new Event('kyba_storage_changed'));
        
        // Sync MCP servers to backend when saving settings
        syncMcpToBackend();
      } catch (err) {
        console.error("Error in saveAgentBtn:", err);
        alert("Error in saveAgentBtn: " + err.message);
      }
    });
  }

  // --- MCP UI Logic ---
  function renderMcpList() {
    loadMcpData();
    const listContainer = document.getElementById('mcpListContainer');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (customMcpServers.length === 0) {
      listContainer.innerHTML = `<span style="color:#64748b; font-size:12px;" data-i18n="mcp_empty">${window.i18n ? window.i18n.t('mcp_empty') : 'No hay servidores MCP configurados.'}</span>`;
      return;
    }

    customMcpServers.forEach(mcp => {
      const div = document.createElement('div');
      div.className = 'settings-block';
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      div.style.background = 'rgba(255,255,255,0.03)';
      div.style.padding = '10px 12px';
      div.style.borderRadius = '6px';
      div.style.border = '1px solid rgba(255,255,255,0.05)';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = mcp.name;
      nameSpan.style.color = '#e6eef6';
      nameSpan.style.fontSize = '13px';
      nameSpan.style.flex = '1';

      const actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.gap = '8px';
      actionsDiv.style.alignItems = 'center';

      // Toggle Switch
      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'mcp-toggle-switch';
      toggleLabel.style.position = 'relative';
      toggleLabel.style.display = 'inline-block';
      toggleLabel.style.width = '34px';
      toggleLabel.style.height = '20px';
      toggleLabel.style.marginRight = '8px';

      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = mcp.enabled || false;
      toggleInput.style.opacity = '0';
      toggleInput.style.width = '0';
      toggleInput.style.height = '0';

      const toggleSlider = document.createElement('span');
      toggleSlider.className = 'mcp-slider round';
      toggleSlider.style.position = 'absolute';
      toggleSlider.style.cursor = 'pointer';
      toggleSlider.style.top = '0';
      toggleSlider.style.left = '0';
      toggleSlider.style.right = '0';
      toggleSlider.style.bottom = '0';
      toggleSlider.style.backgroundColor = mcp.enabled ? '#10b981' : '#475569';
      toggleSlider.style.transition = '.4s';
      toggleSlider.style.borderRadius = '34px';

      const toggleKnob = document.createElement('span');
      toggleKnob.style.position = 'absolute';
      toggleKnob.style.content = '""';
      toggleKnob.style.height = '14px';
      toggleKnob.style.width = '14px';
      toggleKnob.style.left = mcp.enabled ? '17px' : '3px';
      toggleKnob.style.bottom = '3px';
      toggleKnob.style.backgroundColor = 'white';
      toggleKnob.style.transition = '.4s';
      toggleKnob.style.borderRadius = '50%';

      toggleSlider.appendChild(toggleKnob);
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleSlider);

      toggleInput.addEventListener('change', () => {
        mcp.enabled = toggleInput.checked;
        toggleSlider.style.backgroundColor = mcp.enabled ? '#10b981' : '#475569';
        toggleKnob.style.left = mcp.enabled ? '17px' : '3px';
        localStorage.setItem('kyba_mcp_servers', JSON.stringify(customMcpServers));
        syncMcpToBackend();
      });

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
      editBtn.title = 'Editar';
      editBtn.onclick = () => showMcpEdit(mcp.id);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn';
      deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      deleteBtn.style.color = '#ef4444';
      deleteBtn.title = 'Eliminar';
      deleteBtn.onclick = (e) => {
        try {
          e.stopPropagation();
          if(confirm('¿Seguro que quieres eliminar este servidor MCP?')) {
            customMcpServers = customMcpServers.filter(m => m.id !== mcp.id);
            localStorage.setItem('kyba_mcp_servers', JSON.stringify(customMcpServers));
            renderMcpList();
          }
        } catch (err) {
          console.error("Error in deleteMcpBtn:", err);
        }
      };

      actionsDiv.appendChild(toggleLabel);
      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(deleteBtn);
      div.appendChild(nameSpan);
      div.appendChild(actionsDiv);
      listContainer.appendChild(div);
    });
  }

  function showMcpEdit(mcpId) {
    document.getElementById('mcpListView').style.display = 'none';
    document.getElementById('mcpEditView').style.display = 'flex';
    
    let mcp = customMcpServers.find(m => m.id === mcpId);
    if (!mcp) {
      mcp = { id: mcpId, name: '', command: '', args: '' };
    }
    currentEditingMcpId = mcpId;
    
    document.getElementById('mcpNameInput').value = mcp.name;
    document.getElementById('mcpCommandInput').value = mcp.command;
    document.getElementById('mcpArgsInput').value = mcp.args;
    document.getElementById('mcpEnvInput').value = mcp.env || '';
  }

  const addMcpBtn = document.getElementById('addMcpBtn');
  if (addMcpBtn) {
    addMcpBtn.addEventListener('click', () => {
      showMcpEdit('mcp_' + Date.now());
    });
  }

  const backToMcpBtn = document.getElementById('backToMcpBtn');
  if (backToMcpBtn) {
    backToMcpBtn.addEventListener('click', () => {
      document.getElementById('mcpListView').style.display = 'flex';
      document.getElementById('mcpEditView').style.display = 'none';
      renderMcpList();
    });
  }

  const saveMcpBtn = document.getElementById('saveMcpBtn');
  if (saveMcpBtn) {
    saveMcpBtn.addEventListener('click', () => {
      let mcp = customMcpServers.find(m => m.id === currentEditingMcpId);
      let isNew = false;
      if (!mcp) {
        mcp = { id: currentEditingMcpId, enabled: false };
        isNew = true;
      }
      mcp.name = document.getElementById('mcpNameInput').value || 'MCP Sin Nombre';
      mcp.command = document.getElementById('mcpCommandInput').value || '';
      mcp.args = document.getElementById('mcpArgsInput').value || '';
      mcp.env = document.getElementById('mcpEnvInput').value || '';

      if (isNew) customMcpServers.push(mcp);
      localStorage.setItem('kyba_mcp_servers', JSON.stringify(customMcpServers));

      document.getElementById('mcpListView').style.display = 'flex';
      document.getElementById('mcpEditView').style.display = 'none';
      renderMcpList();
    });
  }

  function syncMcpToBackend() {
    loadMcpData();
    const bPort = window.electronAPI && window.electronAPI.getBackendPort ? window.electronAPI.getBackendPort() : 8000;
    fetch(`http://127.0.0.1:${bPort}/mcp/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servers: customMcpServers })
    }).catch(e => console.error("Failed to sync MCP servers to backend", e));
  }

  async function populateOllamaModels(retries = 3) {
    try {
      const bPort = window.electronAPI && window.electronAPI.getBackendPort ? window.electronAPI.getBackendPort() : 8000;
      const resp = await fetch(`http://127.0.0.1:${bPort}/models`);
      const data = await resp.json();
      const ollamaModels = data.models || [];

      if (ollamaModels.length === 0 && retries > 0) {
        setTimeout(() => populateOllamaModels(retries - 1), 3000);
        return;
      }

      // 1) Populate the datalist for the Base Model input
      const datalist = document.getElementById('profileBaseModelList');
      if (datalist) {
        datalist.innerHTML = '';
        ollamaModels.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          datalist.appendChild(opt);
        });
      }

      // 2) Auto-create profiles for Ollama models that don't have one yet
      let customModelsLocal = [];
      try { customModelsLocal = JSON.parse(localStorage.getItem('kyba_custom_models') || '[]'); } catch(e) {}

      let changed = false;
      
      // Remove any profiles if their base model is no longer installed in Ollama
      const originalLen = customModelsLocal.length;
      customModelsLocal = customModelsLocal.filter(p => {
        return ollamaModels.some(m => m.name === p.baseModel);
      });
      if (customModelsLocal.length !== originalLen) changed = true;

      ollamaModels.forEach(m => {
        const alreadyExists = customModelsLocal.some(p => p.baseModel === m.name);
        if (!alreadyExists) {
          const friendlyName = m.name.split(':')[0].charAt(0).toUpperCase() + m.name.split(':')[0].slice(1);
          const tag = m.name.includes(':') ? m.name.split(':')[1] : 'latest';
          customModelsLocal.push({
            id: 'ollama-' + m.name.replace(/[^a-z0-9]/gi, '-') + '-' + Date.now(),
            name: `${friendlyName} (${m.name})`,
            baseModel: m.name,
            temperature: 0.2,
            top_p: 0.9,
            systemPrompt: ''
          });
          changed = true;
        }
      });

      if (changed) {
        localStorage.setItem('kyba_custom_models', JSON.stringify(customModelsLocal));
        if (window.electronAPI && window.electronAPI.saveCustomModels) window.electronAPI.saveCustomModels(customModelsLocal);
        loadData();
        populateProfileSelect();
        window.dispatchEvent(new Event('kyba_storage_changed'));
      }
    } catch (e) {
      console.log('Could not fetch Ollama models', e);
      if (retries > 0) {
        setTimeout(() => populateOllamaModels(retries - 1), 3000);
      }
    }
  }

  const syncModelsBtn = document.getElementById('syncModelsBtn');
  if (syncModelsBtn) {
    syncModelsBtn.addEventListener('click', async () => {
      const origText = syncModelsBtn.textContent;
      syncModelsBtn.textContent = 'Syncing...';
      syncModelsBtn.disabled = true;
      await populateOllamaModels(0); // 0 retries
      setTimeout(() => {
        syncModelsBtn.textContent = origText;
        syncModelsBtn.disabled = false;
      }, 500);
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (settingsModal) {
        settingsModal.style.display = 'flex';
        loadData();
        populateProfileSelect();
        renderMcpList();
        populateOllamaModels();
      }
    });
  }

  // Auto-discover Ollama models on startup (with delay to let Ollama boot)
  setTimeout(() => populateOllamaModels(5), 5000);

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
      contextSlider.value = defaultSets.num_ctx || 8192;
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
        contextSlider.value = p.num_ctx || 8192;
        modelPrompt.value = p.systemPrompt;
      }
      profileName.disabled = false;
      profileBaseModel.disabled = false;
      deleteProfileBtn.style.display = 'block';
    }
    if (tempVal) tempVal.textContent = parseFloat(tempSlider.value).toFixed(2);
    if (topPVal) topPVal.textContent = parseFloat(topPSlider.value).toFixed(2);
    if (contextVal) contextVal.textContent = parseInt(contextSlider.value);

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
                
                const iconSpan = document.createElement('span');
                iconSpan.innerHTML = icon;
                
                const nameSpan = document.createElement('span');
                nameSpan.style.overflow = 'hidden';
                nameSpan.style.textOverflow = 'ellipsis';
                nameSpan.style.whiteSpace = 'nowrap';
                nameSpan.style.flex = '1';
                nameSpan.title = doc;
                nameSpan.textContent = doc;
                
                const delBtn = document.createElement('button');
                delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';
                delBtn.style.background = 'rgba(239,68,68,0.1)';
                delBtn.style.border = '1px solid rgba(239,68,68,0.2)';
                delBtn.style.color = '#ef4444';
                delBtn.style.cursor = 'pointer';
                delBtn.style.borderRadius = '4px';
                delBtn.style.display = 'flex';
                delBtn.style.alignItems = 'center';
                delBtn.style.justifyContent = 'center';
                delBtn.style.padding = '4px';
                delBtn.title = window.i18n ? window.i18n.t('delete') : 'Delete';
                delBtn.onclick = async () => {
                    if (delBtn.disabled) return;
                    delBtn.disabled = true;
                    delBtn.style.opacity = '0.5';
                    try {
                        const res = await window.electronAPI.deleteModelDoc({ profile_id: id, filename: doc });
                        if (res && res.ok) {
                            loadProfileToForm(id);
                        } else {
                            console.error('Delete failed:', res ? res.error : 'unknown');
                            delBtn.disabled = false;
                            delBtn.style.opacity = '1';
                        }
                    } catch (err) {
                        console.error('Failed to delete doc:', err);
                        delBtn.disabled = false;
                        delBtn.style.opacity = '1';
                    }
                };

                item.appendChild(iconSpan);
                item.appendChild(nameSpan);
                item.appendChild(delBtn);
                docsContainer.appendChild(item);
            });
          } else {
            docsContainer.innerHTML = `<span style="color:#64748b; font-size:12px;">${window.i18n ? window.i18n.t('msg_no_indexed') : 'No indexed documents.'}</span>`;
          }
        } catch (e) {
          docsContainer.innerHTML = `<span style="color:#ef4444; font-size:12px;">${window.i18n ? window.i18n.t('msg_error_loading') : 'Error loading.'}</span>`;
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

  window.openReportModal = function() {
    openSettings();
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    const reportBtn = Array.from(tabBtns).find(b => b.getAttribute('data-target') === 'tab-report');
    if (reportBtn) reportBtn.classList.add('active');
    
    const reportTab = document.getElementById('tab-report');
    if (reportTab) reportTab.classList.add('active');
  };


  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (cancelSettings) cancelSettings.addEventListener('click', closeSettings);
  const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
  if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', closeSettings);

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
    if (confirm(window.i18n ? window.i18n.t('msg_delete_confirm') : 'Are you sure you want to delete this profile?')) {
      customModels = customModels.filter(m => m.id !== currentEditingId);
      currentEditingId = 'default';
      populateProfileSelect();
      loadProfileToForm('default');
      localStorage.setItem('kyba_custom_models', JSON.stringify(customModels));
      if (window.electronAPI && window.electronAPI.saveCustomModels) window.electronAPI.saveCustomModels(customModels);
      window.dispatchEvent(new Event('kyba_storage_changed'));
      closeSettings();
    }
  });

  // sliders update labels
  if (tempSlider) tempSlider.addEventListener('input', () => { if (tempVal) tempVal.textContent = parseFloat(tempSlider.value).toFixed(2); });
  if (topPSlider) topPSlider.addEventListener('input', () => { if (topPVal) topPVal.textContent = parseFloat(topPSlider.value).toFixed(2); });
  if (contextSlider) contextSlider.addEventListener('input', () => { if (contextVal) contextVal.textContent = parseInt(contextSlider.value); });

  if (saveSettings) saveSettings.addEventListener('click', async () => {
    // If we are editing default, we can only update global kyba_model_settings for legacy support
    // But since custom_chat reads profiles, let's just update the profile
    const settings = {
      temperature: parseFloat(tempSlider.value),
      top_p: parseFloat(topPSlider.value),
      num_ctx: parseInt(contextSlider.value),
      systemPrompt: modelPrompt.value || ''
    };

    let selectedModel = 'gemma4:e2b';
    if (currentEditingId === 'default') {
      // For default profile, we save it in kyba_model_settings for legacy compatibility
      localStorage.setItem('kyba_model_settings', JSON.stringify({
        temperature: settings.temperature,
        top_p: settings.top_p,
        num_ctx: settings.num_ctx,
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
        customModels[idx].num_ctx = settings.num_ctx;
        customModels[idx].systemPrompt = settings.systemPrompt;
      }
    }

    // Check if the selected model exists
    if (window.electronAPI && window.electronAPI.checkModel && window.electronAPI.pullModel) {
      try {
        saveSettings.disabled = true;
        saveSettings.textContent = window.i18n ? window.i18n.t('msg_verifying') : 'Verifying...';
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
          saveSettings.textContent = window.i18n ? window.i18n.t('msg_downloading') : 'Downloading...';

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
        saveSettings.textContent = window.i18n ? window.i18n.t('msg_save_changes') : 'Save Changes';
      }
    }

    localStorage.setItem('kyba_custom_models', JSON.stringify(customModels));
    if (window.electronAPI && window.electronAPI.saveCustomModels) window.electronAPI.saveCustomModels(customModels);
    setActiveModelId(currentEditingId); // Auto-select the saved model
    window.dispatchEvent(new Event('kyba_storage_changed'));
    // Removed closeSettings() so the modal stays open after saving
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
        ingestBtn.textContent = window.i18n ? window.i18n.t('msg_indexing') : `✅ Indexing in background`;
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
        ingestBtn.textContent = window.i18n ? window.i18n.t('msg_error_processing') : `⚠️ Error processing`;
        setTimeout(() => { ingestBtn.textContent = window.i18n ? window.i18n.t('btn_load_context') : 'Load Context Documents'; }, 3000);
      }
      console.error('File selection error:', e);
    }
  });

  // ── Theme toggling ─────────────────────────────────────────────────────────
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  function applyTheme(theme) {
    const sunSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const moonSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      if (themeToggleBtn) themeToggleBtn.innerHTML = moonSVG;
    } else {
      document.body.classList.remove('light-mode');
      if (themeToggleBtn) themeToggleBtn.innerHTML = sunSVG;
    }
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: theme }));
  }
  const savedTheme = localStorage.getItem('kyba_theme') || 'dark';
  applyTheme(savedTheme);

  // Language Custom Dropdown Logic (Native Menu)
  const langBtn = document.getElementById('langBtn');
  const langBtnText = document.getElementById('langBtnText');
  const langSelect = document.getElementById('lang-select');
  
  if (langBtn && langSelect) {
    langBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentVal = langSelect.value;
      const templateOpts = [
        { id: 'en', name: 'EN', radio: true, checked: currentVal === 'en' },
        { id: 'es', name: 'ES', radio: true, checked: currentVal === 'es' }
      ];
      
      if (window.electronAPI && typeof window.electronAPI.showNativeMenu === 'function') {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickedId = await window.electronAPI.showNativeMenu({
          template: templateOpts,
          x: Math.round(rect.left),
          y: Math.round(rect.bottom)
        });
        if (clickedId) {
          langSelect.value = clickedId;
          langSelect.dispatchEvent(new Event('change'));
          langBtnText.textContent = clickedId.toUpperCase();
        }
      }
    });

    const initLangDropdown = () => {
      if (langSelect && langBtnText) {
        langBtnText.textContent = langSelect.value.toUpperCase();
      }
    };
    
    // Initial sync
    setTimeout(initLangDropdown, 50);
    window.addEventListener('appLangChanged', initLangDropdown);
  }

  // Settings Modal Tabs Logic
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      if (targetId) {
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.classList.add('active');
      }
    });
  });

  // Revoke Auto Approve Logic
  const revokeBtn = document.getElementById('revokeAutoApproveBtn');
  if (revokeBtn) {
    revokeBtn.addEventListener('click', () => {
      localStorage.removeItem('kyba_auto_approve_tools');
      const originalText = revokeBtn.textContent;
      revokeBtn.textContent = "¡Aprobación Revocada!";
      revokeBtn.style.background = "rgba(16, 185, 129, 0.2)";
      revokeBtn.style.color = "#10b981";
      revokeBtn.style.borderColor = "rgba(16, 185, 129, 0.5)";
      
      setTimeout(() => {
        revokeBtn.textContent = originalText;
        revokeBtn.style.background = "";
        revokeBtn.style.color = "";
        revokeBtn.style.borderColor = "";
      }, 3000);
    });
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.body.classList.contains('light-mode') ? 'light' : 'dark';
      const newTheme = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('kyba_theme', newTheme);
      applyTheme(newTheme);
    });
  }

  // ── Network Toggle Logic ───────────────────────────────────────────────────
  const networkToggle = document.getElementById('networkToggle');
  const networkSlider = document.getElementById('networkSlider');
  const networkKnob = document.getElementById('networkKnob');

  function updateKlCodeBlock(exposed) {
    if (window.electronAPI) {
      const portSpan = document.getElementById('kl_api_base_port');
      const portSpan2 = document.getElementById('kl_api_base_port2');
      if (typeof window.electronAPI.getBackendPort === 'function') {
        const port = window.electronAPI.getBackendPort();
        if (portSpan) portSpan.textContent = port;
        if (portSpan2) portSpan2.textContent = port;
      }
      if (typeof window.electronAPI.getLocalIp === 'function') {
        window.electronAPI.getLocalIp().then(ip => {
          const ipSpan = document.getElementById('kl_api_base_ip');
          const ipSpan2 = document.getElementById('kl_api_base_ip2');
          const displayIp = exposed ? ip : '127.0.0.1';
          if (ipSpan) ipSpan.textContent = displayIp;
          if (ipSpan2) ipSpan2.textContent = displayIp;
        });
      }
    }
  }

  if (networkToggle && networkSlider && networkKnob && window.electronAPI && typeof window.electronAPI.getNetworkExposed === 'function') {
    window.electronAPI.getNetworkExposed().then(exposed => {
      networkToggle.checked = exposed;
      networkSlider.style.backgroundColor = exposed ? '#10b981' : '#475569';
      networkKnob.style.left = exposed ? '17px' : '3px';
      updateKlCodeBlock(exposed);
    });

    networkToggle.addEventListener('change', () => {
      const exposed = networkToggle.checked;
      networkSlider.style.backgroundColor = exposed ? '#10b981' : '#475569';
      networkKnob.style.left = exposed ? '17px' : '3px';
      if (typeof window.electronAPI.setNetworkExposed === 'function') {
        window.electronAPI.setNetworkExposed(exposed);
      }
      updateKlCodeBlock(exposed);
    });
  }

  // 🔹 Server Mode Toggle Logic 🔹
  const serverModeToggle = document.getElementById('serverModeToggle');
  const serverModeSlider = document.getElementById('serverModeSlider');
  const serverModeKnob = document.getElementById('serverModeKnob');
  if (serverModeToggle && serverModeSlider && serverModeKnob && window.electronAPI && typeof window.electronAPI.getServerMode === 'function') {
    window.electronAPI.getServerMode().then(enabled => {
      serverModeToggle.checked = enabled;
      serverModeSlider.style.backgroundColor = enabled ? '#10b981' : '#475569';
      serverModeKnob.style.left = enabled ? '17px' : '3px';
    });

    serverModeToggle.addEventListener('change', () => {
      const enabled = serverModeToggle.checked;
      serverModeSlider.style.backgroundColor = enabled ? '#10b981' : '#475569';
      serverModeKnob.style.left = enabled ? '17px' : '3px';
      if (typeof window.electronAPI.setServerMode === 'function') {
        window.electronAPI.setServerMode(enabled);
      }
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
      
      // Perform initial MCP sync once backend is ready
      syncMcpToBackend();
    });

  // Hub Logic
  const tabHubBtn = document.querySelector('[data-target="tab-hub"]');
  const hubModelsList = document.getElementById('hubModelsList');
  const hubLoading = document.getElementById('hubLoading');
  const hubError = document.getElementById('hubError');
  let hubLoaded = false;
  
  if (tabHubBtn) {
    const loadHubModels = async () => {
      if (hubLoaded || !window.electronAPI.fetchOllamaHub) return;
      hubLoading.style.display = 'block';
      hubError.style.display = 'none';
      hubModelsList.innerHTML = '';
      
      const res = await window.electronAPI.fetchOllamaHub();
      hubLoading.style.display = 'none';
      if (!res.ok) {
        hubError.style.display = 'block';
        console.error('Hub error:', res.error);
        return;
      }
      hubLoaded = true;
      
            
      res.models.forEach(async model => {
        const div = document.createElement('div');
        div.className = 'hub-card';
        div.style.cssText = 'background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:8px; position:relative;';
        
        div.setAttribute('data-name', (model.name || '').toLowerCase());
        div.setAttribute('data-caps', (model.capabilities || []).join(',').toLowerCase());
        
        let defVar = 'latest';
        if (model.variants && model.variants.length > 0) {
           defVar = model.variants[0];
        }
        
        let selectHtml = '';
        if (model.variants.length > 0) {
           selectHtml = `<div style="display:flex; align-items:center; gap:6px;">
             <span style="font-size:12px; color:#94a3b8;" data-i18n="report_hub_variants">${window.i18n ? window.i18n.t('report_hub_variants') || 'Variantes: ' : 'Variantes: '}</span>
             <select class="hub-variant-sel" style="background:#071022; color:#cbd5e1; border:1px solid rgba(255,255,255,0.04); padding:4px; border-radius:4px; font-size:12px; outline:none;">
               ${model.variants.map(v => `<option value="${v}">${v}</option>`).join('')}
             </select>
           </div>`;
        }
        let capsHtml = '';
        if (model.capabilities && model.capabilities.length > 0) {
            capsHtml = `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">
                ${model.capabilities.map(c => `<span style="background:rgba(99,102,241,0.15); color:#818cf8; padding:2px 6px; border-radius:4px; font-size:10px; text-transform:uppercase; font-weight:600; letter-spacing:0.05em;">${c}</span>`).join('')}
            </div>`;
        }
        
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div class="hub-model-title" style="color:#e6eef6; font-size:16px; font-weight:600;">${model.name}</div>
              <div class="hub-model-desc" style="color:#94a3b8; font-size:12px; margin-top:4px;">${model.description}</div>
              ${capsHtml}
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0; margin-left:12px;">
                <button class="hub-dl-btn" style="background:rgba(255,255,255,0.05); color:#cbd5e1; border:1px solid rgba(255,255,255,0.06); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:6px; width:100%; justify-content:center;">
                  <span data-i18n="report_dl">${window.i18n ? window.i18n.t('report_dl') || 'Descargar' : 'Descargar'}</span>
                </button>
                <button class="hub-rm-btn" title="Eliminar modelo" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; display:none; align-items:center; gap:6px; width:100%; justify-content:center; transition: all 0.2s;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
                <div class="hub-installed-msg" style="color:#34d399; font-size:10px; margin-top:4px; display:none;" data-i18n="report_hub_installed">${window.i18n ? window.i18n.t('report_hub_installed') || 'Ya dispones de esta variante' : 'Ya dispones de esta variante'}</div>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:4px;">
            ${selectHtml}
          </div>
          <div class="hub-prog" style="color:#8b5cf6; font-size:11px; margin-top:8px; font-family:monospace; display:none; max-width: 100%; word-break: break-all; white-space: pre-wrap;"></div>
        `;
        
        const btn = div.querySelector('.hub-dl-btn');
        const rmBtn = div.querySelector('.hub-rm-btn');
        const prog = div.querySelector('.hub-prog');
        const sel = div.querySelector('.hub-variant-sel');
        const installedMsg = div.querySelector('.hub-installed-msg');
        
        const checkInstall = async () => {
           let tag = sel ? sel.value : defVar;
           let fullModel = tag !== 'latest' && tag !== model.name ? `${model.name}:${tag}` : model.name;
           const res = await window.electronAPI.checkModel(fullModel);
           if (res && res.installed) {
               btn.style.display = 'none';
               rmBtn.style.display = 'flex';
               installedMsg.style.display = 'block';
           } else {
               btn.style.display = 'flex';
               rmBtn.style.display = 'none';
               installedMsg.style.display = 'none';
           }
        };
        
        if (sel) {
            sel.addEventListener('change', checkInstall);
        }
        await checkInstall();
        
        rmBtn.addEventListener('click', async () => {
           let tag = sel ? sel.value : defVar;
           let fullModel = tag !== 'latest' && tag !== model.name ? `${model.name}:${tag}` : model.name;
           
           if (rmBtn.disabled) return;
           rmBtn.disabled = true;
           rmBtn.style.opacity = '0.5';
           prog.style.display = 'block';
           prog.textContent = window.i18n ? window.i18n.t('hub_rm_progress') : 'Eliminando...';
           
           if (window.electronAPI && typeof window.electronAPI.removeModel === 'function') {
               const res = await window.electronAPI.removeModel(fullModel);
               rmBtn.disabled = false;
               rmBtn.style.opacity = '1';
               if (res && res.ok) {
                   prog.style.color = '#34d399';
                   prog.textContent = window.i18n ? window.i18n.t('hub_rm_success') : 'Modelo eliminado.';
                   setTimeout(() => { prog.style.display = 'none'; checkInstall(); }, 2000);
                   window.dispatchEvent(new Event('kyba_storage_changed'));
               } else {
                   prog.style.color = '#ef4444';
                   prog.textContent = (window.i18n ? window.i18n.t('hub_rm_err') : 'Error al eliminar: ') + (res.error || '');
                   setTimeout(() => { prog.style.display = 'none'; }, 2000);
               }
           }
        });
        
        btn.addEventListener('click', () => {
           let tag = sel ? sel.value : defVar;
           let fullModel = tag !== 'latest' && tag !== model.name ? `${model.name}:${tag}` : model.name;
           
           if (btn.disabled) return;
           btn.disabled = true;
           btn.style.opacity = '0.5';
           prog.style.display = 'block';
           prog.textContent = window.i18n ? window.i18n.t('hub_dl_progress') : 'Iniciando descarga...';
           
           window.electronAPI.onPullProgress((event, text) => {
               let cleaned = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
               // Split by 100% to create line breaks
               cleaned = cleaned.replace(/(100%)/g, '$1<br>');
               prog.innerHTML = cleaned;
           });
           
           window.electronAPI.pullModel(fullModel).then(async res => {
               if (res.ok) {
                   prog.style.color = '#8b5cf6';
                   prog.innerHTML = window.i18n ? window.i18n.t('hub_dl_success') : 'Descarga completada.';
                   await checkInstall();
               } else {
                   prog.style.color = '#ef4444';
                   prog.textContent = (window.i18n ? window.i18n.t('hub_dl_err') : 'Error: ') + res.error;
               }
               btn.disabled = false;
               btn.style.opacity = '1';
               setTimeout(() => { window.electronAPI.onPullProgress(() => {}); }, 1000);
           });
        });
        
        hubModelsList.appendChild(div);
      });
      // Trigger translations for newly added dynamic content
      if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
         window.i18n.applyTranslations();
      }
    };
    
    tabHubBtn.addEventListener('click', loadHubModels);
    
    // Hub Search and Filters
    const hubSearchInput = document.getElementById('hubSearchInput');
    const hubFilterBtns = document.querySelectorAll('.hub-filter-btn');
    let currentHubFilters = new Set();

    const filterHubModels = () => {
        if (!hubSearchInput) return;
        const q = hubSearchInput.value.toLowerCase();
        const cards = hubModelsList.querySelectorAll('.hub-card');
        cards.forEach(card => {
            const name = card.getAttribute('data-name') || '';
            const caps = card.getAttribute('data-caps') || '';
            const matchSearch = name.includes(q);
            
            let matchFilter = true;
            if (currentHubFilters.size > 0) {
                for (let filter of currentHubFilters) {
                    if (!caps.includes(filter)) {
                        matchFilter = false;
                        break;
                    }
                }
            }
            card.style.display = (matchSearch && matchFilter) ? 'flex' : 'none';
        });
    };

    if (hubSearchInput) {
        hubSearchInput.addEventListener('input', filterHubModels);
    }

    hubFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            if (filter === 'all') {
                currentHubFilters.clear();
                hubFilterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            } else {
                const allBtn = Array.from(hubFilterBtns).find(b => b.getAttribute('data-filter') === 'all');
                if (allBtn) allBtn.classList.remove('active');
                
                if (currentHubFilters.has(filter)) {
                    currentHubFilters.delete(filter);
                    btn.classList.remove('active');
                    if (currentHubFilters.size === 0 && allBtn) {
                        allBtn.classList.add('active');
                    }
                } else {
                    currentHubFilters.add(filter);
                    btn.classList.add('active');
                }
            }
            filterHubModels();
        });
    });

    // Preload hub models in the background to avoid freezing the UI on first click
    setTimeout(() => {
        if (!hubLoaded) loadHubModels().catch(console.error);
    }, 2000);
  }

  // App Report Logic
  const appReportForm = document.getElementById('appReportForm');
  const appAttachment = document.getElementById('appReportAttachment');
  const appAttachmentName = document.getElementById('appReportAttachmentName');
  const appAttachmentLbl = document.querySelector('label[for="appReportAttachment"]');
  if (appAttachmentLbl && appAttachment) {
      appAttachmentLbl.addEventListener('click', (e) => {
          e.preventDefault();
          appAttachment.click();
      });
  }
  if (appAttachment && appAttachmentName) {
      appAttachment.addEventListener('change', function() {
          if (this.files && this.files.length > 0) {
              appAttachmentName.textContent = this.files[0].name;
          } else {
              appAttachmentName.textContent = 'No file chosen';
          }
      });
  }
  
  if (appReportForm) {
      appReportForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const title = document.getElementById('appReportTitle').value;
          const email = document.getElementById('appReportEmail').value;
          const desc = document.getElementById('appReportDesc').value;
          const payload = { _subject: title, email: email, message: desc, _captcha: false };
          
          const submitPayload = (payload) => {
             const port = window.RAG_PORT || 8000;
             fetch("http://127.0.0.1:" + port + "/report", {
                 method: "POST",
                 headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                 body: JSON.stringify(payload)
             }).catch(err => console.error("Report sending failed", err));
          };
          
          if (appAttachment && appAttachment.files && appAttachment.files.length > 0) {
              const file = appAttachment.files[0];
              const reader = new FileReader();
              reader.onload = (ev) => {
                  payload.attachment_name = file.name;
                  payload.attachment_b64 = ev.target.result.split(',')[1];
                  submitPayload(payload);
              };
              reader.readAsDataURL(file);
          } else {
              submitPayload(payload);
          }
          
          alert("Thank you for reporting the issue. Our team will review it shortly.");
          appReportForm.reset();
          if (appAttachmentName) appAttachmentName.textContent = 'No file chosen';
      });
  }
  }
});
// ── Model & Agent Mode Toggle (Top Bar via Native Menu) ──────────────────────
const topModelBtn = document.getElementById('modelBtn');
const topModelBtnText = document.getElementById('modelBtnText');
const topAgentBtn = document.getElementById('agentBtn');
const topAgentModeVal = document.getElementById('agentModeVal');

function updateTopModelText() {
  if (!topModelBtnText) return;
  const activeId = localStorage.getItem('kyba_active_model_id') || 'default';
  
  let customModels = [];
  try { customModels = JSON.parse(localStorage.getItem('kyba_custom_models') || '[]'); } catch (e) {}
  let customAgents = [];
  try { customAgents = JSON.parse(localStorage.getItem('kyba_custom_agents') || '[]'); } catch (e) {}
  
  if (activeId === 'default') {
    topModelBtnText.textContent = 'Gemma4:e2b';
  } else {
    const foundModel = customModels.find(m => m.id === activeId);
    if (foundModel) {
      topModelBtnText.textContent = foundModel.name;
    } else {
      const foundAgent = customAgents.find(a => a.id === activeId);
      if (foundAgent) {
        topModelBtnText.textContent = foundAgent.name;
      }
    }
  }
}

if (topModelBtn) {
  topModelBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    let customModels = [];
    try { customModels = JSON.parse(localStorage.getItem('kyba_custom_models') || '[]'); } catch (e) {}
    let customAgents = [];
    try { customAgents = JSON.parse(localStorage.getItem('kyba_custom_agents') || '[]'); } catch (e) {}
    
    const activeId = localStorage.getItem('kyba_active_model_id') || 'default';
    
    const templateOpts = [
      { type: 'header', label: window.i18n ? (window.i18n.t('tab_models') || 'Modelos') : 'Modelos' },
      { id: 'default', name: 'Gemma4:e2b', radio: true, checked: activeId === 'default' }
    ];
    
    customModels.forEach(m => {
      templateOpts.push({ id: m.id, name: m.name, radio: true, checked: activeId === m.id });
    });
    
    if (customAgents && customAgents.length > 0) {
      templateOpts.push({ type: 'separator' });
      templateOpts.push({ type: 'header', label: window.i18n ? (window.i18n.t('tab_agents') || 'Agentes') : 'Agentes' });
      customAgents.forEach(a => {
        templateOpts.push({ id: a.id, name: a.name, radio: true, checked: activeId === a.id });
      });
    }
    
    if (window.electronAPI && typeof window.electronAPI.showNativeMenu === 'function') {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickedId = await window.electronAPI.showNativeMenu({
        template: templateOpts,
        x: Math.round(rect.left),
        y: Math.round(rect.bottom)
      });
      if (clickedId) {
        localStorage.setItem('kyba_active_model_id', clickedId);
        window.dispatchEvent(new Event('kyba_model_changed'));
        updateTopModelText();
      }
    }
  });

  updateTopModelText();
  window.addEventListener('storage', (e) => {
    if (e.key === 'kyba_custom_models' || e.key === 'kyba_custom_agents' || e.key === 'kyba_active_model_id') {
      updateTopModelText();
    }
  });
  window.addEventListener('kyba_storage_changed', () => {
    updateTopModelText();
  });
  window.addEventListener('kyba_model_changed', () => {
    updateTopModelText();
  });
}

function updateTopAgentText() {
  if (!topAgentModeVal) return;
  const agentModeEnabled = localStorage.getItem('kyba_agent_mode') === 'true';
  topAgentModeVal.textContent = agentModeEnabled ? 'ON' : 'OFF';
}

if (topAgentBtn) {
  topAgentBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const agentModeEnabled = localStorage.getItem('kyba_agent_mode') === 'true';
    const templateOpts = [
      { id: 'on', name: 'ON', radio: true, checked: agentModeEnabled },
      { id: 'off', name: 'OFF', radio: true, checked: !agentModeEnabled }
    ];
    
    if (window.electronAPI && typeof window.electronAPI.showNativeMenu === 'function') {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickedId = await window.electronAPI.showNativeMenu({
        template: templateOpts,
        x: Math.round(rect.left),
        y: Math.round(rect.bottom)
      });
      if (clickedId) {
        localStorage.setItem('kyba_agent_mode', (clickedId === 'on').toString());
        updateTopAgentText();
      }
    }
  });

  updateTopAgentText();
  window.addEventListener('storage', (e) => {
    if (e.key === 'kyba_agent_mode') {
      updateTopAgentText();
    }
  });
}
