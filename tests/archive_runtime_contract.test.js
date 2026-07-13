'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { clone, createArchiveVm } = require('./helpers/ui_vm');

function makeByteReader(text, options = {}) {
  const bytes = new TextEncoder().encode(text);
  const chunks = options.oneByteChunks
    ? [...bytes].map(byte => Uint8Array.of(byte))
    : [bytes];
  let index = 0;
  return {
    readCount: 0,
    async read() {
      this.readCount += 1;
      if (index >= chunks.length) return { done: true, value: undefined };
      return { done: false, value: chunks[index++] };
    }
  };
}

test('archive SSE preserves split UTF-8, accepts CRLF/no-space data, ignores invalid JSON, and stops at DONE', async function () {
  const loaded = await createArchiveVm();
  const stream = [
    'data:{"choices":[{"delta":{"content":"分"}}]}\r\n',
    'data: {"choices":[{"delta":{"content":"块"}}]}\r\n',
    'event: keepalive\r\n',
    'data:not-json\r\n',
    'data:[DONE]\r\n',
    'data:{"choices":[{"delta":{"content":"不应读取"}}]}\r\n'
  ].join('');
  const reader = makeByteReader(stream, { oneByteChunks: true });
  const payloads = [];

  await loaded.exports.consumeArchiveSse(reader, { abort() {} }, payload => payloads.push(clone(payload)));

  assert.deepEqual(payloads, [
    { choices: [{ delta: { content: '分' } }] },
    { choices: [{ delta: { content: '块' } }] }
  ]);
  assert.ok(reader.readCount < new TextEncoder().encode(stream).length, '[DONE] must stop further reads');
});

test('archive SSE flushes a final data line even when EOF has no newline', async function () {
  const loaded = await createArchiveVm();
  const reader = makeByteReader('data:{"tail":true}');
  const payloads = [];

  await loaded.exports.consumeArchiveSse(reader, { abort() {} }, payload => payloads.push(clone(payload)));
  assert.deepEqual(payloads, [{ tail: true }]);
});

test('archive stream idle timeout aborts the controller and rejects the pending read', async function () {
  const timers = [];
  const cleared = [];
  const loaded = await createArchiveVm({
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      cleared.push(timer);
    }
  });
  let abortCount = 0;
  const reader = { read: () => new Promise(() => {}) };
  const controller = { abort: () => { abortCount += 1; } };

  const pending = loaded.exports.readArchiveStreamChunk(reader, controller);
  const idleTimer = timers.find(timer => timer.delay === 30000);
  assert.ok(idleTimer, 'the 30-second stream idle timer must be armed');
  idleTimer.callback();

  await assert.rejects(pending, error => error?.name === 'TimeoutError');
  assert.equal(abortCount, 1);
  assert.ok(cleared.includes(idleTimer));
});

test('archive history filters internal messages and enforces the 40k newest-first budget', async function () {
  const loaded = await createArchiveVm();
  const history = [
    { role: 'user', parts: [{ text: 'A'.repeat(25000) }] },
    { role: 'model', parts: [{ text: 'temporary' }], isTempStatus: true },
    { role: 'model', parts: [{ text: 'thinking' }], isThinking: true },
    { role: 'user', parts: [{ text: 'raw webpage' }], excludeFromApiHistory: true },
    { role: 'model', parts: [{ text: 'B'.repeat(30000) }] }
  ];

  const openai = clone(loaded.exports.buildBoundedArchiveHistory(history, 'openai'));
  assert.equal(openai.length, 2);
  assert.deepEqual(openai.map(message => message.role), ['user', 'assistant']);
  assert.equal(openai[0].content, 'A'.repeat(10000));
  assert.equal(openai[1].content, 'B'.repeat(30000));
  assert.equal(JSON.stringify(openai).includes('raw webpage'), false);
  assert.equal(JSON.stringify(openai).includes('thinking'), false);

  const gemini = clone(loaded.exports.buildBoundedArchiveHistory([
    { role: 'user', parts: [{ text: 'question' }] },
    { role: 'model', parts: [{ text: 'answer' }] }
  ], 'gemini'));
  assert.deepEqual(gemini, [
    { role: 'user', parts: [{ text: 'question' }] },
    { role: 'model', parts: [{ text: 'answer' }] }
  ]);
});

test('archive API snapshots the visible history, avoids duplicating the current user turn, and persists HTTP errors', async function () {
  const requests = [];
  const loaded = await createArchiveVm({
    apiConfigurations: [{
      id: 'active-test-config',
      apiKey: 'test-key',
      apiType: 'openai',
      apiEndpoint: 'https://api.example.test/v1/chat/completions',
      modelName: 'test-model'
    }],
    activeConfigurationId: 'active-test-config',
    fetch: async function (_url, init) {
      requests.push(JSON.parse(init.body));
      return { ok: false, status: 503 };
    }
  });
  const chat = [
    { role: 'user', parts: [{ text: 'earlier question' }], timestamp: 100 },
    { role: 'model', parts: [{ text: 'earlier answer' }], timestamp: 101 },
    { role: 'model', parts: [{ text: 'internal thinking' }], timestamp: 102, isThinking: true },
    { role: 'user', parts: [{ text: 'current question' }], timestamp: 200 }
  ];
  loaded.exports.setArchivedChats([chat]);

  assert.equal(await loaded.exports.callApi('current question', chat), false);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].messages, [
    { role: 'user', content: 'earlier question' },
    { role: 'assistant', content: 'earlier answer' },
    { role: 'user', content: 'current question' }
  ]);
  assert.equal(JSON.stringify(requests[0]).includes('internal thinking'), false);
  assert.equal(chat.filter(message => message.parts?.[0]?.text === 'current question').length, 1);
  assert.equal(chat.at(-1).parts[0].text, 'Error: HTTP 503');
  assert.equal(
    loaded.storageWrites.at(-1).messages.at(-1).parts[0].text,
    'Error: HTTP 503'
  );
});

test('archive UUID stays stable across replacement and storage-change rebinding', async function () {
  const loaded = await createArchiveVm();
  const original = [
    { role: 'user', parts: [{ text: 'original' }], timestamp: 1 },
    { role: 'model', parts: [{ text: 'answer' }], timestamp: 2 }
  ];
  const identity = loaded.exports.getChatIdentity(original);
  assert.equal(identity, 'archive-test-uuid-1');
  assert.equal(loaded.exports.getChatIdentity(original), identity);

  loaded.exports.setArchivedChats([original]);
  loaded.exports.setActiveChat(original);
  const replacement = [
    { role: 'user', parts: [{ text: 'replacement' }], timestamp: 1, archiveConversationId: identity },
    { role: 'model', parts: [{ text: 'new answer' }], timestamp: 3 }
  ];
  loaded.exports.persistArchivedChat(replacement, identity);

  assert.equal(loaded.exports.getArchivedChats()[0], replacement);
  assert.equal(loaded.exports.getActiveChat(), replacement);
  assert.equal(loaded.exports.getActiveChatIdentity(), identity);
  assert.equal(loaded.storageWrites.at(-1).messages[0].parts[0].text, 'replacement');

  const externallyUpdated = clone(replacement);
  externallyUpdated.push({ role: 'user', parts: [{ text: 'external append' }], timestamp: 4 });
  await loaded.exports.triggerStoreChange([externallyUpdated]);
  assert.equal(loaded.exports.getActiveChat()[2].parts[0].text, 'external append');
  assert.equal(loaded.exports.getActiveChatIdentity(), identity);
});

test('archive send guard prevents concurrent requests and restores controls after completion', async function () {
  const loaded = await createArchiveVm();
  const chat = [{ role: 'user', parts: [{ text: 'seed' }], timestamp: 1 }];
  loaded.exports.setArchivedChats([chat]);
  loaded.exports.setActiveChat(chat);
  loaded.exports.setRenderChatDetails(function () {});

  let resolveRequest;
  let apiCalls = 0;
  loaded.exports.setCallApi(function () {
    apiCalls += 1;
    return new Promise(resolve => {
      resolveRequest = resolve;
    });
  });
  loaded.elements.chatInput.value = 'first follow-up';
  const firstRequest = loaded.exports.handleSendMessage();
  assert.equal(loaded.exports.getRequestInFlight(), true);
  assert.equal(loaded.elements.sendButton.disabled, true);
  assert.equal(loaded.elements.chatInput.disabled, true);

  loaded.elements.chatInput.value = 'second follow-up';
  const overlappingRequest = loaded.exports.handleSendMessage();
  await overlappingRequest;
  assert.equal(apiCalls, 1);
  assert.equal(chat.filter(message => message.parts[0].text === 'first follow-up').length, 1);
  assert.equal(chat.some(message => message.parts[0].text === 'second follow-up'), false);

  resolveRequest(true);
  await firstRequest;
  assert.equal(loaded.exports.getRequestInFlight(), false);
  assert.equal(loaded.elements.sendButton.disabled, false);
  assert.equal(loaded.elements.chatInput.disabled, false);
});

test('archive Markdown rendering never forwards the sidebar-only options-link trust flag', async function () {
  const calls = [];
  const loaded = await createArchiveVm({
    renderSafeMarkdown(...args) {
      calls.push(args.map(clone));
      return String(args[0]);
    }
  });
  const chat = [{
    role: 'model',
    parts: [{ text: '<a id="open-options-link">untrusted archived model text</a>' }],
    timestamp: 1,
    trustedOptionsLink: true
  }];

  loaded.exports.renderChatDetails(chat, 'Trust boundary');
  assert.deepEqual(calls, [[chat[0].parts[0].text]]);
});

test('archive rolls back a partial stream that ends without a completion marker', async function () {
  const bytes = new TextEncoder().encode('data:{"choices":[{"delta":{"content":"partial"}}]}\n');
  let readCount = 0;
  const loaded = await createArchiveVm({
    apiConfigurations: [{
      id: 'active-test-config',
      apiKey: 'test-key',
      apiType: 'openai',
      apiEndpoint: 'https://api.example.test/v1/chat/completions',
      modelName: 'test-model'
    }],
    activeConfigurationId: 'active-test-config',
    fetch: async function () {
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                readCount += 1;
                return readCount === 1
                  ? { done: false, value: bytes }
                  : { done: true, value: undefined };
              },
              async cancel() {}
            };
          }
        }
      };
    }
  });
  const chat = [{ role: 'user', parts: [{ text: 'question' }], timestamp: 1 }];
  loaded.exports.setArchivedChats([chat]);

  assert.equal(await loaded.exports.callApi('question', chat), false);
  assert.equal(chat.some(message => message.parts?.[0]?.text === 'partial'), false);
  assert.match(chat.at(-1).parts[0].text, /completion marker/);
  assert.equal(chat.at(-1).excludeFromApiHistory, true);
});
