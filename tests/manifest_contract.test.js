'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const MANIFEST_SOURCE = fs.readFileSync(MANIFEST_PATH, 'utf8');

function readManifest() {
  return JSON.parse(MANIFEST_SOURCE);
}

test('manifest.json is valid JSON for a Manifest V3 extension', function () {
  assert.doesNotThrow(function () {
    JSON.parse(MANIFEST_SOURCE);
  });

  const manifest = readManifest();
  assert.equal(manifest.manifest_version, 3);
});

test('manifest declares alarm support and a modern minimum Chrome version', function () {
  const manifest = readManifest();

  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes('alarms'));
  assert.equal(typeof manifest.minimum_chrome_version, 'string');
  assert.match(manifest.minimum_chrome_version, /^\d+$/);
  assert.ok(Number.parseInt(manifest.minimum_chrome_version, 10) >= 120);
});

test('manifest does not expose packaged files as web-accessible resources', function () {
  const manifest = readManifest();

  assert.equal(Object.hasOwn(manifest, 'web_accessible_resources'), false);
});

test('every file referenced directly by the manifest exists', function () {
  const manifest = readManifest();
  const references = [];

  function addReference(value, field) {
    if (typeof value === 'string' && value.length > 0) {
      references.push({ value, field });
    }
  }

  addReference(manifest.options_page, 'options_page');
  addReference(manifest.background && manifest.background.service_worker, 'background.service_worker');
  addReference(manifest.action && manifest.action.default_popup, 'action.default_popup');
  addReference(manifest.side_panel && manifest.side_panel.default_path, 'side_panel.default_path');

  for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    addReference(iconPath, 'icons.' + size);
  }

  for (const [index, contentScript] of (manifest.content_scripts || []).entries()) {
    for (const scriptPath of contentScript.js || []) {
      addReference(scriptPath, 'content_scripts.' + index + '.js');
    }
    for (const stylePath of contentScript.css || []) {
      addReference(stylePath, 'content_scripts.' + index + '.css');
    }
  }

  if (manifest.default_locale) {
    addReference(
      path.join('_locales', manifest.default_locale, 'messages.json'),
      'default_locale'
    );
  }

  assert.ok(references.length > 0);
  for (const reference of references) {
    const absolutePath = path.resolve(ROOT, reference.value);
    assert.equal(
      fs.existsSync(absolutePath),
      true,
      reference.field + ' references missing file: ' + reference.value
    );
    assert.equal(
      fs.statSync(absolutePath).isFile(),
      true,
      reference.field + ' must reference a file: ' + reference.value
    );
  }
});
