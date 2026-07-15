'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadBackground } = require('./helpers/background_vm.js');

function makeJob(requestId, overrides = {}) {
  const now = Date.now();
  return {
    schemaVersion: 1,
    requestId,
    windowId: 7,
    sourceUrl: `https://example.test/${requestId}`,
    sourceTitle: requestId,
    status: 'creating',
    createdAt: now,
    deadline: now + 30000,
    ...overrides
  };
}

function updatedJobMessages(loaded, requestId) {
  return loaded.operations.filter(operation =>
    operation.type === 'runtime.sendMessage' &&
    operation.message?.type === 'LINK_EXTRACTION_JOB_UPDATED' &&
    operation.message.requestId === requestId
  );
}

function makeExtractionResult(text = 'extracted article', overrides = {}) {
  return {
    schemaVersion: 1,
    requestId: 'extractor-owned-id',
    ok: true,
    source: {
      url: 'https://example.test/extracted',
      title: 'Extracted article'
    },
    extraction: { mode: 'reader' },
    content: {
      text,
      readerText: text,
      fullText: `full ${text}`,
      charCount: text.length,
      truncated: false,
      readerTruncated: false,
      fullTextTruncated: false
    },
    metadata: {},
    warnings: [],
    error: null,
    ...overrides
  };
}

test('concurrent admissions are serialized and never exceed the three-job limit', async function () {
  const loaded = await loadBackground();
  const admitLinkJob = loaded.getBinding('admitLinkJob');

  const settlements = await Promise.allSettled(
    Array.from({ length: 6 }, (_, index) => admitLinkJob(makeJob(`concurrent-${index + 1}`)))
  );
  const accepted = settlements.filter(result => result.status === 'fulfilled');
  const rejected = settlements.filter(result => result.status === 'rejected');

  assert.equal(accepted.length, 3);
  assert.equal(rejected.length, 3);
  rejected.forEach(result => assert.equal(result.reason?.code, 'LINK_CONCURRENCY_LIMIT'));

  const storedIds = Object.keys(loaded.sessionData)
    .filter(key => key.startsWith('gExtensionLinkJob:'))
    .map(key => key.slice('gExtensionLinkJob:'.length))
    .sort();
  const indexedIds = Object.keys(loaded.sessionData.gExtensionLinkJobIndex).sort();
  assert.equal(storedIds.length, 3);
  assert.deepEqual(indexedIds, storedIds);
  indexedIds.forEach(requestId => {
    assert.equal(loaded.sessionData.gExtensionLinkJobIndex[requestId].reservedBytes, 900 * 1024);
  });
});

test('admission prunes stale active index entries before applying the concurrency limit', async function () {
  const loaded = await loadBackground();
  const admitLinkJob = loaded.getBinding('admitLinkJob');
  loaded.sessionData.gExtensionLinkJobIndex = Object.fromEntries(
    ['stale-one', 'stale-two', 'stale-three'].map(requestId => [requestId, {
      requestId,
      windowId: 7,
      status: 'loading',
      createdAt: Date.now(),
      deadline: Date.now() + 30000,
      reservedBytes: 900 * 1024
    }])
  );

  await admitLinkJob(makeJob('live-job'));

  assert.deepEqual(Object.keys(loaded.sessionData.gExtensionLinkJobIndex), ['live-job']);
  assert.ok(loaded.sessionData['gExtensionLinkJob:live-job']);
});

test('storage admission accounts for active-result reservations on both sides of the budget boundary', async function () {
  async function prepareWithTwoActiveJobs() {
    const loaded = await loadBackground();
    const admitLinkJob = loaded.getBinding('admitLinkJob');
    await admitLinkJob(makeJob('reserved-one'));
    await admitLinkJob(makeJob('reserved-two', { status: 'loading', tabId: 201 }));
    return { loaded, admitLinkJob };
  }

  const below = await prepareWithTwoActiveJobs();
  const maxBytes = below.loaded.getBinding('MAX_LINK_JOB_STORAGE_BYTES');
  const reservationBytes = below.loaded.getBinding('LINK_JOB_RESULT_RESERVATION_BYTES');
  const belowBoundaryBytes = maxBytes - (3 * reservationBytes) - (16 * 1024);
  below.loaded.chrome.storage.session.getBytesInUse = async keys => keys === null ? belowBoundaryBytes : 0;

  await below.admitLinkJob(makeJob('reserved-three-allowed'));
  assert.ok(below.loaded.sessionData['gExtensionLinkJob:reserved-three-allowed']);

  const above = await prepareWithTwoActiveJobs();
  const aboveBoundaryBytes = maxBytes - (3 * reservationBytes) + 1;
  above.loaded.chrome.storage.session.getBytesInUse = async keys => keys === null ? aboveBoundaryBytes : 0;

  await assert.rejects(
    above.admitLinkJob(makeJob('reserved-three-rejected')),
    error => error?.code === 'LINK_STORAGE_BUDGET_EXCEEDED'
  );
  assert.equal(above.loaded.sessionData['gExtensionLinkJob:reserved-three-rejected'], undefined);
  assert.equal(above.loaded.sessionData.gExtensionLinkJobIndex['reserved-three-rejected'], undefined);
});

test('post-write storage overflow restores the previous job and compact index', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const maxBytes = loaded.getBinding('MAX_LINK_JOB_STORAGE_BYTES');
  const originalJob = makeJob('rollback-job', {
    status: 'completed',
    completedAt: Date.now(),
    result: { content: { text: 'original result' } }
  });
  await writeLinkJob(originalJob);
  const originalIndex = JSON.parse(JSON.stringify(loaded.sessionData.gExtensionLinkJobIndex));

  let totalUsageReads = 0;
  loaded.chrome.storage.session.getBytesInUse = async keys => {
    if (keys !== null) return 0;
    totalUsageReads += 1;
    return totalUsageReads === 1 ? 1024 : maxBytes + 1;
  };

  await assert.rejects(
    writeLinkJob({
      ...originalJob,
      sourceTitle: 'must be rolled back',
      result: { content: { text: 'replacement result' } }
    }),
    error => error?.code === 'LINK_STORAGE_BUDGET_EXCEEDED'
  );

  assert.deepEqual(loaded.sessionData['gExtensionLinkJob:rollback-job'], originalJob);
  assert.deepEqual(loaded.sessionData.gExtensionLinkJobIndex, originalIndex);
  assert.ok(loaded.operations.some(operation =>
    operation.type === 'storage.session.set' &&
    operation.values?.['gExtensionLinkJob:rollback-job']?.sourceTitle === originalJob.sourceTitle
  ));
});

test('an oversized terminal result degrades to a compact RESULT_TOO_LARGE failure', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const finalizeLinkJob = loaded.getBinding('finalizeLinkJob');
  const tabId = 301;
  loaded.tabs.set(tabId, {
    id: tabId,
    windowId: 7,
    url: 'https://example.test/oversized-result',
    status: 'complete'
  });
  await writeLinkJob(makeJob('oversized-result', { status: 'extracting', tabId }));
  loaded.operations.length = 0;

  const terminalJob = await finalizeLinkJob('oversized-result', {
    status: 'completed',
    result: { content: { text: 'x'.repeat((7 * 1024 * 1024) + 1) } }
  });

  assert.equal(terminalJob.status, 'failed');
  assert.equal(terminalJob.error.code, 'RESULT_TOO_LARGE');
  assert.equal(terminalJob.error.retryable, false);
  assert.equal(terminalJob.result, undefined);
  assert.equal(loaded.sessionData['gExtensionLinkJob:oversized-result'].error.code, 'RESULT_TOO_LARGE');
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['oversized-result'].reservedBytes, 0);
  assert.equal(loaded.tabs.has(tabId), false);
  assert.equal(updatedJobMessages(loaded, 'oversized-result').length, 1);
});

test('duplicate timeout alarms finalize a job once and remove its temporary tab', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const alarmListener = loaded.events.alarmsOnAlarm.listeners[0];
  const tabId = 401;
  loaded.tabs.set(tabId, {
    id: tabId,
    windowId: 7,
    url: 'https://example.test/timeout-alarm',
    status: 'loading'
  });
  await writeLinkJob(makeJob('timeout-alarm', { status: 'loading', tabId }));
  loaded.operations.length = 0;

  alarmListener({ name: 'gExtensionLinkJobTimeout:timeout-alarm' });
  alarmListener({ name: 'gExtensionLinkJobTimeout:timeout-alarm' });
  await loaded.flush(20);

  const terminalJob = loaded.sessionData['gExtensionLinkJob:timeout-alarm'];
  assert.equal(terminalJob.status, 'failed');
  assert.equal(terminalJob.error.code, 'TIMEOUT');
  assert.equal(loaded.tabs.has(tabId), false);
  assert.equal(updatedJobMessages(loaded, 'timeout-alarm').length, 1);
  assert.equal(loaded.operations.filter(operation =>
    operation.type === 'tabs.remove' && operation.tabId === tabId
  ).length, 1);
  assert.equal(loaded.operations.filter(operation =>
    operation.type === 'alarms.create' &&
    operation.name === 'gExtensionLinkJobCleanup:timeout-alarm'
  ).length, 1);
});

test('loaded-job processing completes extraction and stores only the compact result payload', async function () {
  const extractedText = 'first line\nsecond line';
  const loaded = await loadBackground({
    injectionResults: [{
      frameId: 0,
      documentId: 'document-801',
      result: makeExtractionResult(extractedText)
    }]
  });
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const processLoadedLinkJob = loaded.getBinding('processLoadedLinkJob');
  const tabId = 801;
  loaded.tabs.set(tabId, {
    id: tabId,
    windowId: 7,
    url: 'https://example.test/extracted',
    status: 'complete'
  });
  await writeLinkJob(makeJob('process-success', { status: 'loading', tabId }));
  const originalSetTimeout = loaded.context.setTimeout;
  loaded.context.setTimeout = (callback, delay) => {
    if (delay === 400) {
      callback();
      return 1;
    }
    return originalSetTimeout(callback, delay);
  };
  loaded.operations.length = 0;

  await processLoadedLinkJob('process-success');

  const terminalJob = loaded.sessionData['gExtensionLinkJob:process-success'];
  assert.equal(terminalJob.status, 'completed');
  assert.equal(terminalJob.result.requestId, 'process-success');
  assert.equal(terminalJob.result.source.tabId, tabId);
  assert.equal(terminalJob.result.source.documentId, 'document-801');
  assert.deepEqual(terminalJob.result.content, {
    text: extractedText,
    charCount: extractedText.length,
    truncated: false,
    readerTruncated: false,
    fullTextTruncated: false
  });
  assert.equal(terminalJob.result.content.readerText, undefined);
  assert.equal(terminalJob.result.content.fullText, undefined);
  assert.equal(loaded.tabs.has(tabId), false);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['process-success'].reservedBytes, 0);
  assert.equal(updatedJobMessages(loaded, 'process-success').length, 2);
});

test('loaded-job processing rechecks the deadline after settling and skips script injection when expired', async function () {
  const loaded = await loadBackground({
    injectionResults: [{ frameId: 0, result: makeExtractionResult() }]
  });
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const processLoadedLinkJob = loaded.getBinding('processLoadedLinkJob');
  const tabId = 802;
  loaded.tabs.set(tabId, {
    id: tabId,
    windowId: 7,
    url: 'https://example.test/deadline-during-settle',
    status: 'complete'
  });
  await writeLinkJob(makeJob('deadline-during-settle', { status: 'loading', tabId }));
  const originalSetTimeout = loaded.context.setTimeout;
  loaded.context.setTimeout = (callback, delay) => {
    if (delay === 400) {
      loaded.sessionData['gExtensionLinkJob:deadline-during-settle'].deadline = Date.now() - 1;
      callback();
      return 1;
    }
    return originalSetTimeout(callback, delay);
  };
  loaded.operations.length = 0;

  await processLoadedLinkJob('deadline-during-settle');

  const terminalJob = loaded.sessionData['gExtensionLinkJob:deadline-during-settle'];
  assert.equal(terminalJob.status, 'failed');
  assert.equal(terminalJob.error.code, 'TIMEOUT');
  assert.equal(loaded.operations.some(operation => operation.type === 'scripting.executeScript'), false);
  assert.equal(loaded.tabs.has(tabId), false);
});

test('loaded-job processing preserves extractor failure semantics', async function () {
  const failedExtraction = makeExtractionResult('', {
    ok: false,
    content: {
      text: '',
      readerText: '',
      fullText: '',
      charCount: 0,
      truncated: false,
      readerTruncated: false,
      fullTextTruncated: false
    },
    error: {
      code: 'NO_ARTICLE',
      phase: 'readability',
      message: 'No article was found.',
      retryable: false
    }
  });
  const loaded = await loadBackground({
    injectionResults: [{ frameId: 0, result: failedExtraction }]
  });
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const processLoadedLinkJob = loaded.getBinding('processLoadedLinkJob');
  const tabId = 803;
  loaded.tabs.set(tabId, {
    id: tabId,
    windowId: 7,
    url: 'https://example.test/no-article',
    status: 'complete'
  });
  await writeLinkJob(makeJob('process-extractor-failure', { status: 'loading', tabId }));
  const originalSetTimeout = loaded.context.setTimeout;
  loaded.context.setTimeout = (callback, delay) => {
    if (delay === 400) {
      callback();
      return 1;
    }
    return originalSetTimeout(callback, delay);
  };

  await processLoadedLinkJob('process-extractor-failure');

  const terminalJob = loaded.sessionData['gExtensionLinkJob:process-extractor-failure'];
  assert.equal(terminalJob.status, 'failed');
  assert.deepEqual(terminalJob.error, {
    code: 'NO_ARTICLE',
    phase: 'link-extraction',
    message: 'No article was found.',
    retryable: false
  });
  assert.equal(terminalJob.result, undefined);
});

test('tab creation failure after admission persists a terminal job instead of an ephemeral rejection', async function () {
  const loaded = await loadBackground();
  const startLinkExtractionJob = loaded.getBinding('startLinkExtractionJob');
  loaded.chrome.tabs.create = async () => {
    throw new Error('simulated tab creation failure');
  };
  loaded.operations.length = 0;

  const requestId = await startLinkExtractionJob({
    requestId: 'admitted-open-failure',
    url: 'https://example.test/open-failure',
    title: 'Open failure',
    windowId: 7
  });

  assert.equal(requestId, 'admitted-open-failure');
  const terminalJob = loaded.sessionData['gExtensionLinkJob:admitted-open-failure'];
  assert.equal(terminalJob.status, 'failed');
  assert.equal(terminalJob.error.code, 'OPEN_LINK_FAILED');
  assert.match(terminalJob.error.message, /simulated tab creation failure/);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['admitted-open-failure'].reservedBytes, 0);
  assert.equal(loaded.operations.some(operation =>
    operation.type === 'runtime.sendMessage' &&
    operation.message?.type === 'LINK_EXTRACTION_JOB_EPHEMERAL_FAILURE'
  ), false);
  assert.ok(loaded.operations.some(operation =>
    operation.type === 'alarms.create' &&
    operation.name === 'gExtensionLinkJobCleanup:admitted-open-failure'
  ));
});

test('recovery rewinds an interrupted extraction to loading and restores its timeout alarm', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const recoverLinkJobs = loaded.getBinding('recoverLinkJobs');
  const deadline = Date.now() + 20000;
  const tabId = 501;
  loaded.tabs.set(tabId, {
    id: tabId,
    windowId: 7,
    url: 'https://example.test/recover-extracting',
    status: 'loading'
  });
  await writeLinkJob(makeJob('recover-extracting', {
    status: 'extracting',
    tabId,
    deadline,
    extractionStartedAt: Date.now() - 1000
  }));
  loaded.operations.length = 0;

  await recoverLinkJobs();

  assert.equal(loaded.sessionData['gExtensionLinkJob:recover-extracting'].status, 'loading');
  assert.equal(loaded.tabs.has(tabId), true);
  const timeoutAlarm = loaded.operations.find(operation =>
    operation.type === 'alarms.create' &&
    operation.name === 'gExtensionLinkJobTimeout:recover-extracting'
  );
  assert.ok(timeoutAlarm);
  assert.equal(timeoutAlarm.alarmInfo.when, deadline);
});

test('recovery terminalizes expired, missing-tab, and unrecorded-tab jobs with distinct errors', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const recoverLinkJobs = loaded.getBinding('recoverLinkJobs');
  const expiredTabId = 601;
  loaded.tabs.set(expiredTabId, {
    id: expiredTabId,
    windowId: 7,
    url: 'https://example.test/recover-expired',
    status: 'loading'
  });
  await writeLinkJob(makeJob('recover-expired', {
    status: 'loading',
    tabId: expiredTabId,
    deadline: Date.now() - 1
  }));
  await writeLinkJob(makeJob('recover-missing-tab', {
    status: 'loading',
    tabId: 9999
  }));
  await writeLinkJob(makeJob('recover-unrecorded-tab'));
  loaded.operations.length = 0;

  await recoverLinkJobs();

  assert.equal(loaded.sessionData['gExtensionLinkJob:recover-expired'].error.code, 'TIMEOUT');
  assert.equal(loaded.sessionData['gExtensionLinkJob:recover-missing-tab'].error.code, 'TAB_CLOSED');
  assert.equal(loaded.sessionData['gExtensionLinkJob:recover-unrecorded-tab'].error.code, 'OPEN_LINK_FAILED');
  for (const requestId of ['recover-expired', 'recover-missing-tab', 'recover-unrecorded-tab']) {
    assert.equal(loaded.sessionData[`gExtensionLinkJob:${requestId}`].status, 'failed');
    assert.equal(loaded.sessionData.gExtensionLinkJobIndex[requestId].reservedBytes, 0);
  }
  assert.equal(loaded.tabs.has(expiredTabId), false);
});

test('competing terminal outcomes preserve the first result and emit one terminal notification', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const finalizeLinkJob = loaded.getBinding('finalizeLinkJob');
  const failLinkJob = loaded.getBinding('failLinkJob');
  const tabId = 701;
  loaded.tabs.set(tabId, {
    id: tabId,
    windowId: 7,
    url: 'https://example.test/terminal-race',
    status: 'complete'
  });
  await writeLinkJob(makeJob('terminal-race', { status: 'extracting', tabId }));
  loaded.operations.length = 0;

  const [completion, lateFailure] = await Promise.all([
    finalizeLinkJob('terminal-race', {
      status: 'completed',
      result: { content: { text: 'winner' } }
    }),
    failLinkJob('terminal-race', 'INJECTION_FAILED', 'must not overwrite the winner')
  ]);

  assert.equal(completion.status, 'completed');
  assert.equal(lateFailure.status, 'completed');
  assert.equal(loaded.sessionData['gExtensionLinkJob:terminal-race'].result.content.text, 'winner');
  assert.equal(updatedJobMessages(loaded, 'terminal-race').length, 1);
  assert.equal(loaded.operations.filter(operation =>
    operation.type === 'tabs.remove' && operation.tabId === tabId
  ).length, 1);
});

test('concurrent claims have one winner and acknowledge cannot race with release to resurrect a job', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const readLinkJob = loaded.getBinding('readLinkJob');
  const claimLinkJob = loaded.getBinding('claimLinkJob');
  const acknowledgeLinkJob = loaded.getBinding('acknowledgeLinkJob');
  const releaseLinkJob = loaded.getBinding('releaseLinkJob');
  await writeLinkJob(makeJob('claim-race', {
    status: 'completed',
    completedAt: Date.now(),
    result: { content: { text: 'ready' } }
  }));

  const claims = await Promise.all([
    claimLinkJob('claim-race', 7),
    claimLinkJob('claim-race', 7),
    claimLinkJob('claim-race', 7)
  ]);
  const winners = claims.filter(result => result.claimed);
  const losers = claims.filter(result => !result.claimed);
  assert.equal(winners.length, 1);
  assert.deepEqual(losers.map(result => result.reason), ['ALREADY_CLAIMED', 'ALREADY_CLAIMED']);

  const token = winners[0].claimToken;
  const [acknowledged, released] = await Promise.all([
    acknowledgeLinkJob('claim-race', token, 7),
    releaseLinkJob('claim-race', token, 7, 'late release')
  ]);
  assert.equal(acknowledged, true);
  assert.equal(released, false);
  assert.equal(await readLinkJob('claim-race'), null);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['claim-race'], undefined);
  assert.equal(await acknowledgeLinkJob('claim-race', token, 7), true);
});

test('cleanup honors a live claim, then removes the job and stale-index records once unblocked', async function () {
  const loaded = await loadBackground();
  const writeLinkJob = loaded.getBinding('writeLinkJob');
  const readLinkJob = loaded.getBinding('readLinkJob');
  const cleanupLinkJobRecord = loaded.getBinding('cleanupLinkJobRecord');
  const claimExpiresAt = Date.now() + 60000;
  await writeLinkJob(makeJob('cleanup-claim', {
    status: 'completed',
    completedAt: Date.now() - (10 * 60 * 1000),
    claim: {
      token: 'live-claim',
      claimedAt: Date.now(),
      expiresAt: claimExpiresAt
    },
    result: { content: { text: 'claimed result' } }
  }));
  loaded.operations.length = 0;

  assert.equal(await cleanupLinkJobRecord('cleanup-claim'), false);
  assert.ok(await readLinkJob('cleanup-claim'));
  const deferredAlarm = loaded.operations.find(operation =>
    operation.type === 'alarms.create' &&
    operation.name === 'gExtensionLinkJobCleanup:cleanup-claim'
  );
  assert.ok(deferredAlarm);
  assert.equal(deferredAlarm.alarmInfo.when, claimExpiresAt + 1000);

  const claimedJob = await readLinkJob('cleanup-claim');
  await writeLinkJob({
    ...claimedJob,
    claim: { ...claimedJob.claim, expiresAt: Date.now() - 1 }
  });
  assert.equal(await cleanupLinkJobRecord('cleanup-claim'), true);
  assert.equal(await readLinkJob('cleanup-claim'), null);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['cleanup-claim'], undefined);

  loaded.sessionData.gExtensionLinkJobIndex['stale-cleanup'] = {
    requestId: 'stale-cleanup',
    windowId: 7,
    status: 'completed',
    completedAt: Date.now(),
    reservedBytes: 0
  };
  loaded.operations.length = 0;
  assert.equal(await cleanupLinkJobRecord('stale-cleanup'), true);
  assert.equal(loaded.sessionData.gExtensionLinkJobIndex['stale-cleanup'], undefined);
  assert.ok(loaded.operations.some(operation =>
    operation.type === 'alarms.clear' &&
    operation.name === 'gExtensionLinkJobDelivery:stale-cleanup'
  ));
});
