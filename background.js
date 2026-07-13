// g-extension/background.js
let geminiApiKey = null;
let currentLanguage = 'zh';

const translations = {
  zh: {
    analyzeImage: "用 Gemini 分析图片",
    summarizeLink: "总结链接网页",
    errorActiveTab: "无法确定活动标签页。",
    errorCSComm: "获取页面内容失败 (CS通讯错误): ",
    errorContentInvalid: "未能从页面获取内容 (CS数据无效或格式错误)。",
    errorScriptFail: "无法在此类特殊页面上运行脚本。",
    errorInjectFail: "无法注入提取脚本: ",
    linkProcessing: "正在处理链接总结...",
    errorOpenLink: "无法打开链接: ",
    errorExtractFail: "无法提取内容 (注入失败): ",
    errorTimeout: "页面加载超时，无法提取内容。"
  },
  en: {
    analyzeImage: "Analyze image with Gemini",
    summarizeLink: "Summarize Link",
    errorActiveTab: "Cannot determine active tab.",
    errorCSComm: "Failed to get page content (CS Comm Error): ",
    errorContentInvalid: "Failed to get content (Invalid Data).",
    errorScriptFail: "Cannot run script on this special page.",
    errorInjectFail: "Failed to inject script: ",
    linkProcessing: "Processing link summary...",
    errorOpenLink: "Cannot open link: ",
    errorExtractFail: "Extraction failed (Injection Error): ",
    errorTimeout: "Page load timeout, extraction failed."
  }
};

function t(key) {
  return (translations[currentLanguage] && translations[currentLanguage][key]) || translations['zh'][key] || key;
}

const EXTRACTION_FILES = {
  reader: ["libs/Readability.js", "extraction_core.js", "reader_content_extractor.js"],
  visible: ["extraction_core.js", "page_content_extractor.js"],
  both: ["libs/Readability.js", "extraction_core.js", "regex_content_extractor.js"],
  link: ["libs/Readability.js", "extraction_core.js", "link_content_extractor.js"]
};

const LINK_JOB_STORAGE_PREFIX = 'gExtensionLinkJob:';
const LINK_JOB_INDEX_KEY = 'gExtensionLinkJobIndex';
const LINK_JOB_TIMEOUT_ALARM_PREFIX = 'gExtensionLinkJobTimeout:';
const LINK_JOB_CLEANUP_ALARM_PREFIX = 'gExtensionLinkJobCleanup:';
const LINK_JOB_DELIVERY_ALARM_PREFIX = 'gExtensionLinkJobDelivery:';
const LINK_JOB_TIMEOUT_MS = 30000;
const LINK_JOB_RETENTION_MS = 10 * 60 * 1000;
const LINK_JOB_CLAIM_MS = 5 * 60 * 1000;
const LINK_JOB_RETRY_MS = 60 * 1000;
const MAX_CONCURRENT_LINK_JOBS = 3;
const MAX_LINK_JOB_STORAGE_BYTES = 7 * 1024 * 1024;
const LINK_JOB_RESULT_RESERVATION_BYTES = 900 * 1024;
const ACTIVE_LINK_JOB_STATUSES = new Set(['creating', 'loading', 'extracting']);
const linkJobLocks = new Map();
let linkStorageQueue = Promise.resolve();
const connectedSidebarWindows = new Map();
const SIDEBAR_URL = chrome.runtime.getURL('sidebar.html');
const SIDEBAR_ACTIONS = new Set([
  'getAndSummarizePage',
  'extractActiveTabContent',
  'extractActiveTabRegexSource',
  'listLinkJobsForWindow',
  'claimLinkJob',
  'ackLinkJob',
  'releaseLinkJob'
]);
const CONTENT_SCRIPT_ACTIONS = new Set([
  'openSidePanel',
  'shouldCaptureSelection',
  'TEXT_SELECTED_FROM_PAGE',
  'summarizeLinkTarget'
]);

function createRequestId(prefix = 'extract') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function serializeError(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function takeSafePrefix(value, maxChars) {
  const text = typeof value === 'string' ? value : String(value || '');
  let end = Math.min(text.length, maxChars);
  if (end > 0 && end < text.length) {
    const previous = text.charCodeAt(end - 1);
    const next = text.charCodeAt(end);
    if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end -= 1;
  }
  return text.slice(0, end);
}

function isSidebarSender(sender) {
  return sender?.id === chrome.runtime.id && sender?.url === SIDEBAR_URL && !sender.tab;
}

function isContentScriptSender(sender) {
  if (sender?.id !== chrome.runtime.id || !Number.isInteger(sender?.tab?.id) || sender.frameId !== 0) {
    return false;
  }
  try {
    validatePageUrl(sender.url || sender.tab.url || '', { allowFile: true });
    return true;
  } catch (_) {
    return false;
  }
}

function validatePageUrl(rawUrl, { allowFile = true } = {}) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 8192) {
    throw new Error('Unsupported or invalid page URL.');
  }
  let parsed;
  try {
    parsed = new URL(rawUrl || '');
  } catch {
    throw new Error('Unsupported or invalid page URL.');
  }

  const allowedProtocols = allowFile ? new Set(['http:', 'https:', 'file:']) : new Set(['http:', 'https:']);
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing embedded credentials are not supported.');
  }
  return parsed.href;
}

async function resolveTargetTab(request = {}) {
  if (Number.isInteger(request.tabId)) {
    const tab = await chrome.tabs.get(request.tabId);
    if (Number.isInteger(request.windowId) && tab.windowId !== request.windowId) {
      throw new Error('The requested tab does not belong to the initiating window.');
    }
    return tab;
  }

  const query = { active: true };
  if (Number.isInteger(request.windowId)) {
    query.windowId = request.windowId;
  } else {
    query.lastFocusedWindow = true;
  }
  const tabs = await chrome.tabs.query(query);
  if (!tabs?.[0]?.id) {
    throw new Error(t('errorActiveTab'));
  }
  return tabs[0];
}

async function executeExtractor(tabId, extractorKind, requestId) {
  const files = EXTRACTION_FILES[extractorKind];
  if (!files) throw new Error(`Unknown extraction mode: ${extractorKind}`);

  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId },
    files
  });
  const mainFrameResult = injectionResults?.find(result => result.frameId === 0) || injectionResults?.[0];
  const result = mainFrameResult?.result;
  validateExtractionResult(result);
  return {
    ...result,
    requestId,
    source: {
      ...(result.source || {}),
      tabId,
      documentId: mainFrameResult?.documentId || null
    }
  };
}

function validateExtractionResult(result) {
  const validObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const invalid = message => {
    const error = new Error(`Extraction contract invalid: ${message}`);
    error.code = 'EXTRACTION_CONTRACT_INVALID';
    throw error;
  };

  if (!validObject(result)) invalid('result must be an object.');
  if (result.schemaVersion !== 1) invalid('unsupported schemaVersion.');
  if (typeof result.ok !== 'boolean') invalid('ok must be a boolean.');
  if (!validObject(result.source) || !validObject(result.extraction) || !validObject(result.content) || !validObject(result.metadata)) {
    invalid('source, extraction, content, and metadata must be objects.');
  }
  if (!Array.isArray(result.warnings)) invalid('warnings must be an array.');
  if (result.error !== null && !validObject(result.error)) invalid('error must be null or an object.');
  if (typeof result.content.text !== 'string' || typeof result.content.readerText !== 'string' || typeof result.content.fullText !== 'string') {
    invalid('content text fields must be strings.');
  }
  if ([result.content.text, result.content.readerText, result.content.fullText].some(text => text.length > 200000)) {
    invalid('content text fields exceed the configured character budget.');
  }
  if (!Number.isSafeInteger(result.content.charCount) || result.content.charCount !== result.content.text.length) {
    invalid('charCount must equal content.text.length.');
  }
  if (result.ok && result.content.text.length === 0) invalid('successful results must contain text.');
  return result;
}

async function extractFromRequestedTab(request, extractorKind) {
  const requestId = request.requestId || createRequestId(extractorKind);
  const tab = await resolveTargetTab(request);
  validatePageUrl(tab.url || '', { allowFile: true });
  const result = await executeExtractor(tab.id, extractorKind, requestId);
  result.source = {
    ...(result.source || {}),
    tabId: tab.id,
    windowId: tab.windowId,
    url: result.source?.url || tab.url || '',
    title: result.source?.title || tab.title || ''
  };
  return { tab, result };
}

function linkJobStorageKey(requestId) {
  return `${LINK_JOB_STORAGE_PREFIX}${requestId}`;
}

function withLinkJobLock(requestId, operation) {
  const previous = linkJobLocks.get(requestId) || Promise.resolve();
  const queued = previous.then(operation, operation);
  linkJobLocks.set(requestId, queued);
  return queued.finally(() => {
    if (linkJobLocks.get(requestId) === queued) linkJobLocks.delete(requestId);
  });
}

function withLinkStorageLock(operation) {
  const queued = linkStorageQueue.catch(() => {}).then(operation);
  linkStorageQueue = queued.catch(() => {});
  return queued;
}

function normalizeLinkJobIndex(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function createLinkJobIndexEntry(job) {
  const isActive = ACTIVE_LINK_JOB_STATUSES.has(job.status);
  return {
    requestId: job.requestId,
    windowId: job.windowId,
    tabId: job.tabId,
    status: job.status,
    createdAt: job.createdAt,
    deadline: job.deadline,
    completedAt: job.completedAt,
    claimExpiresAt: job.claim?.expiresAt || null,
    reservedBytes: isActive ? LINK_JOB_RESULT_RESERVATION_BYTES : 0
  };
}

function createStorageBudgetError() {
  const error = new Error('Link extraction storage is temporarily full. Try again after pending results are consumed.');
  error.code = 'LINK_STORAGE_BUDGET_EXCEEDED';
  return error;
}

function estimateStoredBytes(key, value) {
  const encoder = new TextEncoder();
  return encoder.encode(String(key)).byteLength + encoder.encode(JSON.stringify(value)).byteLength;
}

function sumLinkJobReservations(index) {
  return Object.values(index).reduce((total, entry) => {
    const reservation = Number(entry?.reservedBytes);
    return total + (Number.isFinite(reservation) && reservation > 0 ? reservation : 0);
  }, 0);
}

async function setLinkJobWithinBudgetUnlocked(job, index) {
  const jobKey = linkJobStorageKey(job.requestId);
  const keys = [jobKey, LINK_JOB_INDEX_KEY];
  const previous = await chrome.storage.session.get(keys);
  const currentBytes = await chrome.storage.session.getBytesInUse(null);
  const replacedBytes = await chrome.storage.session.getBytesInUse(keys);
  const estimatedNewBytes = estimateStoredBytes(jobKey, job) + estimateStoredBytes(LINK_JOB_INDEX_KEY, index);
  const reservations = sumLinkJobReservations(index);
  const projectedBytes = Math.max(0, currentBytes - replacedBytes) + estimatedNewBytes + reservations;

  if (projectedBytes > MAX_LINK_JOB_STORAGE_BYTES ||
      (currentBytes >= MAX_LINK_JOB_STORAGE_BYTES && !Object.prototype.hasOwnProperty.call(previous, jobKey))) {
    throw createStorageBudgetError();
  }

  await chrome.storage.session.set({
    [jobKey]: job,
    [LINK_JOB_INDEX_KEY]: index
  });

  const actualBytes = await chrome.storage.session.getBytesInUse(null);
  if (actualBytes + reservations <= MAX_LINK_JOB_STORAGE_BYTES) return job;

  const restoreValues = {};
  const removeKeys = [];
  if (Object.prototype.hasOwnProperty.call(previous, jobKey)) restoreValues[jobKey] = previous[jobKey];
  else removeKeys.push(jobKey);
  if (Object.prototype.hasOwnProperty.call(previous, LINK_JOB_INDEX_KEY)) {
    restoreValues[LINK_JOB_INDEX_KEY] = previous[LINK_JOB_INDEX_KEY];
  } else {
    removeKeys.push(LINK_JOB_INDEX_KEY);
  }
  if (Object.keys(restoreValues).length > 0) await chrome.storage.session.set(restoreValues);
  if (removeKeys.length > 0) await chrome.storage.session.remove(removeKeys);
  throw createStorageBudgetError();
}

async function readOrMigrateLinkJobIndexUnlocked() {
  const stored = await chrome.storage.session.get(LINK_JOB_INDEX_KEY);
  if (Object.prototype.hasOwnProperty.call(stored, LINK_JOB_INDEX_KEY)) {
    return normalizeLinkJobIndex(stored[LINK_JOB_INDEX_KEY]);
  }

  const legacyState = await chrome.storage.session.get(null);
  const legacyJobs = Object.entries(legacyState)
    .filter(([key]) => key.startsWith(LINK_JOB_STORAGE_PREFIX))
    .map(([, job]) => job)
    .filter(job => job && job.requestId);
  const index = Object.fromEntries(legacyJobs.map(job => [job.requestId, createLinkJobIndexEntry(job)]));
  await chrome.storage.session.set({ [LINK_JOB_INDEX_KEY]: index });
  return index;
}

async function readLinkJob(requestId) {
  const key = linkJobStorageKey(requestId);
  const stored = await chrome.storage.session.get(key);
  return stored[key] || null;
}

async function writeLinkJob(job) {
  return withLinkStorageLock(async () => {
    const index = await readOrMigrateLinkJobIndexUnlocked();
    index[job.requestId] = createLinkJobIndexEntry(job);
    await setLinkJobWithinBudgetUnlocked(job, index);
    return job;
  });
}

async function admitLinkJob(job) {
  return withLinkStorageLock(async () => {
    const index = await readOrMigrateLinkJobIndexUnlocked();
    const activeEntries = Object.values(index).filter(entry =>
      entry && ACTIVE_LINK_JOB_STATUSES.has(entry.status)
    );
    if (activeEntries.length > 0) {
      const activeKeys = activeEntries.map(entry => linkJobStorageKey(entry.requestId));
      const liveActiveJobs = await chrome.storage.session.get(activeKeys);
      activeEntries.forEach(entry => {
        if (!liveActiveJobs[linkJobStorageKey(entry.requestId)]) delete index[entry.requestId];
      });
    }
    const activeCount = Object.values(index).filter(entry =>
      entry && ACTIVE_LINK_JOB_STATUSES.has(entry.status)
    ).length;
    if (activeCount >= MAX_CONCURRENT_LINK_JOBS) {
      const error = new Error(`At most ${MAX_CONCURRENT_LINK_JOBS} link extractions may run at once.`);
      error.code = 'LINK_CONCURRENCY_LIMIT';
      throw error;
    }
    index[job.requestId] = createLinkJobIndexEntry(job);
    await setLinkJobWithinBudgetUnlocked(job, index);
    return job;
  });
}

async function removeLinkJobRecord(requestId) {
  return withLinkStorageLock(async () => {
    const index = await readOrMigrateLinkJobIndexUnlocked();
    delete index[requestId];
    await chrome.storage.session.remove(linkJobStorageKey(requestId));
    await chrome.storage.session.set({ [LINK_JOB_INDEX_KEY]: index });
  });
}

async function listLinkJobs(windowId = null) {
  const indexState = await chrome.storage.session.get(LINK_JOB_INDEX_KEY);
  let index = normalizeLinkJobIndex(indexState[LINK_JOB_INDEX_KEY]);

  // One-time migration for sessions created before the compact index existed.
  if (!Object.prototype.hasOwnProperty.call(indexState, LINK_JOB_INDEX_KEY)) {
    index = await withLinkStorageLock(readOrMigrateLinkJobIndexUnlocked);
  }

  const entries = Object.values(index).filter(entry =>
    entry && (!Number.isInteger(windowId) || entry.windowId === windowId)
  );
  if (entries.length === 0) return [];

  const keys = entries.map(entry => linkJobStorageKey(entry.requestId));
  const storedJobs = await chrome.storage.session.get(keys);
  const jobs = entries
    .map(entry => storedJobs[linkJobStorageKey(entry.requestId)])
    .filter(job => job && job.requestId);

  if (jobs.length !== entries.length) {
    const liveIds = new Set(jobs.map(job => job.requestId));
    await withLinkStorageLock(async () => {
      const latest = await chrome.storage.session.get(LINK_JOB_INDEX_KEY);
      const latestIndex = normalizeLinkJobIndex(latest[LINK_JOB_INDEX_KEY]);
      entries.forEach(entry => {
        if (!liveIds.has(entry.requestId)) delete latestIndex[entry.requestId];
      });
      await chrome.storage.session.set({ [LINK_JOB_INDEX_KEY]: latestIndex });
    });
  }
  return jobs;
}

async function listLinkJobIndexEntries() {
  let indexState = await chrome.storage.session.get(LINK_JOB_INDEX_KEY);
  if (!Object.prototype.hasOwnProperty.call(indexState, LINK_JOB_INDEX_KEY)) {
    await listLinkJobs();
    indexState = await chrome.storage.session.get(LINK_JOB_INDEX_KEY);
  }
  return Object.values(normalizeLinkJobIndex(indexState[LINK_JOB_INDEX_KEY])).filter(Boolean);
}

async function cleanupLinkJobRecord(requestId) {
  return withLinkJobLock(requestId, async () => {
    const job = await readLinkJob(requestId);
    if (!job) {
      await removeLinkJobRecord(requestId);
      await chrome.alarms.clear(`${LINK_JOB_DELIVERY_ALARM_PREFIX}${requestId}`).catch(() => {});
      return true;
    }
    const blockedUntil = Math.max(
      Number(job.claim?.expiresAt) || 0,
      Number(job.retryAfter) || 0
    );
    if (blockedUntil > Date.now()) {
      await chrome.alarms.create(`${LINK_JOB_CLEANUP_ALARM_PREFIX}${requestId}`, {
        when: blockedUntil + 1000
      });
      return false;
    }
    await removeLinkJobRecord(requestId);
    await chrome.alarms.clear(`${LINK_JOB_DELIVERY_ALARM_PREFIX}${requestId}`);
    return true;
  });
}

async function scheduleLinkJobDeliveryWake(requestId, when) {
  if (!Number.isFinite(when)) return;
  try {
    await chrome.alarms.create(`${LINK_JOB_DELIVERY_ALARM_PREFIX}${requestId}`, {
      when: Math.max(Date.now() + 100, when)
    });
  } catch (error) {
    console.warn('Background: failed to schedule link-job delivery wake', requestId, error);
  }
}

async function wakeLinkJobDelivery(requestId) {
  return withLinkJobLock(requestId, async () => {
    const job = await readLinkJob(requestId);
    if (!job || !['completed', 'failed'].includes(job.status)) return false;

    const now = Date.now();
    const claimExpiresAt = Number(job.claim?.expiresAt) || 0;
    const retryAfter = Number(job.retryAfter) || 0;
    const nextWake = Math.max(claimExpiresAt > now ? claimExpiresAt : 0, retryAfter > now ? retryAfter : 0);
    if (nextWake > now) {
      await scheduleLinkJobDeliveryWake(requestId, nextWake);
      return false;
    }

    const shouldClearClaim = !!job.claim && claimExpiresAt <= now;
    const shouldClearRetry = !!job.retryAfter && retryAfter <= now;
    const readyJob = shouldClearClaim || shouldClearRetry
      ? {
          ...job,
          ...(shouldClearClaim ? { claim: null } : {}),
          ...(shouldClearRetry ? { retryAfter: null } : {})
        }
      : job;
    if (readyJob !== job) await writeLinkJob(readyJob);
    notifyLinkJob(readyJob);
    return true;
  });
}

async function claimLinkJob(requestId, windowId) {
  return withLinkJobLock(requestId, async () => {
    const job = await readLinkJob(requestId);
    if (!job || job.windowId !== windowId || !['completed', 'failed'].includes(job.status)) {
      return { claimed: false, reason: 'NOT_CLAIMABLE' };
    }
    const now = Date.now();
    if (job.retryAfter && job.retryAfter > now) {
      return { claimed: false, reason: 'RETRY_LATER', retryAt: job.retryAfter };
    }
    if (job.claim?.expiresAt > now) {
      return { claimed: false, reason: 'ALREADY_CLAIMED', retryAt: job.claim.expiresAt };
    }

    const claimToken = createRequestId('claim');
    const claimedJob = {
      ...job,
      claim: {
        token: claimToken,
        claimedAt: now,
        expiresAt: now + LINK_JOB_CLAIM_MS
      }
    };
    await writeLinkJob(claimedJob);
    await scheduleLinkJobDeliveryWake(requestId, claimedJob.claim.expiresAt);
    return { claimed: true, claimToken, job: claimedJob };
  });
}

async function acknowledgeLinkJob(requestId, claimToken, windowId) {
  return withLinkJobLock(requestId, async () => {
    const job = await readLinkJob(requestId);
    if (!job) return true;
    if (job.windowId !== windowId || job.claim?.token !== claimToken) return false;
    await removeLinkJobRecord(requestId);
    await Promise.allSettled([
      chrome.alarms.clear(`${LINK_JOB_CLEANUP_ALARM_PREFIX}${requestId}`),
      chrome.alarms.clear(`${LINK_JOB_DELIVERY_ALARM_PREFIX}${requestId}`)
    ]);
    return true;
  });
}

async function releaseLinkJob(requestId, claimToken, windowId, message = '') {
  return withLinkJobLock(requestId, async () => {
    const job = await readLinkJob(requestId);
    if (!job || job.windowId !== windowId || job.claim?.token !== claimToken) return false;
    const releasedJob = {
      ...job,
      claim: null,
      deliveryAttempts: (job.deliveryAttempts || 0) + 1,
      lastDeliveryError: String(message || '').slice(0, 500),
      retryAfter: Date.now() + LINK_JOB_RETRY_MS
    };
    await writeLinkJob(releasedJob);
    await scheduleLinkJobDeliveryWake(requestId, releasedJob.retryAfter);
    return true;
  });
}

function notifyLinkJob(job) {
  chrome.runtime.sendMessage({
    type: 'LINK_EXTRACTION_JOB_UPDATED',
    requestId: job.requestId,
    windowId: job.windowId,
    storageKey: linkJobStorageKey(job.requestId),
    status: job.status
  }).catch(() => {
    // The result remains in storage.session and will be claimed when the side panel opens.
  });
}

function notifyLinkJobFailureFallback({ requestId, windowId, url, title, error }) {
  chrome.runtime.sendMessage({
    type: 'LINK_EXTRACTION_JOB_EPHEMERAL_FAILURE',
    requestId,
    windowId,
    url: String(url || '').slice(0, 2000),
    title: String(title || url || '').slice(0, 500),
    error: serializeError(error)
  }).catch(() => {});
}

function compactLinkExtractionResult(result) {
  return {
    ...result,
    content: {
      text: result.content.text,
      charCount: result.content.charCount,
      truncated: result.content.truncated,
      readerTruncated: result.content.readerTruncated,
      fullTextTruncated: result.content.fullTextTruncated
    }
  };
}

async function removeTemporaryTab(tabId) {
  if (!Number.isInteger(tabId)) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {
    if (!String(error?.message || '').includes('No tab with id')) {
      console.warn('Background: failed to remove temporary extraction tab', tabId, error);
    }
  }
}

async function finalizeLinkJob(requestId, terminalState) {
  return withLinkJobLock(requestId, async () => {
    const job = await readLinkJob(requestId);
    if (!job || job.status === 'completed' || job.status === 'failed') return job;

    const effectiveTerminalState = Date.now() >= job.deadline
      ? {
          status: 'failed',
          error: {
            code: 'TIMEOUT',
            phase: 'link-extraction',
            message: t('errorTimeout'),
            retryable: true
          }
        }
      : terminalState;
    let terminalJob = {
      ...job,
      ...effectiveTerminalState,
      claim: null,
      completedAt: Date.now()
    };
    try {
      await writeLinkJob(terminalJob);
    } catch (error) {
      if (error?.code === 'LINK_STORAGE_BUDGET_EXCEEDED' && terminalJob.result) {
        terminalJob = {
          ...job,
          status: 'failed',
          claim: null,
          completedAt: Date.now(),
          error: {
            code: 'RESULT_TOO_LARGE',
            phase: 'link-extraction',
            message: 'The extracted result exceeded the link-job storage budget.',
            retryable: false
          }
        };
        await writeLinkJob(terminalJob);
      } else {
        await removeTemporaryTab(job.tabId);
        throw error;
      }
    }
    try {
      await chrome.alarms.clear(`${LINK_JOB_TIMEOUT_ALARM_PREFIX}${requestId}`);
      await chrome.alarms.create(`${LINK_JOB_CLEANUP_ALARM_PREFIX}${requestId}`, {
        when: Date.now() + LINK_JOB_RETENTION_MS
      });
    } catch (error) {
      console.warn('Background: failed to schedule link-job cleanup', requestId, error);
    }
    await removeTemporaryTab(job.tabId);
    notifyLinkJob(terminalJob);
    return terminalJob;
  });
}

async function failLinkJob(requestId, code, message, retryable = true) {
  return finalizeLinkJob(requestId, {
    status: 'failed',
    error: { code, phase: 'link-extraction', message, retryable }
  });
}

async function processLoadedLinkJob(requestId) {
  const job = await withLinkJobLock(requestId, async () => {
    const currentJob = await readLinkJob(requestId);
    if (!currentJob || currentJob.status !== 'loading' || !Number.isInteger(currentJob.tabId)) return null;
    const extractingJob = { ...currentJob, status: 'extracting', extractionStartedAt: Date.now() };
    await writeLinkJob(extractingJob);
    return extractingJob;
  });
  if (!job) return;

  try {
    notifyLinkJob(job);

    // Give client-rendered pages a short settling window after the load event.
    await new Promise(resolve => setTimeout(resolve, 400));
    const currentJob = await readLinkJob(requestId);
    if (!currentJob || currentJob.status !== 'extracting') return;
    if (Date.now() >= currentJob.deadline) {
      await failLinkJob(requestId, 'TIMEOUT', t('errorTimeout'));
      return;
    }

    const result = await executeExtractor(currentJob.tabId, 'link', requestId);
    if (!result.ok) {
      await failLinkJob(
        requestId,
        result.error?.code || 'PARSE_FAILED',
        result.error?.message || 'Could not extract link content.',
        result.error?.retryable !== false
      );
      return;
    }

    validatePageUrl(result.source?.url || currentJob.sourceUrl, { allowFile: false });

    const latestJob = await readLinkJob(requestId);
    if (!latestJob || latestJob.status !== 'extracting') return;
    if (Date.now() >= latestJob.deadline) {
      await failLinkJob(requestId, 'TIMEOUT', t('errorTimeout'));
      return;
    }

    await finalizeLinkJob(requestId, { status: 'completed', result: compactLinkExtractionResult(result) });
  } catch (error) {
    await failLinkJob(requestId, error?.code || 'INJECTION_FAILED', serializeError(error));
  }
}

async function startLinkExtractionJob({ url, title, windowId, requestId = createRequestId('link') }) {
  if (!Number.isInteger(windowId)) throw new Error('A source window is required for link extraction.');
  const normalizedUrl = validatePageUrl(url, { allowFile: false });
  const createdAt = Date.now();
  const initialJob = {
    schemaVersion: 1,
    requestId,
    windowId,
    sourceUrl: normalizedUrl,
    sourceTitle: takeSafePrefix(title || normalizedUrl, 500),
    status: 'creating',
    createdAt,
    deadline: createdAt + LINK_JOB_TIMEOUT_MS
  };
  let admitted = false;
  let temporaryTabId = null;
  try {
    await chrome.alarms.create(`${LINK_JOB_TIMEOUT_ALARM_PREFIX}${requestId}`, {
      when: initialJob.deadline
    });
    await admitLinkJob(initialJob);
    admitted = true;
    notifyLinkJob(initialJob);

    const createProperties = { url: normalizedUrl, active: false };
    if (Number.isInteger(windowId)) createProperties.windowId = windowId;
    const tab = await chrome.tabs.create(createProperties);
    if (!tab?.id) throw new Error('The temporary tab was not created.');
    temporaryTabId = tab.id;

    const loadingJob = await withLinkJobLock(requestId, async () => {
      const currentJob = await readLinkJob(requestId);
      if (!currentJob || currentJob.status !== 'creating') return null;
      const nextJob = { ...currentJob, tabId: tab.id, status: 'loading' };
      await writeLinkJob(nextJob);
      return nextJob;
    });
    if (!loadingJob) {
      await removeTemporaryTab(temporaryTabId);
      return requestId;
    }
    notifyLinkJob(loadingJob);

    if (tab.status === 'complete') {
      void processLoadedLinkJob(requestId);
    } else {
      // Close the race between tabs.create() and registering the global onUpdated listener.
      const currentTab = await chrome.tabs.get(tab.id);
      if (currentTab.status === 'complete') void processLoadedLinkJob(requestId);
    }
  } catch (error) {
    if (!admitted) {
      await chrome.alarms.clear(`${LINK_JOB_TIMEOUT_ALARM_PREFIX}${requestId}`).catch(() => {});
      notifyLinkJobFailureFallback({ requestId, windowId, url: normalizedUrl, title, error });
      return requestId;
    }
    try {
      await failLinkJob(requestId, 'OPEN_LINK_FAILED', serializeError(error));
    } finally {
      await removeTemporaryTab(temporaryTabId);
    }
  }
  return requestId;
}

async function recoverLinkJobs() {
  const jobs = await listLinkJobs();
  for (const job of jobs) {
    if (job.status === 'completed' || job.status === 'failed') {
      await removeTemporaryTab(job.tabId);
      const cleanupAt = (job.completedAt || Date.now()) + LINK_JOB_RETENTION_MS;
      if (cleanupAt <= Date.now()) {
        await cleanupLinkJobRecord(job.requestId);
        continue;
      }
      await chrome.alarms.create(`${LINK_JOB_CLEANUP_ALARM_PREFIX}${job.requestId}`, { when: cleanupAt });
      const deliveryAt = Math.max(
        job.claim?.expiresAt > Date.now() ? job.claim.expiresAt : 0,
        job.retryAfter > Date.now() ? job.retryAfter : 0
      );
      if (deliveryAt > Date.now()) {
        await scheduleLinkJobDeliveryWake(job.requestId, deliveryAt);
      } else if (job.claim || job.retryAfter) {
        await wakeLinkJobDelivery(job.requestId);
      }
      notifyLinkJob(job);
      continue;
    }
    if (Date.now() >= job.deadline) {
      await failLinkJob(job.requestId, 'TIMEOUT', t('errorTimeout'));
      continue;
    }
    if (!Number.isInteger(job.tabId)) {
      await failLinkJob(job.requestId, 'OPEN_LINK_FAILED', 'The temporary tab was not recorded.');
      continue;
    }
    try {
      const tab = await chrome.tabs.get(job.tabId);
      const recoveredJob = await withLinkJobLock(job.requestId, async () => {
        const currentJob = await readLinkJob(job.requestId);
        if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') return null;
        if (currentJob.status !== 'extracting') return currentJob;
        const nextJob = { ...currentJob, status: 'loading' };
        await writeLinkJob(nextJob);
        return nextJob;
      });
      if (!recoveredJob) continue;
      await chrome.alarms.create(`${LINK_JOB_TIMEOUT_ALARM_PREFIX}${job.requestId}`, { when: job.deadline });
      if (tab.status === 'complete') void processLoadedLinkJob(job.requestId);
    } catch (error) {
      await failLinkJob(job.requestId, 'TAB_CLOSED', serializeError(error), false);
    }
  }
}

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['geminiApiKey', 'interfaceLanguage']);
    if (result.geminiApiKey) {
      geminiApiKey = result.geminiApiKey;
    }
    if (result.interfaceLanguage) {
      currentLanguage = result.interfaceLanguage;
    }
    updateContextMenu();
  } catch (e) {
    console.error("Background: Error loading settings:", e);
  }
}

function updateContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "analyzeImageWithGemini",
      title: t('analyzeImage'),
      contexts: ["image"]
    });
    chrome.contextMenus.create({
      id: "summarizeLinkTarget",
      title: t('summarizeLink'),
      contexts: ["link"]
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  loadSettings();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'guide/index.html' });
  }
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeImageWithGemini" && info.srcUrl) {
    chrome.runtime.sendMessage({
      type: "IMAGE_SELECTED_FOR_SIDEBAR",
      imageUrl: info.srcUrl,
      windowId: tab?.windowId,
      tabId: tab?.id
    }, response => {
      if (chrome.runtime.lastError) {
        console.log("Background: Sidebar not open?", chrome.runtime.lastError.message);
      }
    });
  } else if (info.menuItemId === "summarizeLinkTarget" && info.linkUrl) {
    const requestId = createRequestId('link');
    const windowId = tab?.windowId;

    if (!Number.isInteger(windowId)) {
      console.warn('Background: cannot start link extraction without a source window.');
      return;
    }

    if (Number.isInteger(windowId)) {
      chrome.sidePanel.open({ windowId }).catch(error => {
        console.warn('Background: failed to open the side panel for link extraction', error);
      });
    }

    void startLinkExtractionJob({
      requestId,
      url: info.linkUrl,
      title: info.selectionText || info.linkUrl,
      windowId
    }).catch(error => {
      notifyLinkJobFailureFallback({ requestId, windowId, url: info.linkUrl, title: info.linkUrl, error });
      console.error('Background: context-menu link extraction was rejected', error);
    });
  }
});


(async () => {
  await loadSettings();
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("Background: Failed to set side panel behavior:", error);
  }
  try {
    await recoverLinkJobs();
  } catch (error) {
    console.error('Background: failed to recover link extraction jobs:', error);
  }
})();

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.geminiApiKey) {
      geminiApiKey = changes.geminiApiKey.newValue;
    }
    if (changes.interfaceLanguage) {
      currentLanguage = changes.interfaceLanguage.newValue || 'zh';
      updateContextMenu();
    }
  }
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'g-extension-sidebar' || !isSidebarSender(port.sender)) {
    try {
      port.disconnect();
    } catch (_) {
      // Ignore ports that already disconnected.
    }
    return;
  }
  let registeredWindowId = null;

  port.onMessage.addListener(message => {
    if (message?.type !== 'REGISTER_SIDEBAR' || !Number.isInteger(message.windowId)) return;
    if (registeredWindowId === message.windowId) return;
    if (Number.isInteger(registeredWindowId)) {
      const previousCount = Math.max(0, (connectedSidebarWindows.get(registeredWindowId) || 1) - 1);
      if (previousCount === 0) connectedSidebarWindows.delete(registeredWindowId);
      else connectedSidebarWindows.set(registeredWindowId, previousCount);
    }
    registeredWindowId = message.windowId;
    connectedSidebarWindows.set(message.windowId, (connectedSidebarWindows.get(message.windowId) || 0) + 1);
  });

  port.onDisconnect.addListener(() => {
    if (!Number.isInteger(registeredWindowId)) return;
    const nextCount = Math.max(0, (connectedSidebarWindows.get(registeredWindowId) || 1) - 1);
    if (nextCount === 0) connectedSidebarWindows.delete(registeredWindowId);
    else connectedSidebarWindows.set(registeredWindowId, nextCount);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  void listLinkJobIndexEntries().then(entries => {
    entries
      .filter(entry => entry.tabId === tabId && entry.status === 'loading')
      .forEach(entry => void processLoadedLinkJob(entry.requestId));
  }).catch(error => console.warn('Background: failed to inspect link jobs after tab update', error));
});

chrome.tabs.onRemoved.addListener(tabId => {
  void listLinkJobIndexEntries().then(entries => Promise.all(
    entries
      .filter(entry => entry.tabId === tabId && entry.status !== 'completed' && entry.status !== 'failed')
      .map(entry => failLinkJob(entry.requestId, 'TAB_CLOSED', 'The temporary extraction tab was closed.', false))
  )).catch(error => console.warn('Background: failed to close removed-tab extraction jobs', error));
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name.startsWith(LINK_JOB_TIMEOUT_ALARM_PREFIX)) {
    const requestId = alarm.name.slice(LINK_JOB_TIMEOUT_ALARM_PREFIX.length);
    void failLinkJob(requestId, 'TIMEOUT', t('errorTimeout')).catch(error => {
      console.error('Background: failed to time out link extraction job', requestId, error);
    });
    return;
  }
  if (alarm.name.startsWith(LINK_JOB_CLEANUP_ALARM_PREFIX)) {
    const requestId = alarm.name.slice(LINK_JOB_CLEANUP_ALARM_PREFIX.length);
    void cleanupLinkJobRecord(requestId).catch(error => {
      console.warn('Background: failed to clean up link extraction job', requestId, error);
    });
    return;
  }
  if (alarm.name.startsWith(LINK_JOB_DELIVERY_ALARM_PREFIX)) {
    const requestId = alarm.name.slice(LINK_JOB_DELIVERY_ALARM_PREFIX.length);
    void wakeLinkJobDelivery(requestId).catch(error => {
      console.warn('Background: failed to wake link-job delivery', requestId, error);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request?.action;
  if (SIDEBAR_ACTIONS.has(action) && !isSidebarSender(sender)) {
    sendResponse({ success: false, error: 'Unauthorized sidebar action.' });
    return false;
  }
  if (CONTENT_SCRIPT_ACTIONS.has(action) && !isContentScriptSender(sender)) {
    sendResponse({ success: false, error: 'Unauthorized content-script action.' });
    return false;
  }

  if (request.action === "getAndSummarizePage") {
    void extractFromRequestedTab(request, 'reader').then(({ result }) => {
      if (!result.ok || !result.content?.text) {
        sendResponse({
          error: result.error?.message || t('errorContentInvalid'),
          requestId: result.requestId,
          warnings: result.warnings || []
        });
        return;
      }
      sendResponse({
        success: true,
        requestId: result.requestId,
        extraction: result,
        contentForSummary: result.content.text,
        pageUrl: result.source?.url || '',
        pageTitle: result.source?.title || '',
        truncated: !!result.content.truncated,
        warnings: result.warnings || []
      });
    }).catch(error => {
      sendResponse({ error: t('errorInjectFail') + serializeError(error), requestId: request.requestId || null });
    });
    return true;
  } else if (request.action === "openSidePanel") {
    const windowId = sender.tab?.windowId;
    const openPromise = Number.isInteger(windowId)
      ? chrome.sidePanel.open({ windowId })
      : Promise.reject(new Error(t('errorActiveTab')));
    void openPromise.then(() => sendResponse({ success: true })).catch(error => {
      console.error("Failed to open side panel:", error);
      sendResponse({ success: false, error: serializeError(error) });
    });
    return true;
  } else if (request.action === "extractActiveTabContent") {
    void extractFromRequestedTab(request, 'visible').then(({ result }) => {
      if (!result.ok) {
        sendResponse({ success: false, requestId: result.requestId, result, error: result.error?.message || t('errorContentInvalid') });
        return;
      }
      sendResponse({ success: true, requestId: result.requestId, result });
    }).catch(error => {
      sendResponse({ success: false, error: t('errorInjectFail') + serializeError(error), requestId: request.requestId || null });
    });
    return true;
  } else if (request.action === "extractActiveTabRegexSource") {
    void extractFromRequestedTab(request, 'both').then(({ result }) => {
      if (!result.ok) {
        sendResponse({ success: false, requestId: result.requestId, result, error: result.error?.message || t('errorContentInvalid') });
        return;
      }
      sendResponse({ success: true, requestId: result.requestId, result });
    }).catch(error => {
      sendResponse({ success: false, error: t('errorInjectFail') + serializeError(error), requestId: request.requestId || null });
    });
    return true;
  } else if (request.action === 'listLinkJobsForWindow') {
    if (!Number.isInteger(request.windowId)) {
      sendResponse({ success: false, error: 'A valid windowId is required.' });
      return false;
    }
    void listLinkJobs(request.windowId).then(jobs => {
      sendResponse({ success: true, jobs });
    }).catch(error => sendResponse({ success: false, error: serializeError(error) }));
    return true;
  } else if (request.action === 'claimLinkJob') {
    if (!Number.isInteger(request.windowId) || typeof request.requestId !== 'string') {
      sendResponse({ success: false, error: 'A valid job identity is required.' });
      return false;
    }
    void claimLinkJob(request.requestId, request.windowId).then(result => {
      sendResponse({ success: true, ...result });
    }).catch(error => sendResponse({ success: false, error: serializeError(error) }));
    return true;
  } else if (request.action === 'ackLinkJob') {
    if (!Number.isInteger(request.windowId) || typeof request.requestId !== 'string' || typeof request.claimToken !== 'string') {
      sendResponse({ success: false, reason: 'INVALID_ARGUMENT', error: 'A valid claim identity is required.' });
      return false;
    }
    void acknowledgeLinkJob(request.requestId, request.claimToken, request.windowId).then(acknowledged => {
      sendResponse({ success: acknowledged, reason: acknowledged ? null : 'STALE_CLAIM' });
    }).catch(error => sendResponse({ success: false, error: serializeError(error) }));
    return true;
  } else if (request.action === 'releaseLinkJob') {
    if (!Number.isInteger(request.windowId) || typeof request.requestId !== 'string' || typeof request.claimToken !== 'string') {
      sendResponse({ success: false, reason: 'INVALID_ARGUMENT', error: 'A valid claim identity is required.' });
      return false;
    }
    void releaseLinkJob(request.requestId, request.claimToken, request.windowId, request.error).then(async released => {
      const releasedJob = released ? await readLinkJob(request.requestId) : null;
      sendResponse({
        success: released,
        reason: released ? null : 'STALE_CLAIM',
        retryAt: releasedJob?.retryAfter || null
      });
    }).catch(error => sendResponse({ success: false, error: serializeError(error) }));
    return true;
  } else if (request.action === "shouldCaptureSelection") {
    const windowId = sender.tab?.windowId;
    sendResponse({ capture: Number.isInteger(windowId) && (connectedSidebarWindows.get(windowId) || 0) > 0 });
    return false;
  } else if (request.action === "TEXT_SELECTED_FROM_PAGE") {
    const selectedText = typeof request.text === 'string' ? takeSafePrefix(request.text, 200000) : '';
    if (!selectedText) {
      sendResponse({ status: 'Ignored empty selection' });
      return false;
    }
    chrome.runtime.sendMessage({
      type: "TEXT_SELECTED_FOR_SIDEBAR",
      text: selectedText,
      windowId: sender.tab?.windowId,
      tabId: sender.tab?.id,
      url: sender.tab?.url || '',
      title: sender.tab?.title || ''
    }).catch(() => {
      // The side panel may have closed after selection capture was authorized.
    });
    sendResponse({ status: "Text selected event forwarded" });
    return false;
  } else if (request.action === "summarizeLinkTarget") {
    const linkUrl = request.url;
    const linkText = String(request.linkText || linkUrl || '').slice(0, 500);
    const windowId = sender.tab?.windowId;
    const requestId = createRequestId('link');
    try {
      if (!Number.isInteger(windowId)) throw new Error('A source window is required.');
      validatePageUrl(linkUrl, { allowFile: false });
    } catch (error) {
      sendResponse({ accepted: false, requestId, error: serializeError(error) });
      return false;
    }

    void startLinkExtractionJob({ url: linkUrl, title: linkText, windowId, requestId }).catch(error => {
      console.error('Background: failed to start link extraction job', requestId, error);
      notifyLinkJobFailureFallback({ requestId, windowId, url: linkUrl, title: linkText, error });
    });
    sendResponse({ accepted: true, requestId, status: t('linkProcessing') });
    return false;
  }

  return false;
});
