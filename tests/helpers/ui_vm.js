'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createClassList() {
  const values = new Set();
  return {
    add(...names) {
      names.forEach(name => values.add(name));
    },
    remove(...names) {
      names.forEach(name => values.delete(name));
    },
    contains(name) {
      return values.has(name);
    },
    toArray() {
      return [...values];
    }
  };
}

function createFakeElement(tagName = 'div') {
  const listeners = new Map();
  const attributes = new Map();
  const element = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    parentNode: null,
    classList: createClassList(),
    style: {},
    dataset: {},
    value: '',
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0,
    textContent: '',
    innerHTML: '',
    lastElementChild: null,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      return Promise.all((listeners.get(type) || []).map(listener => listener.call(element, event)));
    },
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      element.lastElementChild = child;
      return child;
    },
    removeChild(child) {
      const index = element.children.indexOf(child);
      if (index >= 0) element.children.splice(index, 1);
      element.lastElementChild = element.children[element.children.length - 1] || null;
      child.parentNode = null;
      return child;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'id') element.id = String(value);
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    querySelector(selector) {
      return findDescendants(element, selector)[0] || null;
    },
    querySelectorAll(selector) {
      return findDescendants(element, selector);
    }
  };
  return element;
}

function matchesSelector(element, selector) {
  if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function findDescendants(root, selector) {
  const matches = [];
  for (const child of root.children || []) {
    if (matchesSelector(child, selector)) matches.push(child);
    matches.push(...findDescendants(child, selector));
  }
  return matches;
}

function createSidebarVm(options = {}) {
  const source = fs.readFileSync(path.join(ROOT, 'sidebar.js'), 'utf8');
  const listeners = new Map();
  const document = options.document || {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    createElement: createFakeElement,
    querySelectorAll() {
      return [];
    }
  };
  const extensionId = 'ui-test-extension';
  const context = vm.createContext({
    chrome: options.chrome || {
      runtime: {
        id: extensionId,
        getURL(resourcePath) {
          return `chrome-extension://${extensionId}/${resourcePath}`;
        }
      }
    },
    document,
    URL,
    TextDecoder,
    TextEncoder,
    AbortController,
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    fetch: options.fetch,
    console: options.console || { log() {}, warn() {}, error() {} }
  });
  vm.runInContext(source, context, { filename: path.join(ROOT, 'sidebar.js') });
  return {
    context,
    document,
    extensionId,
    get(name) {
      return vm.runInContext(name, context);
    },
    assign(sourceText) {
      vm.runInContext(sourceText, context);
    }
  };
}

async function createArchiveVm(options = {}) {
  const sourcePath = path.join(ROOT, 'archive.js');
  const originalSource = fs.readFileSync(sourcePath, 'utf8');
  const marker = '    loadArchivedChats();\n});';
  if (!originalSource.includes(marker)) throw new Error('archive.js test export marker not found');
  const exposedSource = originalSource.replace(marker, `
    globalThis.__archiveTestExports = {
        buildBoundedArchiveHistory,
        readArchiveStreamChunk,
        consumeArchiveSse,
        getChatIdentity,
        persistArchivedChat,
        handleSendMessage,
        callApi,
        renderChatDetails,
        getArchivedChats: () => archivedChats,
        getActiveChat: () => activeChat,
        getActiveChatIdentity: () => activeChatIdentity,
        getRequestInFlight: () => isArchiveRequestInFlight,
        setArchivedChats: value => { archivedChats = value; },
        setActiveChat: value => {
            activeChat = value;
            activeChatIdentity = value ? getChatIdentity(value) : null;
        },
        setCallApi: value => { callApi = value; },
        setRenderChatDetails: value => { renderChatDetails = value; },
        triggerStorageChange: (changes, namespace = 'local') =>
            globalThis.__archiveStorageChangeListener(changes, namespace)
    };
    loadArchivedChats();
});`);

  const domListeners = new Map();
  const storageWrites = [];
  const detailElement = createFakeElement('section');
  detailElement.classList.add('chat-detail-view');
  const inputContainer = createFakeElement('div');
  const chatInput = createFakeElement('textarea');
  const sendButton = createFakeElement('button');
  const elements = new Map([
    ['chat-detail-container', detailElement],
    ['archive-input-container', inputContainer],
    ['archive-chat-input', chatInput],
    ['archive-send-btn', sendButton]
  ]);
  const document = {
    title: '',
    addEventListener(type, listener) {
      domListeners.set(type, listener);
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement: createFakeElement,
    querySelector(selector) {
      if (selector === '.chat-detail-view') return detailElement;
      return detailElement.querySelector(selector);
    },
    querySelectorAll(selector) {
      if (selector === '[data-i18n]' || selector === '.chat-item') return [];
      return detailElement.querySelectorAll(selector);
    }
  };
  let uuidIndex = 0;
  const context = vm.createContext({
    document,
    chrome: {
      storage: {
        sync: {
          async get(keys) {
            const requested = Array.isArray(keys) ? keys : [keys];
            const result = {};
            if (requested.includes('apiConfigurations')) {
              result.apiConfigurations = options.apiConfigurations || [];
              result.activeConfigurationId = options.activeConfigurationId;
            }
            if (requested.includes('interfaceLanguage')) {
              result.interfaceLanguage = options.interfaceLanguage || 'en';
            }
            return result;
          }
        },
        local: {
          get(_keys, callback) {
            callback({ geminiArchivedChats: clone(options.archivedChats || []) });
          },
          set(value) {
            storageWrites.push(clone(value));
          }
        },
        onChanged: {
          addListener(listener) {
            context.__archiveStorageChangeListener = listener;
          }
        }
      }
    },
    crypto: {
      randomUUID() {
        uuidIndex += 1;
        return `test-uuid-${uuidIndex}`;
      }
    },
    TextDecoder,
    TextEncoder,
    AbortController,
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    fetch: options.fetch,
    alert: options.alert || function () {},
    confirm: options.confirm || function () { return true; },
    navigator: { clipboard: { async writeText() {} } },
    renderSafeMarkdown: options.renderSafeMarkdown || (text => String(text)),
    console: options.console || { log() {}, warn() {}, error() {} }
  });
  vm.runInContext(exposedSource, context, { filename: sourcePath });
  const ready = domListeners.get('DOMContentLoaded');
  if (!ready) throw new Error('archive.js did not register DOMContentLoaded');
  await ready();
  return {
    context,
    exports: context.__archiveTestExports,
    document,
    elements: { detailElement, inputContainer, chatInput, sendButton },
    storageWrites,
    clone
  };
}

module.exports = {
  clone,
  createFakeElement,
  createSidebarVm,
  createArchiveVm
};
