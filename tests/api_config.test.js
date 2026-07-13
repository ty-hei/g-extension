'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const api = require('../api_config');

test('Gemini requests keep API keys out of URLs and use the current header contract', function () {
  const request = api.buildGeminiRequest('secret-key', 'gemini-3.5-flash', 'streamGenerateContent', { stream: true });
  assert.equal(request.endpoint, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse');
  assert.equal(request.endpoint.includes('secret-key'), false);
  assert.equal(request.headers['x-goog-api-key'], 'secret-key');
});

test('remote OpenAI-compatible endpoints require HTTPS while loopback HTTP remains available for development', function () {
  assert.equal(
    api.normalizeOpenAiEndpoint('https://api.example.test/v1/chat/completions'),
    'https://api.example.test/v1/chat/completions'
  );
  assert.equal(
    api.normalizeOpenAiEndpoint('http://localhost:11434/v1/chat/completions'),
    'http://localhost:11434/v1/chat/completions'
  );
  assert.throws(
    () => api.normalizeOpenAiEndpoint('http://api.example.test/v1/chat/completions'),
    error => error.code === 'INSECURE_ENDPOINT'
  );
  assert.throws(
    () => api.normalizeOpenAiEndpoint('https://user:pass@example.test/v1/chat/completions'),
    error => error.code === 'ENDPOINT_CREDENTIALS'
  );
});

test('configuration snapshots are normalized and immutable', function () {
  const config = api.snapshotConfiguration({
    apiType: 'OPENAI',
    apiKey: ' key ',
    apiEndpoint: 'https://api.example.test/v1/chat/completions',
    modelName: ' model '
  });
  assert.deepEqual(config, {
    apiType: 'openai',
    apiKey: 'key',
    apiEndpoint: 'https://api.example.test/v1/chat/completions',
    modelName: 'model'
  });
  assert.equal(Object.isFrozen(config), true);
});
