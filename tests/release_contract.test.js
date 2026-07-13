'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const { PACKAGE_FILES, buildPackage } = require('../scripts/package_extension.js');

test('extension pages declare language and the installed guide contains no inline executable code', function () {
  for (const file of ['sidebar.html', 'options.html', 'archive.html', 'prompts.html', 'guide/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(html, /<html\b[^>]*\blang=["'][^"']+["']/i, `${file} must declare its language`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file} must not use inline event handlers`);
    assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/i, `${file} must not use inline scripts`);
    assert.equal(html.includes('\uFFFD'), false, `${file} contains a replacement character`);
  }
});

test('manifest uses only the documented broad host grant and disables split incognito storage', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.incognito, 'not_allowed');
  assert.equal(manifest.permissions.includes('activeTab'), false);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
});

test('release package is deterministic and excludes development and obsolete files', function () {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'g-extension-package-'));
  const first = buildPackage(path.join(directory, 'first.zip'));
  const second = buildPackage(path.join(directory, 'second.zip'));
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

  assert.equal(hash(first), hash(second));
  for (const required of ['manifest.json', 'guide/index.js', 'THIRD_PARTY_NOTICES.md']) {
    assert.equal(PACKAGE_FILES.includes(required), true);
  }
  for (const excluded of ['tests/browser_harness.html', 'popup.html', 'content.js', '.DS_Store']) {
    assert.equal(PACKAGE_FILES.includes(excluded), false);
  }
});
