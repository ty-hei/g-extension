'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadBackground } = require('./helpers/background_vm.js');

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function invokeMessage(listener, request, sender) {
  const responses = [];
  const returnValue = listener(request, sender, response => responses.push(response));
  return { responses, returnValue };
}

function makeJob(requestId, overrides = {}) {
  return {
    schemaVersion: 1,
    requestId,
    windowId: 7,
    sourceUrl: `https://example.test/${requestId}`,
    sourceTitle: requestId,
    status: 'creating',
    createdAt: Date.now(),
    deadline: Date.now() + 30000,
    ...overrides
  };
}

test('high-privilege message actions enforce sidebar and content-script sender allowlists', async function () {
  const loaded = await loadBackground();
  const listener = loaded.events.runtimeOnMessage.listeners[0];
  assert.equal(typeof listener, 'function');

  const contentSender = {
    id: loaded.extensionId,
    frameId: 0,
    url: 'https://example.test/page',
    tab: { id: 11, windowId: 7, url: 'https://example.test/page' }
  };
  const sidebarSender = {
    id: loaded.extensionId,
    url: loaded.chrome.runtime.getURL('sidebar.html')
  };

  for (const action of [
    'getAndSummarizePage',
    'extractActiveTabContent',
    'extractActiveTabRegexSource',
    'listLinkJobsForWindow',
    'claimLinkJob',
    'ackLinkJob',
    'releaseLinkJob'
  ]) {
    const attempted = invokeMessage(listener, { action, windowId: 7 }, contentSender);
    assert.equal(attempted.returnValue, false, action);
    assert.deepEqual(toPlain(attempted.responses), [{ success: false, error: 'Unauthorized sidebar action.' }], action);
  }

  for (const action of [
    'openSidePanel',
    'shouldCaptureSelection',
    'TEXT_SELECTED_FROM_PAGE',
    'summarizeLinkTarget'
  ]) {
    const attempted = invokeMessage(listener, { action, url: 'https://example.test/link' }, sidebarSender);
    assert.equal(attempted.returnValue, false, action);
    assert.deepEqual(toPlain(attempted.responses), [{ success: false, error: 'Unauthorized content-script action.' }], action);
  }

  const subframeAttempt = invokeMessage(
    listener,
    { action: 'shouldCaptureSelection' },
    { ...contentSender, frameId: 2 }
  );
  assert.deepEqual(toPlain(subframeAttempt.responses), [{ success: false, error: 'Unauthorized content-script action.' }]);

  const allowedSidebar = invokeMessage(
    listener,
    { action: 'listLinkJobsForWindow', windowId: 'not-an-integer' },
    sidebarSender
  );
  assert.deepEqual(toPlain(allowedSidebar.responses), [{ success: false, error: 'A valid windowId is required.' }]);

  const allowedContent = invokeMessage(listener, { action: 'shouldCaptureSelection' }, contentSender);
  assert.deepEqual(toPlain(allowedContent.responses), [{ capture: false }]);

  const archiveSender = {
    id: loaded.extensionId,
    url: loaded.chrome.runtime.getURL('archive.html'),
    tab: { id: 31, windowId: 7 }
  };
  const isConversationPageSender = loaded.getBinding('isConversationPageSender');
  assert.equal(isConversationPageSender(archiveSender), true);
  assert.equal(isConversationPageSender(contentSender), false);

  const deniedStoreAction = invokeMessage(
    listener,
    { action: 'conversationStoreClear', kind: 'chat' },
    contentSender
  );
  assert.deepEqual(
    toPlain(deniedStoreAction.responses),
    [{ success: false, error: 'Unauthorized conversation-store action.' }]
  );
});

test('summarizeLinkTarget ignores caller requestId and generates the job identity in background', async function () {
  const loaded = await loadBackground();
  const listener = loaded.events.runtimeOnMessage.listeners[0];
  const sender = {
    id: loaded.extensionId,
    frameId: 0,
    url: 'https://source.example/page',
    tab: { id: 20, windowId: 7, url: 'https://source.example/page' }
  };

  const invocation = invokeMessage(listener, {
    action: 'summarizeLinkTarget',
    requestId: 'caller-controlled-id',
    url: 'https://target.example/article',
    linkText: 'Target article'
  }, sender);

  assert.equal(invocation.returnValue, false);
  assert.equal(invocation.responses.length, 1);
  assert.equal(invocation.responses[0].accepted, true);
  assert.match(invocation.responses[0].requestId, /^link-/);
  assert.notEqual(invocation.responses[0].requestId, 'caller-controlled-id');

  await loaded.flush();
  const generatedId = invocation.responses[0].requestId;
  assert.equal(loaded.sessionData[`gExtensionLinkJob:${generatedId}`].requestId, generatedId);
  assert.equal(loaded.sessionData['gExtensionLinkJob:caller-controlled-id'], undefined);
});

test('link extraction rejects loopback, private, link-local, and credential-bearing targets', async function () {
  const loaded = await loadBackground();
  const validatePageUrl = loaded.getBinding('validatePageUrl');
  const options = { allowFile: false, allowPrivateNetwork: false };

  for (const url of [
    'http://localhost/admin',
    'http://127.0.0.1/admin',
    'http://10.0.0.1/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/'
  ]) {
    assert.throws(() => validatePageUrl(url, options), /not supported/);
  }
  assert.throws(() => validatePageUrl('https://user:pass@example.test/', options), /credentials/);
  assert.equal(validatePageUrl('https://example.test/article', options), 'https://example.test/article');
});

test('active-tab extraction rejects a result produced after the page navigates', async function () {
  const loaded = await loadBackground({
    injectionResults: [{
      frameId: 0,
      documentId: 'document-after-navigation',
      result: {
        schemaVersion: 1,
        ok: true,
        extraction: { mode: 'visible' },
        content: {
          text: 'Content from the replacement page',
          readerText: '',
          fullText: 'Content from the replacement page',
          charCount: 33,
          truncated: false,
          readerTruncated: false,
          fullTextTruncated: false
        },
        source: { url: 'https://example.test/replacement', title: 'Replacement' },
        metadata: {},
        warnings: [],
        error: null
      }
    }]
  });
  const executeExtractor = loaded.getBinding('executeExtractor');

  await assert.rejects(
    executeExtractor(42, 'visible', 'request-navigation-race', 'https://example.test/original'),
    error => error &&
      error.code === 'EXTRACTION_DOCUMENT_CHANGED' &&
      /navigated/.test(error.message)
  );
});

test('a timeout alarm and creating job are persisted before a temporary tab is opened', async function () {
  const loaded = await loadBackground();
  const startLinkExtractionJob = loaded.getBinding('startLinkExtractionJob');
  loaded.operations.length = 0;

  const requestId = await startLinkExtractionJob({
    requestId: 'link-order-contract',
    url: 'https://target.example/order',
    title: 'Order contract',
    windowId: 7
  });

  assert.equal(requestId, 'link-order-contract');
  const timeoutAlarmIndex = loaded.operations.findIndex(operation =>
    operation.type === 'alarms.create' && operation.name === 'gExtensionLinkJobTimeout:link-order-contract'
  );
  const admissionWriteIndex = loaded.operations.findIndex(operation =>
    operation.type === 'storage.session.set' &&
    operation.values?.['gExtensionLinkJob:link-order-contract']?.status === 'creating'
  );
  const tabCreateIndex = loaded.operations.findIndex(operation => operation.type === 'tabs.create');

  assert.ok(timeoutAlarmIndex >= 0);
  assert.ok(admissionWriteIndex > timeoutAlarmIndex);
  assert.ok(tabCreateIndex > admissionWriteIndex);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['link-order-contract'].status, 'loading');
  assert.equal(loaded.sessionData['gExtensionLinkJob:link-order-contract'].status, 'loading');
});

test('link-job admission enforces the concurrent-active limit through the compact index', async function () {
  const loaded = await loadBackground();
  const admitLinkJob = loaded.getBinding('admitLinkJob');

  await admitLinkJob(makeJob('job-one'));
  await admitLinkJob(makeJob('job-two', { status: 'loading', tabId: 201 }));
  await admitLinkJob(makeJob('job-three', { status: 'extracting', tabId: 202 }));

  await assert.rejects(
    admitLinkJob(makeJob('job-four')),
    error => error && error.code === 'LINK_CONCURRENCY_LIMIT' && /At most 3/.test(error.message)
  );

  const index = loaded.sessionData.gExtensionLinkJobIndex;
  assert.deepEqual(Object.keys(index).sort(), ['job-one', 'job-three', 'job-two']);
  assert.equal(index['job-one'].status, 'creating');
  assert.equal(index['job-two'].status, 'loading');
  assert.equal(index['job-three'].status, 'extracting');
  assert.equal(loaded.sessionData['gExtensionLinkJob:job-four'], undefined);
});

test('a full link-job storage budget rejects admission without persisting a rejected job', async function () {
  const loaded = await loadBackground({
    storageBytesInUse: 7 * 1024 * 1024
  });
  const startLinkExtractionJob = loaded.getBinding('startLinkExtractionJob');
  loaded.operations.length = 0;

  const requestId = await startLinkExtractionJob({
    requestId: 'budget-rejected-job',
    url: 'https://target.example/storage-full',
    title: 'Storage full',
    windowId: 7
  });

  assert.equal(requestId, 'budget-rejected-job');
  assert.equal(loaded.sessionData['gExtensionLinkJob:budget-rejected-job'], undefined);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['budget-rejected-job'], undefined);
  assert.equal(loaded.operations.some(operation => operation.type === 'tabs.create'), false);
  assert.equal(loaded.operations.some(operation =>
    operation.type === 'storage.session.set' &&
    operation.values?.['gExtensionLinkJob:budget-rejected-job']
  ), false);

  const messages = loaded.operations
    .filter(operation => operation.type === 'runtime.sendMessage')
    .map(operation => operation.message);
  assert.deepEqual(messages.map(message => message.type), ['LINK_EXTRACTION_JOB_EPHEMERAL_FAILURE']);
  assert.equal(messages[0].requestId, 'budget-rejected-job');
  assert.equal(messages[0].windowId, 7);
  assert.match(messages[0].error, /storage is temporarily full/i);
  assert.ok(loaded.operations.some(operation =>
    operation.type === 'alarms.clear' &&
    operation.name === 'gExtensionLinkJobTimeout:budget-rejected-job'
  ));
});

test('every late terminal failure is normalized to TIMEOUT at the shared finalization boundary', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const failLinkJob = loaded.getBinding('failLinkJob');

  for (const code of ['OPEN_LINK_FAILED', 'TAB_CLOSED', 'INJECTION_FAILED', 'PARSE_FAILED']) {
    const requestId = `late-${code.toLowerCase()}`;
    await writeLinkJob(makeJob(requestId, {
      status: 'extracting',
      deadline: Date.now() - 1000
    }));

    const terminalJob = await failLinkJob(requestId, code, `late ${code}`, false);
    assert.equal(terminalJob.status, 'failed', code);
    assert.equal(terminalJob.error.code, 'TIMEOUT', code);
    assert.equal(terminalJob.error.phase, 'link-extraction', code);
    assert.equal(terminalJob.error.retryable, true, code);
    assert.notEqual(terminalJob.error.message, `late ${code}`, code);
    assert.equal(
      loaded.sessionData[`gExtensionLinkJob:${requestId}`].error.code,
      'TIMEOUT',
      code
    );
    assert.equal(loaded.sessionData.gExtensionLinkJobIndex[requestId].status, 'failed', code);
    assert.equal(loaded.sessionData.gExtensionLinkJobIndex[requestId].reservedBytes, 0, code);
  }
});

test('claim, release, and acknowledge require matching window and token and update storage atomically', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const readLinkJob = loaded.getBinding('readLinkJob');
  const claimLinkJob = loaded.getBinding('claimLinkJob');
  const releaseLinkJob = loaded.getBinding('releaseLinkJob');
  const acknowledgeLinkJob = loaded.getBinding('acknowledgeLinkJob');

  await writeLinkJob(makeJob('release-job', {
    status: 'completed',
    completedAt: Date.now(),
    result: { content: { text: 'ready' } }
  }));

  const wrongWindowClaim = await claimLinkJob('release-job', 8);
  assert.equal(wrongWindowClaim.claimed, false);
  assert.equal(wrongWindowClaim.reason, 'NOT_CLAIMABLE');

  const claim = await claimLinkJob('release-job', 7);
  assert.equal(claim.claimed, true);
  assert.match(claim.claimToken, /^claim-/);
  assert.equal((await claimLinkJob('release-job', 7)).reason, 'ALREADY_CLAIMED');
  assert.equal(await acknowledgeLinkJob('release-job', 'wrong-token', 7), false);
  assert.equal(await releaseLinkJob('release-job', claim.claimToken, 8, 'wrong window'), false);

  const deliveryError = 'x'.repeat(700);
  assert.equal(await releaseLinkJob('release-job', claim.claimToken, 7, deliveryError), true);
  const released = await readLinkJob('release-job');
  assert.equal(released.claim, null);
  assert.equal(released.deliveryAttempts, 1);
  assert.equal(released.lastDeliveryError.length, 500);
  assert.ok(released.retryAfter > Date.now());
  const retryClaim = await claimLinkJob('release-job', 7);
  assert.equal(retryClaim.claimed, false);
  assert.equal(retryClaim.reason, 'RETRY_LATER');

  await writeLinkJob(makeJob('ack-job', {
    status: 'failed',
    completedAt: Date.now(),
    error: { code: 'TEST', message: 'failed' }
  }));
  const ackClaim = await claimLinkJob('ack-job', 7);
  assert.equal(ackClaim.claimed, true);
  assert.equal(await acknowledgeLinkJob('ack-job', ackClaim.claimToken, 7), true);
  assert.equal(await readLinkJob('ack-job'), null);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['ack-job'], undefined);
  assert.ok(loaded.operations.some(operation =>
    operation.type === 'alarms.clear' && operation.name === 'gExtensionLinkJobCleanup:ack-job'
  ));
});

test('claim and release schedule delivery alarms at their lease and retry boundaries', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const claimLinkJob = loaded.getBinding('claimLinkJob');
  const releaseLinkJob = loaded.getBinding('releaseLinkJob');

  await writeLinkJob(makeJob('delivery-schedule-job', {
    status: 'completed',
    completedAt: Date.now(),
    result: { content: { text: 'ready' } }
  }));
  loaded.operations.length = 0;

  const claim = await claimLinkJob('delivery-schedule-job', 7);
  const claimAlarm = loaded.operations.find(operation =>
    operation.type === 'alarms.create' &&
    operation.name === 'gExtensionLinkJobDelivery:delivery-schedule-job'
  );
  assert.ok(claimAlarm);
  assert.equal(claimAlarm.alarmInfo.when, claim.job.claim.expiresAt);

  loaded.operations.length = 0;
  assert.equal(await releaseLinkJob('delivery-schedule-job', claim.claimToken, 7, 'retry delivery'), true);
  const released = loaded.sessionData['gExtensionLinkJob:delivery-schedule-job'];
  const releaseAlarm = loaded.operations.find(operation =>
    operation.type === 'alarms.create' &&
    operation.name === 'gExtensionLinkJobDelivery:delivery-schedule-job'
  );
  assert.ok(releaseAlarm);
  assert.equal(releaseAlarm.alarmInfo.when, released.retryAfter);
});

test('delivery alarms clear expired claims and retries before notifying the owning window', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const alarmListener = loaded.events.alarmsOnAlarm.listeners[0];
  const expiredAt = Date.now() - 1000;

  await writeLinkJob(makeJob('expired-claim-job', {
    status: 'completed',
    completedAt: Date.now(),
    claim: { token: 'expired-token', claimedAt: expiredAt - 1000, expiresAt: expiredAt },
    result: { content: { text: 'claimed result' } }
  }));
  await writeLinkJob(makeJob('expired-retry-job', {
    status: 'failed',
    completedAt: Date.now(),
    retryAfter: expiredAt,
    error: { code: 'TEST', message: 'retry result' }
  }));
  loaded.operations.length = 0;

  alarmListener({ name: 'gExtensionLinkJobDelivery:expired-claim-job' });
  alarmListener({ name: 'gExtensionLinkJobDelivery:expired-retry-job' });
  await loaded.flush(16);

  assert.equal(loaded.sessionData['gExtensionLinkJob:expired-claim-job'].claim, null);
  assert.equal(loaded.sessionData['gExtensionLinkJob:expired-retry-job'].retryAfter, null);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['expired-claim-job'].claimExpiresAt, null);

  const notifiedIds = loaded.operations
    .filter(operation =>
      operation.type === 'runtime.sendMessage' &&
      operation.message.type === 'LINK_EXTRACTION_JOB_UPDATED'
    )
    .map(operation => operation.message.requestId)
    .sort();
  assert.deepEqual(notifiedIds, ['expired-claim-job', 'expired-retry-job']);
});

test('startup recovery rebuilds future claim and retry delivery alarms', async function () {
  const now = Date.now();
  const claimExpiresAt = now + 120000;
  const retryAfter = now + 90000;
  const claimJob = makeJob('recover-claim-job', {
    status: 'completed',
    completedAt: now,
    claim: { token: 'recovery-token', claimedAt: now, expiresAt: claimExpiresAt },
    result: { content: { text: 'claimed result' } }
  });
  const retryJob = makeJob('recover-retry-job', {
    status: 'failed',
    completedAt: now,
    retryAfter,
    error: { code: 'TEST', message: 'retry result' }
  });
  const loaded = await loadBackground({
    sessionData: {
      gExtensionLinkJobIndex: {
        'recover-claim-job': {
          requestId: 'recover-claim-job',
          windowId: 7,
          status: 'completed',
          createdAt: claimJob.createdAt,
          deadline: claimJob.deadline,
          completedAt: now,
          claimExpiresAt,
          reservedBytes: 0
        },
        'recover-retry-job': {
          requestId: 'recover-retry-job',
          windowId: 7,
          status: 'failed',
          createdAt: retryJob.createdAt,
          deadline: retryJob.deadline,
          completedAt: now,
          claimExpiresAt: null,
          reservedBytes: 0
        }
      },
      'gExtensionLinkJob:recover-claim-job': claimJob,
      'gExtensionLinkJob:recover-retry-job': retryJob
    }
  });

  const deliveryAlarms = Object.fromEntries(
    loaded.operations
      .filter(operation =>
        operation.type === 'alarms.create' &&
        operation.name.startsWith('gExtensionLinkJobDelivery:')
      )
      .map(operation => [operation.name, operation.alarmInfo.when])
  );
  assert.equal(deliveryAlarms['gExtensionLinkJobDelivery:recover-claim-job'], claimExpiresAt);
  assert.equal(deliveryAlarms['gExtensionLinkJobDelivery:recover-retry-job'], retryAfter);
});

test('cleanup defers removal until a scheduled delivery retry is eligible', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const cleanupLinkJobRecord = loaded.getBinding('cleanupLinkJobRecord');
  const retryAfter = Date.now() + 60000;

  await writeLinkJob(makeJob('cleanup-retry-job', {
    status: 'completed',
    completedAt: Date.now() - (10 * 60 * 1000),
    retryAfter,
    result: { content: { text: 'retryable result' } }
  }));
  loaded.operations.length = 0;

  assert.equal(await cleanupLinkJobRecord('cleanup-retry-job'), false);
  assert.ok(loaded.sessionData['gExtensionLinkJob:cleanup-retry-job']);
  const cleanupAlarm = loaded.operations.find(operation =>
    operation.type === 'alarms.create' &&
    operation.name === 'gExtensionLinkJobCleanup:cleanup-retry-job'
  );
  assert.ok(cleanupAlarm);
  assert.equal(cleanupAlarm.alarmInfo.when, retryAfter + 1000);
});
