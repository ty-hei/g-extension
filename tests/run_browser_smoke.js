'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const HARNESS_PATH = '/tests/browser_harness.html';
const BROWSER_TIMEOUT_MS = 30000;
const MAX_DIAGNOSTIC_BYTES = 5 * 1024 * 1024;
const REQUIRED_SMOKE_TESTS = Object.freeze([
  'dangerous nodes are dropped',
  'javascript links lose href',
  'https links are retained',
  'event/style attributes are stripped',
  'safe links get rel protection',
  'link preview is created lazily by a real drag event',
  'link preview uses a genuinely closed ShadowRoot',
  'link preview styles stay inside the ShadowRoot',
  'drop canonicalizes and renders the URL as text',
  'drop opens the side panel through the extension message boundary',
  'summarize action sends the validated URL and closes the preview',
  'multiline regex extracts every line',
  'unicode zero-width regex terminates',
  'runaway regex can be terminated without blocking the page'
]);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function browserCandidates() {
  const configured = [
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_BIN
  ];
  const common = process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ]
    : process.platform === 'win32'
      ? [
          path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe')
        ]
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

  return [...new Set([...configured, ...common].filter(Boolean))];
}

function findBrowser() {
  for (const candidate of browserCandidates()) {
    if ((path.isAbsolute(candidate) || candidate.includes(path.sep)) && !fs.existsSync(candidate)) {
      continue;
    }

    const probe = childProcess.spawnSync(candidate, ['--version'], {
      stdio: 'ignore',
      timeout: 5000
    });
    if (!probe.error && probe.status === 0) return candidate;
  }

  throw new Error('Chrome or Chromium was not found. Set CHROME_BIN to its executable path.');
}

function resolveRequestPath(requestUrl) {
  try {
    const pathname = decodeURIComponent(new URL(requestUrl || '/', 'http://localhost').pathname);
    const relativePath = pathname.replace(/^\/+/, '');
    const filePath = path.resolve(REPOSITORY_ROOT, relativePath);
    if (filePath !== REPOSITORY_ROOT && !filePath.startsWith(REPOSITORY_ROOT + path.sep)) {
      return null;
    }
    return filePath;
  } catch (_) {
    return null;
  }
}

function startServer() {
  const server = http.createServer((request, response) => {
    const filePath = resolveRequestPath(request.url);
    if (!filePath) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream'
      });
      fs.createReadStream(filePath)
        .on('error', () => response.destroy())
        .pipe(response);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

class DevToolsPipe {
  constructor(input, output) {
    this.input = input;
    this.output = output;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;

    output.on('data', chunk => this.handleData(chunk));
    output.on('error', error => this.close(error));
    input.on('error', error => this.close(error));
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let separatorIndex = this.buffer.indexOf(0);
    while (separatorIndex !== -1) {
      const messageBytes = this.buffer.subarray(0, separatorIndex);
      this.buffer = this.buffer.subarray(separatorIndex + 1);
      if (messageBytes.length > 0) {
        try {
          const message = JSON.parse(messageBytes.toString('utf8'));
          if (message.id && this.pending.has(message.id)) {
            const pending = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) {
              pending.reject(new Error(
                `DevTools ${pending.method} failed: ${message.error.message || 'unknown error'}`
              ));
            } else {
              pending.resolve(message.result || {});
            }
          }
        } catch (error) {
          this.close(error);
          return;
        }
      }
      separatorIndex = this.buffer.indexOf(0);
    }
  }

  send(method, params = {}, sessionId = null) {
    if (this.closed) return Promise.reject(new Error('The DevTools pipe is closed.'));
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.input.write(`${JSON.stringify(message)}\0`, error => {
        if (!error || !this.pending.has(id)) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  close(error = new Error('The DevTools pipe closed before the command completed.')) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function stopBrowser(processHandle, exitPromise) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
    await exitPromise;
    return;
  }
  processHandle.kill('SIGTERM');
  const closedGracefully = await Promise.race([
    exitPromise.then(() => true),
    delay(2000).then(() => false)
  ]);
  if (!closedGracefully) {
    processHandle.kill('SIGKILL');
    const closedAfterKill = await Promise.race([
      exitPromise.then(() => true),
      delay(2000).then(() => false)
    ]);
    if (!closedAfterKill) {
      for (const stream of processHandle.stdio) stream?.destroy?.();
      processHandle.unref();
      throw new Error('Browser process did not exit after SIGKILL.');
    }
  }
}

function validateSmokeResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Browser harness returned no test results.');
  }

  const nameCounts = new Map();
  for (const result of results) {
    const name = result && typeof result.name === 'string' ? result.name : '';
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }
  const missingOrDuplicate = REQUIRED_SMOKE_TESTS.filter(name => nameCounts.get(name) !== 1);
  if (missingOrDuplicate.length > 0) {
    throw new Error(
      `Browser harness is missing required tests or contains duplicates: ${missingOrDuplicate.join(', ')}`
    );
  }
  return results.filter(result => !result || result.passed !== true);
}

function runBrowserProtocol(devTools, url) {
  return (async () => {
    const target = await devTools.send('Target.createTarget', { url });
    const attachment = await devTools.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true
    });
    const sessionId = attachment.sessionId;
    await devTools.send('Runtime.enable', {}, sessionId);

    while (true) {
      const evaluation = await devTools.send('Runtime.evaluate', {
        expression: `(() => ({
          complete: document.documentElement.dataset.testsComplete === 'true',
          results: Array.isArray(window.browserSmokeResults) ? window.browserSmokeResults : null
        }))()`,
        returnByValue: true
      }, sessionId);
      const value = evaluation.result && evaluation.result.value;
      if (value && value.complete) {
        const installedResults = await inspectInstalledExtension(devTools);
        return [...value.results, ...installedResults];
      }
      await delay(50);
    }
  })();
}

async function inspectInstalledExtension(devTools) {
  let backgroundTarget = null;
  for (let attempt = 0; attempt < 100 && !backgroundTarget; attempt += 1) {
    const targets = await devTools.send('Target.getTargets');
    backgroundTarget = targets.targetInfos?.find(target =>
      target.type === 'service_worker' && /^chrome-extension:\/\/[^/]+\/background\.js$/.test(target.url)
    );
    if (!backgroundTarget) await delay(50);
  }
  if (!backgroundTarget) {
    console.log('SKIP installed-extension smoke: this Chrome build did not load --load-extension (use Chromium or Chrome for Testing).');
    return [];
  }

  const extensionOrigin = backgroundTarget.url.match(/^chrome-extension:\/\/[^/]+/)?.[0];
  const guideTarget = await devTools.send('Target.createTarget', { url: `${extensionOrigin}/guide/index.html` });
  const attachment = await devTools.send('Target.attachToTarget', { targetId: guideTarget.targetId, flatten: true });
  await devTools.send('Runtime.enable', {}, attachment.sessionId);
  let guideState = null;
  for (let attempt = 0; attempt < 100 && !guideState?.ready; attempt += 1) {
    const evaluation = await devTools.send('Runtime.evaluate', {
      expression: `(() => {
        const button = document.getElementById('langBtn');
        if (!button || document.readyState === 'loading') return { ready: false };
        button.click();
        return {
          ready: true,
          lang: document.documentElement.lang,
          externalScriptLoaded: typeof IntersectionObserver === 'function' && button.textContent === '中',
          inlineHandlerAbsent: button.getAttribute('onclick') === null
        };
      })()`,
      returnByValue: true
    }, attachment.sessionId);
    guideState = evaluation.result?.value;
    if (!guideState?.ready) await delay(50);
  }

  return [
    { name: 'unpacked extension starts its service worker', passed: true },
    {
      name: 'installed guide runs under extension CSP',
      passed: guideState?.lang === 'en' && guideState.externalScriptLoaded && guideState.inlineHandlerAbsent,
      details: guideState ? JSON.stringify(guideState) : 'Guide did not become ready.'
    }
  ];
}

async function runBrowser(browser, url, profileDirectory) {
  const args = [
    '--headless=new',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    `--disable-extensions-except=${REPOSITORY_ROOT}`,
    `--load-extension=${REPOSITORY_ROOT}`,
    '--no-first-run',
    `--user-data-dir=${profileDirectory}`,
    '--remote-debugging-pipe',
    'about:blank'
  ];
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    args.unshift('--no-sandbox');
  }

  const processHandle = childProcess.spawn(browser, args, {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']
  });
  let stderr = '';
  processHandle.stderr.setEncoding('utf8');
  processHandle.stderr.on('data', chunk => {
    if (Buffer.byteLength(stderr) < MAX_DIAGNOSTIC_BYTES) stderr += chunk;
  });
  const exitPromise = new Promise(resolve => {
    processHandle.once('close', (code, signal) => resolve({ code, signal }));
  });
  const devTools = new DevToolsPipe(processHandle.stdio[3], processHandle.stdio[4]);
  processHandle.once('close', () => devTools.close());
  processHandle.once('error', error => devTools.close(error));

  let timeout;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(
        `Browser smoke test timed out after ${BROWSER_TIMEOUT_MS}ms.\n${stderr.trim()}`
      )), BROWSER_TIMEOUT_MS);
    });
    return await Promise.race([
      runBrowserProtocol(devTools, url),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeout);
    devTools.close();
    await stopBrowser(processHandle, exitPromise);
  }
}

async function main() {
  const browser = findBrowser();
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'g-extension-browser-smoke-'));
  let server = null;

  try {
    server = await startServer();
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}${HARNESS_PATH}`;
    const results = await runBrowser(browser, url, profileDirectory);
    const failures = validateSmokeResults(results);
    for (const result of results) {
      const marker = result && result.passed === true ? 'PASS' : 'FAIL';
      console.log(`${marker} ${result && result.name ? result.name : 'unnamed test'}`);
      if (result && result.details) console.log(`  ${result.details}`);
    }

    console.log(`Browser smoke: ${results.length - failures.length}/${results.length} passed`);
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    if (server && server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  DevToolsPipe,
  REQUIRED_SMOKE_TESTS,
  resolveRequestPath,
  validateSmokeResults
};
