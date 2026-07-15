'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PassThrough } = require('node:stream');

const {
  DevToolsPipe,
  REQUIRED_SMOKE_TESTS,
  resolveRequestPath,
  validateSmokeResults
} = require('./run_browser_smoke.js');

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

test('DevTools pipe correlates split and coalesced NUL-delimited responses', async function () {
  const input = new PassThrough();
  const output = new PassThrough();
  const writes = [];
  input.on('data', chunk => writes.push(Buffer.from(chunk)));
  const pipe = new DevToolsPipe(input, output);

  const first = pipe.send('Runtime.enable');
  const second = pipe.send('Runtime.evaluate', { expression: '1 + 1' }, 'session-1');
  await flush();
  const requests = Buffer.concat(writes)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(JSON.parse);
  assert.deepEqual(requests.map(request => request.id), [1, 2]);
  assert.equal(requests[1].sessionId, 'session-1');

  const responseBytes = Buffer.from(
    `${JSON.stringify({ id: 1, result: { enabled: true } })}\0` +
    `${JSON.stringify({ id: 2, result: { result: { value: 2 } } })}\0`
  );
  output.write(responseBytes.subarray(0, 7));
  output.write(responseBytes.subarray(7));

  assert.deepEqual(await first, { enabled: true });
  assert.deepEqual(await second, { result: { value: 2 } });
  pipe.close();
});

test('DevTools pipe rejects protocol errors and pending work on close', async function () {
  const input = new PassThrough();
  const output = new PassThrough();
  const pipe = new DevToolsPipe(input, output);

  const failedCommand = pipe.send('Target.createTarget');
  output.write(`${JSON.stringify({ id: 1, error: { message: 'target rejected' } })}\0`);
  await assert.rejects(failedCommand, /Target\.createTarget failed: target rejected/);

  const interruptedCommand = pipe.send('Runtime.evaluate');
  pipe.close(new Error('browser closed early'));
  await assert.rejects(interruptedCommand, /browser closed early/);
});

test('browser runner locks required smoke names and rejects path traversal', function () {
  const passingResults = REQUIRED_SMOKE_TESTS.map(name => ({ name, passed: true }));
  assert.deepEqual(validateSmokeResults(passingResults), []);
  assert.throws(
    () => validateSmokeResults(passingResults.slice(1)),
    /missing required tests/
  );
  assert.equal(
    resolveRequestPath('/tests/browser_harness.html'),
    path.resolve(__dirname, 'browser_harness.html')
  );
  assert.equal(resolveRequestPath('/..%2F..%2Fetc/passwd'), null);
  assert.equal(resolveRequestPath('/%E0%A4%A'), null);
});
