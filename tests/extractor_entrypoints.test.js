'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const EXTRACTOR_CASES = [
  ['reader_content_extractor.js', 'reader'],
  ['page_content_extractor.js', 'visible'],
  ['regex_content_extractor.js', 'both'],
  ['link_content_extractor.js', 'reader']
];

function runScript(fileName, globals = {}) {
  const source = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
  return vm.runInNewContext(source, {
    Date,
    ...globals
  }, { filename: fileName });
}

for (const [fileName, expectedMode] of EXTRACTOR_CASES) {
  test(`${fileName} invokes the shared extraction core with ${expectedMode} mode`, function () {
    const calls = [];
    const expectedResult = { marker: fileName };
    const result = runScript(fileName, {
      GExtensionExtraction: {
        extract(options) {
          calls.push(options);
          return expectedResult;
        }
      }
    });

    assert.strictEqual(result, expectedResult);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ mode: expectedMode }]);
  });

  test(`${fileName} returns a complete structured failure when the core is unavailable`, function () {
    const result = runScript(fileName);

    assert.equal(result.schemaVersion, 1);
    assert.match(result.requestId, /^extract-[a-z0-9]+$/);
    assert.equal(result.ok, false);
    assert.equal(result.extraction.requestedMode, expectedMode);
    assert.equal(result.extraction.strategy, 'none');
    assert.equal(result.extraction.fallbackUsed, false);
    assert.deepEqual(JSON.parse(JSON.stringify(result.content)), {
      text: '',
      readerText: '',
      fullText: '',
      charCount: 0,
      truncated: false,
      anyTruncated: false,
      readerTruncated: false,
      fullTextTruncated: false
    });
    assert.equal(result.error.code, 'EXTRACTION_CORE_UNAVAILABLE');
    assert.equal(result.error.phase, 'setup');
    assert.equal(result.error.retryable, true);
    assert.doesNotThrow(() => new Date(result.source.capturedAt).toISOString());
  });
}

function loadRegexWorker(runRegexExtraction) {
  const listeners = new Map();
  const posted = [];
  const imported = [];
  const workerGlobal = {
    RegexEngine: { runRegexExtraction },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    postMessage(message) {
      posted.push(message);
    }
  };
  const context = vm.createContext({
    self: workerGlobal,
    importScripts(fileName) {
      imported.push(fileName);
    },
    Error,
    String
  });
  const source = fs.readFileSync(path.join(ROOT, 'regex_worker.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'regex_worker.js' });
  return { imported, listeners, posted };
}

test('regex worker loads the engine and forwards extraction responses', function () {
  const requests = [];
  const expected = { id: 'regex-1', ok: true, matches: ['first', 'second'] };
  const worker = loadRegexWorker(request => {
    requests.push(request);
    return expected;
  });

  assert.deepEqual(worker.imported, ['regex_engine.js']);
  const request = { id: 'regex-1', text: 'first\nsecond', pattern: '^.+$', flags: 'gm' };
  worker.listeners.get('message')({ data: request });

  assert.deepEqual(requests, [request]);
  assert.strictEqual(worker.posted[0], expected);
});

test('regex worker converts unexpected engine failures into correlated responses', function () {
  const worker = loadRegexWorker(() => {
    throw new Error('engine exploded');
  });

  worker.listeners.get('message')({ data: { id: 'regex-failure' } });

  assert.deepEqual(JSON.parse(JSON.stringify(worker.posted)), [{
    id: 'regex-failure',
    ok: false,
    matches: [],
    matchCount: 0,
    truncated: false,
    error: 'engine exploded'
  }]);
});

test('regex worker safely handles malformed message events', function () {
  const worker = loadRegexWorker(() => {
    throw 'non-error failure'; // eslint-disable-line no-throw-literal
  });

  worker.listeners.get('message')(null);

  assert.equal(worker.posted.length, 1);
  assert.equal(worker.posted[0].id, undefined);
  assert.equal(worker.posted[0].ok, false);
  assert.equal(worker.posted[0].error, 'non-error failure');
});
