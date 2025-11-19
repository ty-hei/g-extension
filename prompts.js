// g-extension/prompts.js
document.addEventListener('DOMContentLoaded', async () => {
  const promptListDiv = document.getElementById('promptList');
  const promptIdInput = document.getElementById('promptId');
  const promptNameInput = document.getElementById('promptName');
  const promptContentInput = document.getElementById('promptContent');
  const savePromptButton = document.getElementById('savePromptButton');
  const clearFormButton = document.getElementById('clearFormButton');
  const backToSidebarButton = document.getElementById('backToSidebarButton');

  let prompts = [];
  let currentLanguage = 'zh';

  const translations = {
    zh: {
      promptsTitle: "管理 Prompt 模板",
      backToSidebar: "返回侧边栏",
      addEditTitle: "添加/编辑模板",
      promptNameLabel: "模板名称:",
      promptNamePlaceholder: "例如：翻译成英文",
      promptContentLabel: "模板内容 (使用 {{text}} 作为选中文本的占位符):",
      promptContentPlaceholder: "例如：请将以下文本翻译成英文：\\n\\n{{text}}",
      savePrompt: "保存模板",
      clearForm: "清空表单",
      usageNoteTitle: "使用说明:",
      usageNoteText: "在模板内容中使用 {{text}} 作为占位符。当您在侧边栏点击模板快捷方式时：",
      usageNoteList1: "如果当前有选中的网页文本，{{text}} 将被替换为该文本。",
      usageNoteList2: "如果没有选中的文本，{{text}} 将被原样保留或根据您的输入进行处理。",
      noTemplates: "还没有模板，请添加一个。",
      presetTag: "预设",
      edit: "编辑",
      delete: "删除",
      confirmDelete: "确定要删除这个模板吗？",
      errorEmpty: "模板名称和内容不能为空。",
      presetTranslateName: "翻译",
      presetTranslateContent: "请将以下文本翻译成[在此处填写目标语言，例如：英文]：\n\n{{text}}",
      presetSummarizeName: "总结",
      presetSummarizeContent: "请总结以下文本的主要内容：\n\n{{text}}"
    },
    en: {
      promptsTitle: "Manage Prompt Templates",
      backToSidebar: "Back to Sidebar",
      addEditTitle: "Add/Edit Template",
      promptNameLabel: "Template Name:",
      promptNamePlaceholder: "E.g. Translate to English",
      promptContentLabel: "Content (Use {{text}} as placeholder):",
      promptContentPlaceholder: "E.g. Please translate the following to English:\\n\\n{{text}}",
      savePrompt: "Save Template",
      clearForm: "Clear Form",
      usageNoteTitle: "Usage:",
      usageNoteText: "Use {{text}} as a placeholder. When clicking a shortcut:",
      usageNoteList1: "If text is selected on the page, {{text}} is replaced by it.",
      usageNoteList2: "If no text is selected, {{text}} remains for you to fill.",
      noTemplates: "No templates yet. Please add one.",
      presetTag: "Preset",
      edit: "Edit",
      delete: "Delete",
      confirmDelete: "Are you sure you want to delete this template?",
      errorEmpty: "Name and content cannot be empty.",
      presetTranslateName: "Translate",
      presetTranslateContent: "Please translate the following text to [Target Language, e.g. Chinese]:\n\n{{text}}",
      presetSummarizeName: "Summarize",
      presetSummarizeContent: "Please summarize the key points of the following text:\n\n{{text}}"
    }
  };

  function t(key) {
    return translations[currentLanguage][key] || translations['zh'][key] || key;
  }

  function updateInterfaceLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLanguage][key]) {
            el.innerHTML = translations[currentLanguage][key]; // Use innerHTML to support <code> tags in notes
        }
    });
    if (promptNameInput) promptNameInput.placeholder = t('promptNamePlaceholder');
    if (promptContentInput) promptContentInput.placeholder = t('promptContentPlaceholder');
    renderPrompts(); // Re-render list to translate "Preset", "Edit", "Delete" buttons
  }

  // Load Language
  const configResult = await chrome.storage.sync.get(['interfaceLanguage']);
  if (configResult.interfaceLanguage) {
    currentLanguage = configResult.interfaceLanguage;
  }
  updateInterfaceLanguage();


  function getPresetPrompts() {
    return [
      {
        id: 'preset-translate',
        name: t('presetTranslateName'),
        content: t('presetTranslateContent'),
        isPreset: true
      },
      {
        id: 'preset-summarize',
        name: t('presetSummarizeName'),
        content: t('presetSummarizeContent'),
        isPreset: true
      }
    ];
  }

  async function loadPrompts() {
    const result = await chrome.storage.local.get(['promptTemplates']);
    prompts = result.promptTemplates ? [...result.promptTemplates] : [];

    // Define presets based on CURRENT language.
    const presetsDefinition = getPresetPrompts();

    let madeChangesToStoredStructure = false;

    // 1. Update existing presets to match current language definitions
    prompts.forEach(p => {
        if (p.isPreset) {
            const freshDef = presetsDefinition.find(def => def.id === p.id);
            if (freshDef) {
                // Overwrite name and content to ensure language switch takes effect for presets
                if (p.name !== freshDef.name || p.content !== freshDef.content) {
                    p.name = freshDef.name;
                    p.content = freshDef.content;
                    madeChangesToStoredStructure = true;
                }
            }
        }
    });

    // 2. Add any missing presets
    presetsDefinition.forEach(definedPreset => {
        const existingPromptIndex = prompts.findIndex(p => p.id === definedPreset.id);
        if (existingPromptIndex === -1) {
            prompts.unshift({ ...definedPreset });
            madeChangesToStoredStructure = true;
        }
    });

    // 3. Fix any flags (ensure custom prompts are not flagged as presets)
    prompts.forEach(p => {
        const isActuallyPreset = presetsDefinition.some(dp => dp.id === p.id);
        if (!isActuallyPreset && p.isPreset !== false) {
            p.isPreset = false;
            madeChangesToStoredStructure = true;
        }
    });

    if (!result.promptTemplates || madeChangesToStoredStructure) {
        await savePrompts();
    }

    renderPrompts();
  }

  async function savePrompts() {
    prompts.sort((a, b) => {
        if (a.isPreset && !b.isPreset) return -1;
        if (!a.isPreset && b.isPreset) return 1;
        return 0;
    });
    await chrome.storage.local.set({ promptTemplates: prompts });
  }

  function renderPrompts() {
    promptListDiv.innerHTML = '';
    if (prompts.length === 0) {
      promptListDiv.innerHTML = `<p>${t('noTemplates')}</p>`;
      return;
    }

    prompts.forEach(prompt => {
      const itemDiv = document.createElement('div');
      itemDiv.classList.add('prompt-item');
      itemDiv.dataset.id = prompt.id;

      const headerDiv = document.createElement('div');
      headerDiv.classList.add('prompt-item-header');

      const nameSpan = document.createElement('span');
      nameSpan.classList.add('prompt-item-name');
      nameSpan.textContent = prompt.name;
      if (prompt.isPreset) {
        const presetTag = document.createElement('span');
        presetTag.classList.add('preset-tag');
        presetTag.textContent = t('presetTag');
        nameSpan.appendChild(presetTag);
      }
      headerDiv.appendChild(nameSpan);

      const actionsDiv = document.createElement('div');
      actionsDiv.classList.add('prompt-item-actions');

      const editButton = document.createElement('button');
      editButton.classList.add('edit-button');
      editButton.textContent = t('edit');
      editButton.addEventListener('click', () => loadPromptForEditing(prompt.id));
      actionsDiv.appendChild(editButton);

      if (!prompt.isPreset) {
        const deleteButton = document.createElement('button');
        deleteButton.classList.add('delete-button');
        deleteButton.textContent = t('delete');
        deleteButton.addEventListener('click', () => deletePrompt(prompt.id));
        actionsDiv.appendChild(deleteButton);
      }
      headerDiv.appendChild(actionsDiv);
      itemDiv.appendChild(headerDiv);

      const contentPre = document.createElement('pre');
      contentPre.classList.add('prompt-item-content');
      contentPre.textContent = prompt.content;
      itemDiv.appendChild(contentPre);

      promptListDiv.appendChild(itemDiv);
    });
  }

  function clearForm() {
    promptIdInput.value = '';
    promptNameInput.value = '';
    promptContentInput.value = '';
    promptNameInput.focus();
  }

  function loadPromptForEditing(id) {
    const prompt = prompts.find(p => p.id === id);
    if (prompt) {
      promptIdInput.value = prompt.id;
      promptNameInput.value = prompt.name;
      promptContentInput.value = prompt.content;
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      promptNameInput.focus();
    }
  }

  async function deletePrompt(id) {
    if (confirm(t('confirmDelete'))) {
      prompts = prompts.filter(p => p.id !== id);
      await savePrompts();
      renderPrompts();
      clearForm(); 
    }
  }

  savePromptButton.addEventListener('click', async () => {
    const id = promptIdInput.value;
    const name = promptNameInput.value.trim();
    const content = promptContentInput.value.trim();

    if (!name || !content) {
      alert(t('errorEmpty'));
      return;
    }

    if (id) { // Editing existing
      const promptIndex = prompts.findIndex(p => p.id === id);
      if (promptIndex !== -1) {
        prompts[promptIndex].name = name;
        prompts[promptIndex].content = content;
      }
    } else { // Adding new
      prompts.push({
        id: `custom-${Date.now()}`,
        name,
        content,
        isPreset: false 
      });
    }
    await savePrompts();
    renderPrompts();
    clearForm();
  });

  clearFormButton.addEventListener('click', clearForm);

  backToSidebarButton.addEventListener('click', () => {
    chrome.tabs.getCurrent(tab => {
        if (tab && tab.id) {
            chrome.tabs.remove(tab.id);
        } else {
            window.close();
        }
    });
  });
  
  // Listener for language change while page is open
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.interfaceLanguage) {
        currentLanguage = changes.interfaceLanguage.newValue || 'zh';
        updateInterfaceLanguage();
        loadPrompts(); // Reload to update presets
    }
  });

  loadPrompts();
});