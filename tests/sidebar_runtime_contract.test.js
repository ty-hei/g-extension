'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SIDEBAR_PATH = path.join(ROOT, 'sidebar.js');
const SIDEBAR_SOURCE = fs.readFileSync(SIDEBAR_PATH, 'utf8');
const API_CONFIG_PATH = path.join(ROOT, 'api_config.js');
const API_CONFIG_SOURCE = fs.readFileSync(API_CONFIG_PATH, 'utf8');

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSidebarContext(options = {}) {
  const documentListeners = new Map();
  const extensionId = 'unit-test-extension';
  const context = vm.createContext({
    chrome: {
      runtime: {
        id: extensionId,
        getURL(resourcePath) {
          return `chrome-extension://${extensionId}/${resourcePath}`;
        }
      }
    },
    document: {
      addEventListener(type, listener) {
        documentListeners.set(type, listener);
      }
    },
    URL,
    TextDecoder,
    AbortController,
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    Worker: options.Worker,
    console: {
      log() {},
      warn() {},
      error() {}
    }
  });
  vm.runInContext(API_CONFIG_SOURCE, context, { filename: API_CONFIG_PATH });
  vm.runInContext(SIDEBAR_SOURCE, context, { filename: SIDEBAR_PATH });
  vm.runInContext(`
    currentApiKey = 'unit-test-key';
    currentApiType = 'openai';
    currentApiEndpoint = 'https://api.example.test/v1/chat/completions';
    currentModelName = 'unit-test-model';
  `, context);
  return {
    context,
    chrome: context.chrome,
    extensionId,
    getBinding(name) {
      return vm.runInContext(name, context);
    },
    assign(source) {
      vm.runInContext(source, context);
    }
  };
}

async function flushAsyncWork(turns = 4) {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('sidebar never requests an unbounded storage snapshot', function () {
  const unboundedGet = /chrome\s*\.\s*storage\s*\.\s*(?:sync|local|session)\s*\.\s*get\s*\(\s*null\s*\)/;
  assert.doesNotMatch(SIDEBAR_SOURCE, unboundedGet);
});

test('API calls are serialized and a rejected request does not poison the queue', async function () {
  const loaded = createSidebarContext();
  const calls = [];
  let activeCalls = 0;
  let maximumActiveCalls = 0;
  const controls = [];

  loaded.context.__performApiCallStub = function (message) {
    calls.push(message);
    activeCalls += 1;
    maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
    return new Promise((resolve, reject) => {
      controls.push({
        resolve(value) {
          activeCalls -= 1;
          resolve(value);
        },
        reject(error) {
          activeCalls -= 1;
          reject(error);
        }
      });
    });
  };
  loaded.assign('performApiCall = globalThis.__performApiCallStub; apiRequestQueue = Promise.resolve();');
  const callApi = loaded.getBinding('callApi');

  const first = callApi('first');
  const firstRejection = assert.rejects(first, /first failed/);
  const second = callApi('second');
  const third = callApi('third');
  await flushAsyncWork();

  assert.deepEqual(calls, ['first']);
  assert.equal(maximumActiveCalls, 1);

  controls[0].reject(new Error('first failed'));
  await firstRejection;
  await flushAsyncWork();
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(maximumActiveCalls, 1);

  controls[1].resolve(true);
  assert.equal(await second, true);
  await flushAsyncWork();
  assert.deepEqual(calls, ['first', 'second', 'third']);
  assert.equal(maximumActiveCalls, 1);

  controls[2].resolve(false);
  assert.equal(await third, false);
  assert.equal(activeCalls, 0);
});

test('API history is snapshotted at enqueue time and keeps a same-millisecond user message', async function () {
  const loaded = createSidebarContext();
  let releaseQueue;
  const blocker = new Promise(resolve => {
    releaseQueue = resolve;
  });
  const capturedSnapshots = [];

  loaded.context.__queueBlocker = blocker;
  loaded.context.__captureApiCall = function (_message, _summary, _image, _untrusted, historySnapshot) {
    capturedSnapshots.push(toPlain(historySnapshot));
    return Promise.resolve(true);
  };
  loaded.assign(`
    currentApiType = 'openai';
    currentChat = [{
      role: 'user',
      parts: [{ text: 'queued user message' }],
      timestamp: 4242
    }];
    apiRequestQueue = globalThis.__queueBlocker;
    performApiCall = globalThis.__captureApiCall;
  `);

  const callApi = loaded.getBinding('callApi');
  const queuedCall = callApi('queued user message');
  loaded.assign(`
    currentChat[0].parts[0].text = 'mutated after enqueue';
    currentChat.push({ role: 'model', parts: [{ text: 'later message' }], timestamp: 4242 });
  `);
  await flushAsyncWork();
  assert.equal(capturedSnapshots.length, 0);

  releaseQueue();
  assert.equal(await queuedCall, true);
  assert.deepEqual(capturedSnapshots, [[{
    role: 'user',
    parts: [{ text: 'queued user message' }],
    timestamp: 4242
  }]]);

  const buildBoundedApiHistory = loaded.getBinding('buildBoundedApiHistory');
  const sameMillisecondHistory = buildBoundedApiHistory([
    { role: 'user', parts: [{ text: 'must survive' }], timestamp: 9001 },
    { role: 'model', parts: [{ text: 'Thinking' }], timestamp: 9001, isThinking: true }
  ], 'openai');
  assert.deepEqual(toPlain(sameMillisecondHistory), [
    { role: 'user', content: 'must survive' }
  ]);
});

test('a queued terminal link job is not claimed until it owns the global API slot', async function () {
  const loaded = createSidebarContext();
  let releaseQueue;
  const blocker = new Promise(resolve => {
    releaseQueue = resolve;
  });
  const messages = [];

  loaded.chrome.runtime.sendMessage = async function (message) {
    messages.push(toPlain(message));
    return { success: true, claimed: false };
  };
  loaded.context.__queueBlocker = blocker;
  loaded.assign(`
    currentWindowId = 7;
    apiRequestQueue = globalThis.__queueBlocker;
    queuedLinkJobIds.clear();
  `);

  const queueTerminalLinkJob = loaded.getBinding('queueTerminalLinkJob');
  queueTerminalLinkJob({
    requestId: 'wait-for-api-slot',
    windowId: 7,
    status: 'completed'
  });
  await flushAsyncWork();
  assert.deepEqual(messages, []);

  releaseQueue();
  await flushAsyncWork(8);
  assert.deepEqual(messages, [{
    action: 'claimLinkJob',
    requestId: 'wait-for-api-slot',
    windowId: 7
  }]);
});

test('stream idle timeout aborts the request controller and rejects a pending reader', async function () {
  let scheduledTimer = null;
  const clearedTimers = [];
  const loaded = createSidebarContext({
    setTimeout(callback, delay) {
      scheduledTimer = { callback, delay };
      return scheduledTimer;
    },
    clearTimeout(timer) {
      clearedTimers.push(timer);
    }
  });
  let abortCount = 0;
  const reader = {
    read() {
      return new Promise(() => {});
    }
  };
  const controller = {
    abort() {
      abortCount += 1;
    }
  };

  const readStreamChunkWithIdleTimeout = loaded.getBinding('readStreamChunkWithIdleTimeout');
  const pendingRead = readStreamChunkWithIdleTimeout(reader, controller);
  assert.equal(scheduledTimer.delay, 30000);
  scheduledTimer.callback();

  await assert.rejects(
    pendingRead,
    error => error?.code === 'API_TIMEOUT' && error?.name === 'TimeoutError'
  );
  assert.equal(abortCount, 1);
  assert.deepEqual(clearedTimers, [scheduledTimer]);
});

test('regex preview terminates the production Worker wrapper at its one-second deadline', async function () {
  const timers = [];
  const clearedTimers = [];
  let workerInstance = null;
  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.terminateCount = 0;
      workerInstance = this;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    postMessage(payload) {
      this.payload = payload;
    }

    terminate() {
      this.terminateCount += 1;
    }
  }
  const loaded = createSidebarContext({
    Worker: FakeWorker,
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      clearedTimers.push(timer);
    }
  });

  const payload = { id: 7, sourceText: 'a'.repeat(100), patternInput: '/a+/' };
  const pending = loaded.getBinding('runRegexPreviewInWorker')(payload);
  const timeoutRejection = assert.rejects(pending, /REGEX_TIMEOUT/);
  assert.equal(workerInstance.url, `chrome-extension://${loaded.extensionId}/regex_worker.js`);
  assert.deepEqual(toPlain(workerInstance.payload), payload);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 1000);

  timers[0].callback();
  await timeoutRejection;
  assert.equal(workerInstance.terminateCount, 1);
  assert.equal(loaded.getBinding('activeRegexWorker'), null);
  assert.equal(loaded.getBinding('activeRegexWorkerReject'), null);
  assert.equal(loaded.getBinding('activeRegexWorkerTimeout'), null);
  assert.ok(clearedTimers.includes(timers[0]));

  workerInstance.listeners.get('message')({ data: { ok: true } });
  assert.equal(workerInstance.terminateCount, 1);
});

test('window-scoped sidebar messages fail closed for missing, malformed, or mismatched window IDs', function () {
  const loaded = createSidebarContext();
  loaded.assign('currentWindowId = 9; currentSelectedText = null; currentSelectedSource = null;');
  const isMessageForCurrentWindow = loaded.getBinding('isMessageForCurrentWindow');
  const handleRuntimeMessages = loaded.getBinding('handleRuntimeMessages');
  const backgroundSender = {
    id: loaded.extensionId,
    url: `chrome-extension://${loaded.extensionId}/background.js`
  };

  assert.equal(isMessageForCurrentWindow({ windowId: 9 }), true);
  assert.equal(isMessageForCurrentWindow({ windowId: 8 }), false);
  assert.equal(isMessageForCurrentWindow({ windowId: '9' }), false);
  assert.equal(isMessageForCurrentWindow({}), false);
  assert.equal(isMessageForCurrentWindow(null), false);

  for (const windowId of [undefined, '9', 8]) {
    handleRuntimeMessages(
      { type: 'TEXT_SELECTED_FOR_SIDEBAR', windowId, text: `rejected-${windowId}` },
      backgroundSender,
      function () {}
    );
  }
  assert.equal(loaded.getBinding('currentSelectedText'), null);

  handleRuntimeMessages(
    { type: 'TEXT_SELECTED_FOR_SIDEBAR', windowId: 9, text: 'forged sender' },
    { id: 'different-extension' },
    function () {}
  );
  assert.equal(loaded.getBinding('currentSelectedText'), null);

  const responses = [];
  handleRuntimeMessages(
    {
      type: 'TEXT_SELECTED_FOR_SIDEBAR',
      windowId: 9,
      tabId: 44,
      url: 'https://example.test/page',
      title: 'Page',
      text: 'accepted text'
    },
    backgroundSender,
    response => responses.push(response)
  );
  assert.equal(loaded.getBinding('currentSelectedText'), 'accepted text');
  assert.deepEqual(toPlain(responses), [{ status: 'Selected text received in sidebar' }]);
});

test('claimed link delivery acknowledges terminal/success jobs and releases retryable failures', async function () {
  const loaded = createSidebarContext();
  const events = [];
  let apiResult = true;
  let configComplete = true;

  loaded.context.__jobStubs = {
    remove(requestId) {
      events.push(['remove-status', requestId]);
    },
    add(message) {
      events.push(['add-message', message.role]);
      return message;
    },
    reveal() {
      events.push(['reveal-config']);
    },
    isComplete() {
      return configComplete;
    },
    translate(key) {
      return key === 'prompt_summarize_link' ? 'summarize {text}' : key;
    },
    callApi(prompt) {
      events.push(['call-api', prompt]);
      return Promise.resolve(apiResult);
    },
    acknowledge(job, token) {
      events.push(['ack', job.requestId, token]);
      return Promise.resolve({ success: true });
    },
    release(job, token, error) {
      events.push(['release', job.requestId, token, String(error)]);
      return Promise.resolve({ success: true });
    }
  };
  loaded.assign(`
    removeLinkJobStatusMessage = globalThis.__jobStubs.remove;
    addMessageToChat = globalThis.__jobStubs.add;
    revealCurrentConfigSetupCard = globalThis.__jobStubs.reveal;
    isCurrentApiConfigComplete = globalThis.__jobStubs.isComplete;
    t = globalThis.__jobStubs.translate;
    callApi = globalThis.__jobStubs.callApi;
    acknowledgeClaimedLinkJob = globalThis.__jobStubs.acknowledge;
    releaseClaimedLinkJob = globalThis.__jobStubs.release;
  `);
  const consumeClaimedLinkJob = loaded.getBinding('consumeClaimedLinkJob');

  await consumeClaimedLinkJob({
    requestId: 'failed-job',
    status: 'failed',
    sourceUrl: 'https://example.test/failed',
    sourceTitle: 'Failed',
    error: { message: 'extract failed' }
  }, 'failed-token');
  assert.ok(events.some(event => event[0] === 'ack' && event[1] === 'failed-job'));
  assert.equal(events.some(event => event[0] === 'call-api'), false);

  events.length = 0;
  configComplete = false;
  await consumeClaimedLinkJob({
    requestId: 'no-config-job',
    status: 'completed',
    result: { content: { text: 'page text' }, source: {} }
  }, 'no-config-token');
  assert.ok(events.some(event => event[0] === 'release' && event[1] === 'no-config-job'));
  assert.equal(events.some(event => event[0] === 'ack'), false);

  events.length = 0;
  configComplete = true;
  apiResult = true;
  const completedJob = {
    requestId: 'completed-job',
    status: 'completed',
    sourceUrl: 'https://example.test/completed',
    sourceTitle: 'Completed',
    result: {
      source: { url: 'https://example.test/completed', title: 'Completed' },
      content: { text: 'page text', truncated: false }
    }
  };
  await consumeClaimedLinkJob(completedJob, 'completed-token');
  assert.ok(events.some(event => event[0] === 'call-api'));
  assert.ok(events.some(event => event[0] === 'ack' && event[1] === 'completed-job'));
  assert.equal(events.some(event => event[0] === 'release'), false);

  events.length = 0;
  apiResult = false;
  await consumeClaimedLinkJob(completedJob, 'retry-token');
  assert.ok(events.some(event => event[0] === 'release' && event[1] === 'completed-job'));
  assert.equal(events.some(event => event[0] === 'ack'), false);
});

test('acknowledge and release reject success:false responses, while a successful release arms a foreground retry', async function () {
  const timers = [];
  const clearedTimers = [];
  const loaded = createSidebarContext({
    setTimeout(callback, delay) {
      const timer = { callback, delay, id: timers.length + 1 };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      clearedTimers.push(timer);
    }
  });
  const retryAt = Date.now() + 5000;
  const retryCalls = [];
  let responseMode = 'ack-failure';

  loaded.chrome.runtime.sendMessage = async function (message) {
    if (responseMode === 'ack-failure') return { success: false, reason: 'ACK_TOKEN_MISMATCH' };
    if (responseMode === 'release-failure') return { success: false, error: 'release denied' };
    return { success: true, retryAt };
  };
  loaded.context.__retryClaim = function () {
    retryCalls.push('claim');
    return Promise.resolve();
  };
  loaded.assign(`
    currentWindowId = 7;
    linkJobRetryTimers.clear();
    claimPendingLinkJobs = globalThis.__retryClaim;
  `);
  const acknowledgeClaimedLinkJob = loaded.getBinding('acknowledgeClaimedLinkJob');
  const releaseClaimedLinkJob = loaded.getBinding('releaseClaimedLinkJob');
  const job = { requestId: 'response-contract-job' };

  await assert.rejects(
    acknowledgeClaimedLinkJob(job, 'bad-ack-token'),
    error => error?.code === 'LINK_JOB_ACK_FAILED' && /ACK_TOKEN_MISMATCH/.test(error.message)
  );

  responseMode = 'release-failure';
  await assert.rejects(
    releaseClaimedLinkJob(job, 'bad-release-token', new Error('delivery failed')),
    error => error?.code === 'LINK_JOB_RELEASE_FAILED' && /release denied/.test(error.message)
  );
  assert.equal(timers.length, 0);

  responseMode = 'release-success';
  const beforeRelease = Date.now();
  await releaseClaimedLinkJob(job, 'good-token', new Error('retry delivery'));
  const afterRelease = Date.now();
  assert.equal(timers.length, 1);
  assert.ok(timers[0].delay >= Math.max(100, retryAt - afterRelease + 100));
  assert.ok(timers[0].delay <= Math.max(100, retryAt - beforeRelease + 100));
  assert.equal(loaded.getBinding('linkJobRetryTimers').has(job.requestId), true);

  timers[0].callback();
  await flushAsyncWork();
  assert.deepEqual(retryCalls, ['claim']);
  assert.equal(loaded.getBinding('linkJobRetryTimers').has(job.requestId), false);
  assert.deepEqual(clearedTimers, []);
});
