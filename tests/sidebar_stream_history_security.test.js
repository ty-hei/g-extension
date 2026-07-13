'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clone,
  createFakeElement,
  createSidebarVm
} = require('./helpers/ui_vm');

function installApiStubs(loaded, messages, updates = []) {
  loaded.context.__apiTestStubs = {
    isComplete() {
      return true;
    },
    add(message) {
      const stored = clone(message);
      messages.push(stored);
      return message;
    },
    translate(key) {
      return key;
    },
    remove() {},
    update(text) {
      updates.push(text);
    },
    finalize() {},
    save() {}
  };
  loaded.context.__chatOutputStub = { lastElementChild: createFakeElement('div') };
  loaded.assign(`
    currentApiKey = 'test-key';
    currentApiType = 'openai';
    currentApiEndpoint = 'https://api.example.test/v1/chat/completions';
    currentModelName = 'test-model';
    currentLanguage = 'en';
    chatOutput = globalThis.__chatOutputStub;
    isCurrentApiConfigComplete = globalThis.__apiTestStubs.isComplete;
    addMessageToChat = globalThis.__apiTestStubs.add;
    removeMessageByContentCheck = globalThis.__apiTestStubs.remove;
    updateStreamingMessage = globalThis.__apiTestStubs.update;
    finalizeStreamingMessage = globalThis.__apiTestStubs.finalize;
    saveCurrentChat = globalThis.__apiTestStubs.save;
    t = globalThis.__apiTestStubs.translate;
  `);
}

function makeByteReader(text, options = {}) {
  const bytes = new TextEncoder().encode(text);
  const chunks = options.oneByteChunks
    ? [...bytes].map(byte => Uint8Array.of(byte))
    : [bytes];
  let index = 0;
  return {
    readCount: 0,
    cancelCount: 0,
    async read() {
      this.readCount += 1;
      if (index >= chunks.length) return { done: true, value: undefined };
      return { done: false, value: chunks[index++] };
    },
    async cancel() {
      this.cancelCount += 1;
    }
  };
}

test('sidebar SSE accepts no-space data fields, CRLF, split UTF-8 bytes, and stops at DONE', async function () {
  const messages = [];
  const updates = [];
  const stream = [
    'data:{"choices":[{"delta":{"content":"你"}}]}\r\n',
    'data: {"choices":[{"delta":{"content":"好"}}]}\r\n',
    'data:not-json\r\n',
    'data:[DONE]\r\n',
    'data:{"choices":[{"delta":{"content":"不应读取"}}]}\r\n'
  ].join('');
  const reader = makeByteReader(stream, { oneByteChunks: true });
  const loaded = createSidebarVm({
    fetch: async function () {
      return {
        ok: true,
        status: 200,
        body: { getReader: () => reader }
      };
    }
  });
  installApiStubs(loaded, messages, updates);

  const performApiCall = loaded.get('performApiCall');
  assert.equal(await performApiCall('hello', false, null, false, []), true);

  const streamedMessage = messages.find(message =>
    message.role === 'model' && !message.isThinking && message.parts?.[0]?.text === ''
  );
  assert.ok(streamedMessage, 'the stream should create one model message');
  assert.equal(streamedMessage.parts[0].text, '');
  assert.equal(reader.cancelCount, 1);
  assert.ok(reader.readCount < new TextEncoder().encode(stream).length, '[DONE] must stop further reads');
  assert.equal(updates.at(-1), '你好');
  assert.equal(updates.some(text => text.includes('不应读取')), false);
});

test('untrusted webpage requests exclude prior chat history and add a safety instruction', async function () {
  const requests = [];
  const messages = [];
  const loaded = createSidebarVm({
    fetch: async function (_url, init) {
      requests.push(JSON.parse(init.body));
      return {
        ok: false,
        status: 500,
        async text() {
          return '{"error":{"message":"expected test stop"}}';
        }
      };
    }
  });
  installApiStubs(loaded, messages);
  const performApiCall = loaded.get('performApiCall');
  const history = [{ role: 'user', parts: [{ text: 'PRIVATE PRIOR CHAT' }], timestamp: 1 }];

  assert.equal(await performApiCall('ordinary question', false, null, false, history), false);
  assert.equal(await performApiCall('UNTRUSTED PAGE', false, null, true, history), false);
  assert.equal(await performApiCall('SUMMARY PAGE', true, null, false, history), false);

  assert.equal(requests[0].messages.some(message => JSON.stringify(message).includes('PRIVATE PRIOR CHAT')), true);
  for (const request of requests.slice(1)) {
    assert.equal(request.messages.some(message => JSON.stringify(message).includes('PRIVATE PRIOR CHAT')), false);
    assert.equal(request.messages[0].role, 'system');
    assert.match(request.messages[0].content, /SafetyInstruction$/);
  }
  assert.equal(JSON.stringify(requests[1]).includes('UNTRUSTED PAGE'), true);
  assert.equal(JSON.stringify(requests[2]).includes('SUMMARY PAGE'), true);
});

test('only locally generated 401/403 errors receive the trusted options-link marker', async function () {
  let status = 401;
  const messages = [];
  const loaded = createSidebarVm({
    fetch: async function () {
      return {
        ok: false,
        get status() {
          return status;
        },
        async text() {
          return '{"error":{"message":"server detail"}}';
        }
      };
    }
  });
  installApiStubs(loaded, messages);
  const performApiCall = loaded.get('performApiCall');

  await performApiCall('auth request', false, null, false, []);
  const authError = messages.at(-1);
  assert.equal(authError.trustedOptionsLink, true);
  assert.match(authError.parts[0].text, /id="open-options-link"/);

  status = 429;
  await performApiCall('rate request', false, null, false, []);
  const rateError = messages.at(-1);
  assert.equal(rateError.trustedOptionsLink, false);
  assert.doesNotMatch(rateError.parts[0].text, /open-options-link/);

  status = 500;
  await performApiCall('<a id="open-options-link">model text</a>', false, null, false, []);
  const serverError = messages.at(-1);
  assert.equal(serverError.trustedOptionsLink, false);
});

test('sidebar Markdown rendering enables the options-link ID only for explicitly trusted messages', function () {
  const renderCalls = [];
  const loaded = createSidebarVm();
  loaded.context.__renderCalls = renderCalls;
  loaded.context.__renderer = function (text, options) {
    renderCalls.push([text, clone(options)]);
    return String(text);
  };
  loaded.context.__output = createFakeElement('div');
  loaded.assign(`
    renderSafeMarkdown = globalThis.__renderer;
    chatOutput = globalThis.__output;
    setupOnboardingVisible = false;
    currentChat = [
      { role: 'model', parts: [{ text: 'untrusted model markdown' }], timestamp: 1 },
      { role: 'model', parts: [{ text: 'trusted local error' }], timestamp: 2, trustedOptionsLink: true },
      { role: 'model', parts: [{ text: 'temporary status' }], timestamp: 3, isTempStatus: true },
      { role: 'user', parts: [{ text: 'user text' }], timestamp: 4 }
    ];
  `);

  loaded.get('renderCurrentChat')();
  assert.deepEqual(renderCalls, [
    ['untrusted model markdown', { allowOptionsLink: false }],
    ['trusted local error', { allowOptionsLink: true }]
  ]);
});

test('total API timeout aborts a pending request and reports the timeout-specific error', async function () {
  const timers = [];
  const cleared = [];
  const messages = [];
  const loaded = createSidebarVm({
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      cleared.push(timer);
    },
    fetch(_url, init) {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }
  });
  installApiStubs(loaded, messages);
  const pending = loaded.get('performApiCall')('will timeout', false, null, false, []);
  const totalTimer = timers.find(timer => timer.delay === 120000);
  assert.ok(totalTimer, 'the two-minute total request timer must be armed');
  totalTimer.callback();

  assert.equal(await pending, false);
  assert.equal(messages.at(-1).parts[0].text, 'apiTimeout');
  assert.ok(cleared.includes(totalTimer));
});
