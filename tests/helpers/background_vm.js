'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKGROUND_PATH = path.join(ROOT, 'background.js');
const BACKGROUND_SOURCE = fs.readFileSync(BACKGROUND_PATH, 'utf8');

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    }
  };
}

function selectStorageValues(data, keys) {
  if (keys === null || keys === undefined) return clone(data);
  if (typeof keys === 'string') {
    return Object.prototype.hasOwnProperty.call(data, keys) ? { [keys]: clone(data[keys]) } : {};
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(
      keys
        .filter(key => Object.prototype.hasOwnProperty.call(data, key))
        .map(key => [key, clone(data[key])])
    );
  }
  if (keys && typeof keys === 'object') {
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        Object.prototype.hasOwnProperty.call(data, key) ? clone(data[key]) : clone(fallback)
      ])
    );
  }
  return {};
}

function createChromeMock(options = {}) {
  const extensionId = options.extensionId || 'unit-test-extension';
  const operations = [];
  const sessionData = {
    gExtensionLinkJobIndex: {},
    ...(clone(options.sessionData) || {})
  };
  const syncData = clone(options.syncData) || {};
  const tabs = new Map();
  let nextTabId = options.firstTabId || 100;

  const events = {
    alarmsOnAlarm: createEvent(),
    contextMenusOnClicked: createEvent(),
    runtimeOnConnect: createEvent(),
    runtimeOnInstalled: createEvent(),
    runtimeOnMessage: createEvent(),
    storageOnChanged: createEvent(),
    tabsOnRemoved: createEvent(),
    tabsOnUpdated: createEvent()
  };

  const chrome = {
    runtime: {
      id: extensionId,
      lastError: null,
      getURL(resourcePath) {
        return `chrome-extension://${extensionId}/${resourcePath}`;
      },
      onInstalled: events.runtimeOnInstalled,
      onConnect: events.runtimeOnConnect,
      onMessage: events.runtimeOnMessage,
      sendMessage(message, callback) {
        operations.push({ type: 'runtime.sendMessage', message: clone(message) });
        if (typeof callback === 'function') callback({});
        return Promise.resolve({});
      }
    },
    storage: {
      sync: {
        async get(keys) {
          operations.push({ type: 'storage.sync.get', keys: clone(keys) });
          return selectStorageValues(syncData, keys);
        }
      },
      session: {
        async get(keys) {
          operations.push({ type: 'storage.session.get', keys: clone(keys) });
          return selectStorageValues(sessionData, keys);
        },
        async set(values) {
          operations.push({ type: 'storage.session.set', values: clone(values) });
          Object.assign(sessionData, clone(values));
        },
        async remove(keys) {
          const keyList = Array.isArray(keys) ? keys : [keys];
          operations.push({ type: 'storage.session.remove', keys: clone(keyList) });
          keyList.forEach(key => delete sessionData[key]);
        },
        async getBytesInUse(keys) {
          operations.push({ type: 'storage.session.getBytesInUse', keys: clone(keys) });
          if (Number.isFinite(options.storageBytesInUse)) return options.storageBytesInUse;
          return JSON.stringify(sessionData).length;
        }
      },
      onChanged: events.storageOnChanged
    },
    alarms: {
      async create(name, alarmInfo) {
        operations.push({ type: 'alarms.create', name, alarmInfo: clone(alarmInfo) });
      },
      async clear(name) {
        operations.push({ type: 'alarms.clear', name });
        return true;
      },
      onAlarm: events.alarmsOnAlarm
    },
    tabs: {
      async create(createProperties) {
        operations.push({ type: 'tabs.create', createProperties: clone(createProperties) });
        const tab = {
          id: nextTabId,
          windowId: createProperties.windowId ?? 1,
          url: createProperties.url || '',
          title: '',
          status: options.createdTabStatus || 'loading'
        };
        nextTabId += 1;
        tabs.set(tab.id, tab);
        return clone(tab);
      },
      async get(tabId) {
        operations.push({ type: 'tabs.get', tabId });
        const tab = tabs.get(tabId);
        if (!tab) throw new Error(`No tab with id: ${tabId}`);
        return clone(tab);
      },
      async query(queryInfo) {
        operations.push({ type: 'tabs.query', queryInfo: clone(queryInfo) });
        return clone(options.queryTabs || []);
      },
      async remove(tabId) {
        operations.push({ type: 'tabs.remove', tabId });
        if (!tabs.has(tabId)) throw new Error(`No tab with id: ${tabId}`);
        tabs.delete(tabId);
      },
      onUpdated: events.tabsOnUpdated,
      onRemoved: events.tabsOnRemoved
    },
    scripting: {
      async executeScript(injection) {
        operations.push({ type: 'scripting.executeScript', injection: clone(injection) });
        return clone(options.injectionResults || []);
      }
    },
    sidePanel: {
      async open(openOptions) {
        operations.push({ type: 'sidePanel.open', options: clone(openOptions) });
      },
      async setPanelBehavior(behavior) {
        operations.push({ type: 'sidePanel.setPanelBehavior', behavior: clone(behavior) });
      }
    },
    contextMenus: {
      removeAll(callback) {
        operations.push({ type: 'contextMenus.removeAll' });
        if (typeof callback === 'function') callback();
      },
      create(createProperties) {
        operations.push({ type: 'contextMenus.create', createProperties: clone(createProperties) });
      },
      onClicked: events.contextMenusOnClicked
    }
  };

  return {
    chrome,
    events,
    extensionId,
    operations,
    sessionData,
    syncData,
    tabs
  };
}

async function flushAsyncWork(turns = 8) {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

async function loadBackground(options = {}) {
  const state = createChromeMock(options);
  let uuidSequence = 0;
  const context = vm.createContext({
    chrome: state.chrome,
    URL,
    TextEncoder,
    setTimeout,
    clearTimeout,
    crypto: {
      randomUUID() {
        uuidSequence += 1;
        return `uuid-${uuidSequence}`;
      }
    },
    console: options.console || {
      log() {},
      warn() {},
      error() {}
    }
  });

  vm.runInContext(BACKGROUND_SOURCE, context, { filename: BACKGROUND_PATH });
  await flushAsyncWork();

  return {
    ...state,
    context,
    getBinding(name) {
      return vm.runInContext(name, context);
    },
    async flush(turns) {
      await flushAsyncWork(turns);
    }
  };
}

module.exports = {
  loadBackground,
  flushAsyncWork
};
