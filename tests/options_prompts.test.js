'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clone,
  createOptionsVm,
  createPromptsVm
} = require('./helpers/settings_vm');

test('options preserves regex literal flags when the flags field is empty and rejects unknown literal flags', async function () {
  const loaded = await createOptionsVm({
    syncData: {
      interfaceLanguage: 'en',
      advancedRegexExtractionEnabled: true,
      advancedRegexPattern: '/pattern/is',
      advancedRegexFlags: ''
    }
  });

  assert.equal(loaded.elements.get('regexFlags').value, '');
  assert.deepEqual(clone(loaded.exports.validateRegexSettings()), {
    pattern: 'pattern',
    flags: 'is',
    useFullPageText: false
  });

  loaded.elements.get('regexPattern').value = '/pattern/z';
  loaded.elements.get('regexFlags').value = '';
  assert.throws(
    () => loaded.exports.validateRegexSettings(),
    /Invalid regex flags/
  );
});

test('options sends the OpenAI-compatible connection-test request and renders structured API errors', async function () {
  const loaded = await createOptionsVm({
    fetch: async function () {
      return {
        ok: false,
        status: 429,
        async text() {
          return JSON.stringify({ error: { message: 'rate limited' } });
        }
      };
    }
  });
  loaded.elements.get('apiType').value = 'openai';
  loaded.elements.get('apiEndpoint').value = 'https://api.example.test/v1/chat/completions';
  loaded.elements.get('apiKey').value = 'secret-key';
  loaded.elements.get('modelName').value = 'test-model';

  await loaded.elements.get('testConfigButton').dispatch('click');

  assert.equal(loaded.fetchCalls.length, 1);
  const request = loaded.fetchCalls[0];
  assert.equal(request.url, 'https://api.example.test/v1/chat/completions');
  assert.equal(request.init.method, 'POST');
  assert.deepEqual(request.init.headers, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer secret-key'
  });
  assert.deepEqual(JSON.parse(request.init.body), {
    model: 'test-model',
    messages: [{ role: 'user', content: 'Test' }],
    max_tokens: 1
  });
  assert.equal(loaded.elements.get('status').style.color, 'red');
  assert.match(loaded.elements.get('status').textContent, /\(429\) rate limited/);
});

test('prompt migration canonicalizes reserved preset IDs while retaining custom prompts as inert text', async function () {
  const customName = '<img src=x onerror=alert(1)>';
  const customContent = '<script>globalThis.pwned = true</script>\n{{text}}';
  const loaded = await createPromptsVm({
    syncData: { interfaceLanguage: 'en' },
    localData: {
      promptTemplates: [
        {
          id: 'preset-translate',
          name: 'Hijacked preset',
          content: '<img src=x>',
          isPreset: false
        },
        {
          id: 'custom-safe',
          name: customName,
          content: customContent,
          isPreset: true
        }
      ]
    }
  });

  const stored = loaded.localData.promptTemplates;
  assert.deepEqual(stored.slice(0, 2), [
    {
      id: 'preset-translate',
      name: 'Translate',
      content: 'Please translate the following text to [Target Language, e.g. Chinese]:\n\n{{text}}',
      isPreset: true
    },
    {
      id: 'preset-summarize',
      name: 'Summarize',
      content: 'Please summarize the key points of the following text:\n\n{{text}}',
      isPreset: true
    }
  ]);
  assert.deepEqual(stored[2], {
    id: 'custom-safe',
    name: customName,
    content: customContent,
    isPreset: false
  });

  const item = loaded.elements.get('promptList').children.find(
    element => element.dataset.id === 'custom-safe'
  );
  assert.ok(item);
  const nameElement = item.children[0].children[0];
  const contentElement = item.children[1];
  assert.equal(nameElement.textContent, customName);
  assert.equal(contentElement.textContent, customContent);
  assert.equal(nameElement.children.length, 0);
  assert.equal(contentElement.children.length, 0);
  assert.equal(loaded.context.pwned, undefined);
});
