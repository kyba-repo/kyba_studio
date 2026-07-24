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
  
  let customAgents = [];
  let currentEditingAgentId = null;
  let activeAgentConfig = { orchestrator: 'none', subagents: [] };

  let customMcpServers = [];
  let currentEditingMcpId = null;

  function loadData() {
    try {
      customModels = JSON.parse(localStorage.getItem('kyba_custom_models')) || [];
      if (!Array.isArray(customModels)) customModels = [];
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
    loadAgentsData(); // ensure customAgents is loaded

    activeModelSelect.innerHTML = '';
    
    // OptGroup for Models
    const modelsGroup = document.createElement('optgroup');
    modelsGroup.label = 'Modelos';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'default';
    defaultOpt.textContent = defaultProfile.name;
    modelsGroup.appendChild(defaultOpt);
    
    customModels.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      modelsGroup.appendChild(opt);
    });
    activeModelSelect.appendChild(modelsGroup);

    // OptGroup for Agents
    if (customAgents && customAgents.length > 0) {
      const agentsGroup = document.createElement('optgroup');
      agentsGroup.label = 'Agentes';
      customAgents.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        agentsGroup.appendChild(opt);
      });
      activeModelSelect.appendChild(agentsGroup);
    }

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

      if (activeAgentConfig && activeAgentConfig.id === agent.id) {
        const badge = document.createElement('span');
        badge.textContent = 'Activo';
        badge.style.fontSize = '10px';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = '#10b981';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '4px';
        badge.style.marginLeft = '8px';
        nameSpan.appendChild(badge);
      }

      const actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.gap = '8px';

      const activateBtn = document.createElement('button');
      activateBtn.innerHTML = 'Activar';
      activateBtn.style.background = 'rgba(255,255,255,0.05)';
      activateBtn.style.border = '1px solid rgba(255,255,255,0.1)';
      activateBtn.style.color = '#cbd5e1';
      activateBtn.style.borderRadius = '4px';
      activateBtn.style.padding = '4px 8px';
      activateBtn.style.fontSize = '11px';
      activateBtn.style.cursor = 'pointer';
      if(activeAgentConfig && activeAgentConfig.id === agent.id) activateBtn.style.display = 'none';
      activateBtn.onclick = () => {
        activeAgentConfig = { ...agent };
        localStorage.setItem('kyba_agent_orchestration', JSON.stringify(activeAgentConfig));
        renderAgentsList();
      };

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
            renderActiveModelSelect();
            window.dispatchEvent(new Event('kyba_storage_changed'));
          }
        } catch (err) {
          console.error("Error in deleteBtn:", err);
          alert("Error in deleteBtn: " + err.message);
        }
      };

      actionsDiv.appendChild(activateBtn);
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
    orchestratorSelect.innerHTML = '<option value="none">Ninguno (Agente sin orquestador)</option>';
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
        renderActiveModelSelect();
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
      listContainer.innerHTML = '<span style="color:#64748b; font-size:12px;">No hay servidores MCP configurados.</span>';
      return;
    }

    customMcpServers.forEach(mcp => {
      const div = document.createElement('div');
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
        mcp = { id: currentEditingMcpId };
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
      renderActiveModelSelect();
      window.dispatchEvent(new Event('kyba_storage_changed'));
      closeSettings();
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
    setActiveModelId(currentEditingId); // Auto-select the saved model
    renderActiveModelSelect();
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
  }
});
