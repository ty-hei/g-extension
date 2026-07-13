'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    async emit(...args) {
      await Promise.all(listeners.map(listener => listener(...args)));
    }
  };
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) {
      names.forEach(name => values.add(name));
    },
    remove(...names) {
      names.forEach(name => values.delete(name));
    },
    contains(name) {
      return values.has(name);
    }
  };
}

function createElement(tagName = 'div', options = {}) {
  const listeners = new Map();
  const attributes = new Map();
  let ownText = '';
  let ownHtml = '';
  const element = {
    tagName: String(tagName).toUpperCase(),
    id: options.id || '',
    children: [],
    parentNode: null,
    classList: createClassList(options.classes),
    style: {},
    dataset: {},
    value: options.value || '',
    checked: false,
    disabled: false,
    placeholder: '',
    focusCount: 0,
    scrollIntoViewCalls: [],
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    async dispatch(type, event = {}) {
      await Promise.all((listeners.get(type) || []).map(listener => listener.call(element, event)));
    },
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    focus() {
      element.focusCount += 1;
    },
    scrollIntoView(optionsValue) {
      element.scrollIntoViewCalls.push(clone(optionsValue));
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    querySelector(selector) {
      return findAll(element, selector)[0] || null;
    },
    querySelectorAll(selector) {
      return findAll(element, selector);
    }
  };
  Object.defineProperties(element, {
    textContent: {
      get() {
        return ownText + element.children.map(child => child.textContent).join('');
      },
      set(value) {
        ownText = String(value ?? '');
        ownHtml = '';
        element.children = [];
      }
    },
    innerHTML: {
      get() {
        return ownHtml;
      },
      set(value) {
        ownHtml = String(value ?? '');
        ownText = '';
        element.children = [];
      }
    }
  });
  return element;
}

function matches(element, selector) {
  if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector === '[data-i18n]') return element.getAttribute('data-i18n') !== null;
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function findAll(root, selector) {
  const found = [];
  for (const child of root.children || []) {
    if (matches(child, selector)) found.push(child);
    found.push(...findAll(child, selector));
  }
  return found;
}

function selectValues(data, keys) {
  if (keys === undefined || keys === null) return clone(data);
  const requested = typeof keys === 'string' ? [keys] : keys;
  if (Array.isArray(requested)) {
    return Object.fromEntries(requested
      .filter(key => Object.prototype.hasOwnProperty.call(data, key))
      .map(key => [key, clone(data[key])]));
  }
  return {};
}

function createDocument(ids, defaults = {}) {
  const domReady = [];
  const elements = new Map();
  const createdElements = [];
  for (const [id, tagName] of Object.entries(ids)) {
    const element = createElement(tagName, {
      id,
      value: defaults[id],
      classes: ['apiEndpointGroup', 'regexExtractionFields', 'cancelEditButton'].includes(id)
        ? ['hidden']
        : []
    });
    elements.set(id, element);
  }
  const document = {
    title: '',
    body: { scrollHeight: 1000 },
    addEventListener(type, listener) {
      if (type === 'DOMContentLoaded') domReady.push(listener);
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      const element = createElement(tagName);
      createdElements.push(element);
      return element;
    },
    querySelectorAll(selector) {
      return [...elements.values()].filter(element => matches(element, selector));
    }
  };
  return { document, elements, createdElements, domReady };
}

async function flush(turns = 8) {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

function createStorage(options) {
  const syncData = clone(options.syncData) || {};
  const localData = clone(options.localData) || {};
  const syncWrites = [];
  const localWrites = [];
  const onChanged = createEvent();
  let syncSetCount = 0;
  let localSetCount = 0;
  return {
    syncData,
    localData,
    syncWrites,
    localWrites,
    onChanged,
    chromeStorage: {
      sync: {
        async get(keys) {
          return selectValues(syncData, keys);
        },
        async set(values) {
          syncSetCount += 1;
          const copied = clone(values);
          if (options.onSyncSet) await options.onSyncSet(copied, syncSetCount);
          syncWrites.push(copied);
          Object.assign(syncData, copied);
        }
      },
      local: {
        async get(keys) {
          return selectValues(localData, keys);
        },
        async set(values) {
          localSetCount += 1;
          const copied = clone(values);
          if (options.onLocalSet) await options.onLocalSet(copied, localSetCount);
          localWrites.push(copied);
          Object.assign(localData, copied);
        }
      },
      onChanged
    }
  };
}

async function createOptionsVm(options = {}) {
  const ids = {
    configId: 'input', configName: 'input', apiKey: 'input', apiType: 'select',
    apiEndpoint: 'input', modelName: 'input', saveConfigButton: 'button',
    testConfigButton: 'button', clearFormButton: 'button', cancelEditButton: 'button',
    configurationsList: 'div', status: 'p', apiEndpointGroup: 'div',
    languageSelect: 'select', saveGeneralSettingsButton: 'button',
    enableRegexExtraction: 'input', regexExtractionFields: 'div', regexPattern: 'textarea',
    regexFlags: 'input', regexUseFullPageText: 'input', configFormContainer: 'div'
  };
  const dom = createDocument(ids, { apiType: 'gemini', languageSelect: 'zh' });
  const storage = createStorage(options);
  const fetchCalls = [];
  const fetchImpl = options.fetch || (async function () {
    return { ok: true, status: 200, async text() { return ''; } };
  });
  const window = {
    location: { search: options.search || '', hash: options.hash || '' },
    scrollTo() {},
    close() {}
  };
  const chrome = {
    storage: storage.chromeStorage,
    tabs: {
      getCurrent(callback) { callback(null); },
      remove() {}
    }
  };
  const context = vm.createContext({
    document: dom.document,
    window,
    chrome,
    URLSearchParams,
    URL,
    RegExp,
    Date,
    TextDecoder,
    AbortController,
    setTimeout: options.setTimeout || (() => 1),
    clearTimeout() {},
    confirm: options.confirm || (() => true),
    fetch: async (url, init) => {
      fetchCalls.push({ url, init: clone(init) });
      return fetchImpl(url, init);
    },
    console: options.console || { log() {}, warn() {}, error() {} }
  });
  const apiConfigPath = path.join(ROOT, 'api_config.js');
  vm.runInContext(fs.readFileSync(apiConfigPath, 'utf8'), context, { filename: apiConfigPath });
  const regexPath = path.join(ROOT, 'regex_engine.js');
  vm.runInContext(fs.readFileSync(regexPath, 'utf8'), context, { filename: regexPath });
  const sourcePath = path.join(ROOT, 'options.js');
  let source = fs.readFileSync(sourcePath, 'utf8');
  const marker = '  // Initial load\n';
  if (!source.includes(marker)) throw new Error('options.js test export marker not found');
  source = source.replace(marker, `  globalThis.__optionsTestExports = {
    parseRegexPatternInput,
    validateRegexSettings,
    getConfigurations: () => configurations,
    getActiveConfigurationId: () => activeConfigurationId
  };\n\n${marker}`);
  vm.runInContext(source, context, { filename: sourcePath });
  await Promise.all(dom.domReady.map(listener => listener()));
  await flush();
  return { ...dom, ...storage, context, fetchCalls, exports: context.__optionsTestExports, flush };
}

async function createPromptsVm(options = {}) {
  const ids = {
    promptList: 'div', promptId: 'input', promptName: 'input', promptContent: 'textarea',
    savePromptButton: 'button', clearFormButton: 'button', backToSidebarButton: 'button'
  };
  const dom = createDocument(ids);
  const storage = createStorage(options);
  const alerts = [];
  const window = { scrollTo() {}, close() {} };
  const chrome = {
    storage: storage.chromeStorage,
    tabs: { getCurrent(callback) { callback(null); }, remove() {} }
  };
  const context = vm.createContext({
    document: dom.document,
    window,
    chrome,
    Date,
    setTimeout,
    clearTimeout,
    alert(message) { alerts.push(message); },
    confirm: options.confirm || (() => true),
    console: options.console || { log() {}, warn() {}, error() {} }
  });
  const sourcePath = path.join(ROOT, 'prompts.js');
  let source = fs.readFileSync(sourcePath, 'utf8');
  const marker = '  loadPrompts();\n});';
  if (!source.includes(marker)) throw new Error('prompts.js test export marker not found');
  source = source.replace(marker, `  globalThis.__promptsTestExports = {
    loadPrompts,
    renderPrompts,
    getPrompts: () => prompts
  };\n\n${marker}`);
  vm.runInContext(source, context, { filename: sourcePath });
  await Promise.all(dom.domReady.map(listener => listener()));
  await flush();
  return { ...dom, ...storage, context, alerts, exports: context.__promptsTestExports, flush };
}

module.exports = {
  clone,
  createOptionsVm,
  createPromptsVm
};
