'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadBackground } = require('./helpers/background_vm.js');

function message(text, timestamp) {
  return { role: 'user', parts: [{ text }], timestamp };
}

test('legacy whole-array chat history migrates to indexed per-conversation records', async function () {
  const loaded = await loadBackground({
    localData: {
      geminiChatHistory: [
        [message('newest', 200)],
        [message('older', 100)]
      ]
    }
  });
  const readConversationStore = loaded.getBinding('readConversationStore');

  const records = await readConversationStore('chat');

  assert.deepEqual(Array.from(records, record => record.messages[0].parts[0].text), ['newest', 'older']);
  assert.equal(loaded.localData.geminiChatHistory, undefined);
  assert.equal(loaded.localData['gExtensionConversationIndex:v1:chat'].length, 2);
  assert.ok(loaded.localData['gExtensionConversation:v1:chat:chat-200']);
});

test('concurrent conversation upserts are serialized without losing either window update', async function () {
  const loaded = await loadBackground();
  const upsertConversation = loaded.getBinding('upsertConversation');
  const readConversationStore = loaded.getBinding('readConversationStore');

  await Promise.all([
    upsertConversation('chat', 'window-one', [message('one', 1)]),
    upsertConversation('chat', 'window-two', [message('two', 2)])
  ]);

  const records = await readConversationStore('chat');
  assert.deepEqual(new Set(records.map(record => record.id)), new Set(['window-one', 'window-two']));
});

test('conversation records enforce identity, content, and per-record size limits', async function () {
  const loaded = await loadBackground();
  const upsertConversation = loaded.getBinding('upsertConversation');

  await assert.rejects(upsertConversation('chat', '../escape', [message('x', 1)]), /identity/);
  await assert.rejects(upsertConversation('chat', 'empty', []), /empty/);
  await assert.rejects(
    upsertConversation('chat', 'oversized', [message('x'.repeat(600 * 1024), 1)]),
    /per-record storage limit/
  );
});

test('delete and clear mutate only the requested conversation kind', async function () {
  const loaded = await loadBackground();
  const upsertConversation = loaded.getBinding('upsertConversation');
  const readConversationStore = loaded.getBinding('readConversationStore');
  const deleteConversation = loaded.getBinding('deleteConversation');
  const clearConversationStore = loaded.getBinding('clearConversationStore');

  await upsertConversation('chat', 'chat-one', [message('chat', 1)]);
  await upsertConversation('archive', 'archive-one', [message('archive', 2)]);
  await deleteConversation('chat', 'chat-one');
  assert.equal((await readConversationStore('chat')).length, 0);
  assert.equal((await readConversationStore('archive')).length, 1);

  await clearConversationStore('archive');
  assert.equal((await readConversationStore('archive')).length, 0);
});
