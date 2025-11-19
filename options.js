// options.js
document.addEventListener('DOMContentLoaded', function() {
  const configIdInput = document.getElementById('configId');
  const configNameInput = document.getElementById('configName');
  const apiKeyInput = document.getElementById('apiKey');
  const apiTypeSelect = document.getElementById('apiType');
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const modelNameInput = document.getElementById('modelName');
  
  const saveConfigButton = document.getElementById('saveConfigButton');
  const testConfigButton = document.getElementById('testConfigButton'); // New Button
  const clearFormButton = document.getElementById('clearFormButton');
  const cancelEditButton = document.getElementById('cancelEditButton');
  
  const configurationsListDiv = document.getElementById('configurationsList');
  const statusDiv = document.getElementById('status');
  
  const apiEndpointGroup = document.getElementById('apiEndpointGroup');

  // Language elements
  const languageSelect = document.getElementById('languageSelect');
  const saveGeneralSettingsButton = document.getElementById('saveGeneralSettingsButton');

  let configurations = [];
  let activeConfigurationId = null;
  let currentLanguage = 'zh'; // Default

  const translations = {
    zh: {
      optionsTitle: "API 配置管理",
      generalSettingsTitle: "通用设置",
      languageLabel: "界面语言 / Interface Language:",
      saveGeneralSettings: "保存通用设置",
      addEditConfigTitle: "添加/编辑配置",
      configNameLabel: "配置名称:",
      apiKeyLabel: "API 密钥:",
      apiTypeLabel: "API 类型:",
      apiEndpointLabel: "API Endpoint URL:",
      modelNameLabel: "模型名称:",
      saveConfig: "保存配置",
      updateConfig: "更新配置",
      testConfig: "测试连接", // New translation
      clearForm: "清空表单",
      cancelEdit: "取消编辑",
      savedConfigsTitle: "已保存的配置",
      noConfigs: "暂无配置。请使用上面的表单添加一个新配置。",
      
      // Placeholders & Values
      configNamePlaceholder: "例如：我的 Gemini 主力 (留空将自动生成)",
      apiKeyPlaceholder: "粘贴您的 API 密钥",
      apiEndpointPlaceholder: "例如: https://api.openai.com/v1/chat/completions",
      modelNamePlaceholder: "例如: gemini-1.5-flash-latest 或 gpt-4o",
      
      // Status Messages
      statusSaved: "配置保存成功！",
      statusError: "错误: 保存配置失败。",
      generalSettingsSaved: "通用设置已保存，请重新打开侧边栏以生效。",
      generalSettingsError: "保存失败: ",
      valConfigName: "API密钥和模型名称不能为空。", 
      valApiEndpoint: "OpenAI 兼容 API 需要填写 Endpoint URL。",
      confirmDelete: '确定要删除配置 "{name}" 吗？',
      testing: "正在测试连接...", // New translation
      testSuccess: "连接成功！API 返回正常。", // New translation
      testFail: "连接失败: ", // New translation

      // Render Items
      currentActive: "(当前活动)",
      type: "类型",
      model: "模型",
      setActive: "设为活动",
      edit: "编辑",
      delete: "删除"
    },
    en: {
      optionsTitle: "API Configuration",
      generalSettingsTitle: "General Settings",
      languageLabel: "Interface Language:",
      saveGeneralSettings: "Save General Settings",
      addEditConfigTitle: "Add/Edit Configuration",
      configNameLabel: "Config Name:",
      apiKeyLabel: "API Key:",
      apiTypeLabel: "API Type:",
      apiEndpointLabel: "API Endpoint URL:",
      modelNameLabel: "Model Name:",
      saveConfig: "Save Configuration",
      updateConfig: "Update Configuration",
      testConfig: "Test Connection", // New translation
      clearForm: "Clear Form",
      cancelEdit: "Cancel Edit",
      savedConfigsTitle: "Saved Configurations",
      noConfigs: "No configurations. Please add one above.",
      
      // Placeholders & Values
      configNamePlaceholder: "E.g., My Main Gemini (Leave empty to auto-generate)",
      apiKeyPlaceholder: "Paste your API Key here",
      apiEndpointPlaceholder: "E.g., https://api.openai.com/v1/chat/completions",
      modelNamePlaceholder: "E.g., gemini-1.5-flash-latest or gpt-4o",
      
      // Status Messages
      statusSaved: "Configuration saved successfully!",
      statusError: "Error: Failed to save configuration.",
      generalSettingsSaved: "General settings saved. Please reopen sidebar to apply.",
      generalSettingsError: "Failed to save: ",
      valConfigName: "API Key and Model Name are required.",
      valApiEndpoint: "Endpoint URL is required for OpenAI-compatible APIs.",
      confirmDelete: 'Are you sure you want to delete config "{name}"?',
      testing: "Testing connection...", // New translation
      testSuccess: "Connection successful! API responded.", // New translation
      testFail: "Connection failed: ", // New translation

      // Render Items
      currentActive: "(Active)",
      type: "Type",
      model: "Model",
      setActive: "Set Active",
      edit: "Edit",
      delete: "Delete"
    }
  };

  function t(key) {
    return translations[currentLanguage][key] || translations['zh'][key] || key;
  }

  function updateInterfaceLanguage() {
    // Update static text
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[currentLanguage][key]) {
        el.textContent = translations[currentLanguage][key];
      }
    });
    document.title = t('optionsTitle');

    // Update placeholders
    if (configNameInput) configNameInput.placeholder = t('configNamePlaceholder');
    if (apiKeyInput) apiKeyInput.placeholder = t('apiKeyPlaceholder');
    if (apiEndpointInput) apiEndpointInput.placeholder = t('apiEndpointPlaceholder');
    if (modelNameInput) modelNameInput.placeholder = t('modelNamePlaceholder');

    // Update dynamic button text based on state (Save vs Update)
    if (configIdInput.value) {
        saveConfigButton.textContent = t('updateConfig');
    } else {
        saveConfigButton.textContent = t('saveConfig');
    }

    // Re-render list to update item texts
    renderConfigurations();
  }

  function generateId() {
    return `config_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  function toggleApiEndpointField() {
    if (apiTypeSelect.value === 'openai') {
      apiEndpointGroup.classList.remove('hidden');
    } else {
      apiEndpointGroup.classList.add('hidden');
      apiEndpointInput.value = ''; // Clear if not applicable
    }
  }

  apiTypeSelect.addEventListener('change', toggleApiEndpointField);

  async function loadConfigurations() {
    const result = await chrome.storage.sync.get(['apiConfigurations', 'activeConfigurationId', 'interfaceLanguage']);
    configurations = result.apiConfigurations || [];
    activeConfigurationId = result.activeConfigurationId || null;
    
    // Load language setting
    if (result.interfaceLanguage) {
      languageSelect.value = result.interfaceLanguage;
      currentLanguage = result.interfaceLanguage;
    } else {
      languageSelect.value = 'zh'; // Default
      currentLanguage = 'zh';
    }

    updateInterfaceLanguage(); // Apply translations immediately
  }

  async function saveConfigurations() {
    try {
      await chrome.storage.sync.set({ 
        apiConfigurations: configurations,
        activeConfigurationId: activeConfigurationId 
      });
      showStatus(t('statusSaved'), 'green');
    } catch (e) {
      showStatus(t('statusError') + ' ' + e.message, 'red');
      console.error("Error saving configurations:", e);
    }
  }

  // Save General Settings (Language)
  saveGeneralSettingsButton.addEventListener('click', async () => {
    try {
      currentLanguage = languageSelect.value; // Update local state immediately
      await chrome.storage.sync.set({ 
        interfaceLanguage: currentLanguage 
      });
      updateInterfaceLanguage(); // Apply changes to UI
      showStatus(t('generalSettingsSaved'), 'green');
    } catch (e) {
      showStatus(t('generalSettingsError') + e.message, 'red');
    }
  });

  function showStatus(text, color) {
    statusDiv.textContent = text;
    statusDiv.style.color = color;
    // Clear status after a few seconds, unless it's a "Testing..." message which might need to persist until done
    if (!text.includes("...")) { 
        setTimeout(() => { statusDiv.textContent = ''; }, 4000);
    }
  }

  function renderConfigurations() {
    configurationsListDiv.innerHTML = '';
    if (configurations.length === 0) {
      configurationsListDiv.innerHTML = `<p>${t('noConfigs')}</p>`;
      return;
    }

    configurations.forEach(config => {
      const itemDiv = document.createElement('div');
      itemDiv.classList.add('config-item');
      if (config.id === activeConfigurationId) {
        itemDiv.classList.add('is-active');
      }

      const detailsDiv = document.createElement('div');
      detailsDiv.classList.add('config-details');
      detailsDiv.innerHTML = `
        <strong>${escapeHtml(config.configName)}</strong> ${config.id === activeConfigurationId ? t('currentActive') : ''}<br>
        <small>${t('type')}: ${escapeHtml(config.apiType)} | ${t('model')}: ${escapeHtml(config.modelName)}</small>
      `;
      itemDiv.appendChild(detailsDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.classList.add('config-actions');

      const setActiveButton = document.createElement('button');
      setActiveButton.textContent = t('setActive');
      setActiveButton.classList.add('set-active-btn');
      if (config.id === activeConfigurationId) {
        setActiveButton.disabled = true;
        setActiveButton.style.opacity = 0.5;
      }
      setActiveButton.addEventListener('click', async () => {
        activeConfigurationId = config.id;
        await saveConfigurations();
        renderConfigurations(); // Re-render to update active status
      });
      actionsDiv.appendChild(setActiveButton);

      const editButton = document.createElement('button');
      editButton.textContent = t('edit');
      editButton.classList.add('edit-btn');
      editButton.addEventListener('click', () => populateFormForEdit(config));
      actionsDiv.appendChild(editButton);

      const deleteButton = document.createElement('button');
      deleteButton.textContent = t('delete');
      deleteButton.classList.add('delete-btn');
      deleteButton.addEventListener('click', async () => {
        if (confirm(t('confirmDelete').replace('{name}', escapeHtml(config.configName)))) {
          configurations = configurations.filter(c => c.id !== config.id);
          if (activeConfigurationId === config.id) {
            activeConfigurationId = configurations.length > 0 ? configurations[0].id : null;
          }
          await saveConfigurations();
          loadConfigurations(); // Reload and re-render
        }
      });
      actionsDiv.appendChild(deleteButton);
      
      itemDiv.appendChild(actionsDiv);
      configurationsListDiv.appendChild(itemDiv);
    });
  }

  function populateFormForEdit(config) {
    configIdInput.value = config.id;
    configNameInput.value = config.configName;
    apiKeyInput.value = config.apiKey;
    apiTypeSelect.value = config.apiType;
    apiEndpointInput.value = config.apiEndpoint || '';
    modelNameInput.value = config.modelName;
    toggleApiEndpointField();
    
    saveConfigButton.textContent = t('updateConfig');
    
    cancelEditButton.classList.remove('hidden');
    document.getElementById('configFormContainer').scrollIntoView({ behavior: 'smooth' });
  }

  function clearForm() {
    configIdInput.value = '';
    configNameInput.value = '';
    apiKeyInput.value = '';
    apiTypeSelect.value = 'gemini'; // Default
    apiEndpointInput.value = '';
    modelNameInput.value = '';
    toggleApiEndpointField();
    
    saveConfigButton.textContent = t('saveConfig');
    
    cancelEditButton.classList.add('hidden');
    configNameInput.focus();
  }

  clearFormButton.addEventListener('click', clearForm);
  cancelEditButton.addEventListener('click', clearForm);

  // --- New Test Logic ---
  testConfigButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const apiType = apiTypeSelect.value;
    const apiEndpoint = apiEndpointInput.value.trim();
    const modelName = modelNameInput.value.trim();

    if (!apiKey || !modelName) {
      showStatus(t('valConfigName'), 'red');
      return;
    }
    if (apiType === 'openai' && !apiEndpoint) {
      showStatus(t('valApiEndpoint'), 'red');
      return;
    }

    showStatus(t('testing'), 'blue');

    try {
        let response;
        if (apiType === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Test" }] }],
                    generationConfig: { maxOutputTokens: 1 }
                })
            });
        } else if (apiType === 'openai') {
            response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: "user", content: "Test" }],
                    max_tokens: 1
                })
            });
        }

        if (response.ok) {
            showStatus(t('testSuccess'), 'green');
        } else {
            const errorText = await response.text();
            let errorMsg = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                errorMsg = errorJson.error?.message || errorJson.error || errorText;
            } catch(e) {}
            showStatus(t('testFail') + ` (${response.status}) ` + errorMsg.substring(0, 100), 'red');
        }
    } catch (error) {
        showStatus(t('testFail') + error.message, 'red');
    }
  });

  saveConfigButton.addEventListener('click', async () => {
    const id = configIdInput.value;
    let configName = configNameInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const apiType = apiTypeSelect.value;
    const apiEndpoint = apiEndpointInput.value.trim();
    const modelName = modelNameInput.value.trim();

    if (!apiKey || !modelName) {
      showStatus(t('valConfigName'), 'red');
      return;
    }
    if (apiType === 'openai' && !apiEndpoint) {
      showStatus(t('valApiEndpoint'), 'red');
      return;
    }

    // Auto-generate config name if empty
    if (!configName) {
        configName = "Config " + new Date().toLocaleString();
    }

    const newConfig = {
      id: id || generateId(),
      configName,
      apiKey,
      apiType,
      apiEndpoint: apiType === 'openai' ? apiEndpoint : '',
      modelName
    };

    const existingIndex = configurations.findIndex(c => c.id === newConfig.id);
    if (existingIndex > -1) {
      configurations[existingIndex] = newConfig; // Update existing
    } else {
      configurations.push(newConfig); // Add new
    }
    
    if (configurations.length === 1 || newConfig.id === activeConfigurationId || !activeConfigurationId) {
        activeConfigurationId = newConfig.id;
    }

    await saveConfigurations();
    clearForm();
    loadConfigurations(); 
  });

  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  // Initial load
  loadConfigurations();
  toggleApiEndpointField(); 
});