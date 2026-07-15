'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function walk(directory, predicate) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walk(absolutePath, predicate));
    if (entry.isFile() && predicate(absolutePath)) results.push(absolutePath);
  }
  return results;
}

function extractTagAttribute(html, tagName, attributeName) {
  const values = [];
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const attributePattern = new RegExp(`\\b${attributeName}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  for (const match of html.matchAll(tagPattern)) {
    const attribute = match[0].match(attributePattern);
    if (attribute) values.push(attribute[2]);
  }
  return values;
}

function resolveExtensionResource(htmlPath, resourcePath) {
  const withoutQuery = resourcePath.split(/[?#]/, 1)[0];
  if (withoutQuery.startsWith('/')) return path.join(ROOT, withoutQuery.slice(1));
  return path.resolve(path.dirname(htmlPath), withoutQuery);
}

test('all extension page scripts are packaged locally and exist', function () {
  const htmlFiles = walk(ROOT, filePath => filePath.endsWith('.html'));
  const missing = [];
  const remote = [];

  for (const htmlPath of htmlFiles) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const scriptSource of extractTagAttribute(html, 'script', 'src')) {
      if (/^(?:[a-z]+:)?\/\//i.test(scriptSource) || /^(?:data|javascript):/i.test(scriptSource)) {
        remote.push(`${path.relative(ROOT, htmlPath)} -> ${scriptSource}`);
        continue;
      }
      const scriptPath = resolveExtensionResource(htmlPath, scriptSource);
      if (!fs.existsSync(scriptPath)) {
        missing.push(`${path.relative(ROOT, htmlPath)} -> ${scriptSource}`);
      }
    }
  }

  assert.deepEqual(remote, [], `remote executable scripts are not allowed:\n${remote.join('\n')}`);
  assert.deepEqual(missing, [], `missing packaged scripts:\n${missing.join('\n')}`);
});

test('all local stylesheet and image references resolve to packaged files', function () {
  const htmlFiles = walk(ROOT, filePath => filePath.endsWith('.html'));
  const missing = [];

  for (const htmlPath of htmlFiles) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const resources = [
      ...extractTagAttribute(html, 'link', 'href'),
      ...extractTagAttribute(html, 'img', 'src')
    ];
    for (const resource of resources) {
      if (!resource || /^(?:[a-z]+:)?\/\//i.test(resource) || /^(?:data|#)/i.test(resource)) continue;
      const resourcePath = resolveExtensionResource(htmlPath, resource);
      if (!fs.existsSync(resourcePath)) {
        missing.push(`${path.relative(ROOT, htmlPath)} -> ${resource}`);
      }
    }
  }

  assert.deepEqual(missing, [], `missing packaged page resources:\n${missing.join('\n')}`);
});

test('every packaged runtime JavaScript file parses as a classic script', function () {
  const runtimeFiles = [
    ...fs.readdirSync(ROOT)
      .filter(fileName => fileName.endsWith('.js'))
      .map(fileName => path.join(ROOT, fileName)),
    ...fs.readdirSync(path.join(ROOT, 'libs'))
      .filter(fileName => fileName.endsWith('.js'))
      .map(fileName => path.join(ROOT, 'libs', fileName))
  ];
  const failures = [];

  for (const filePath of runtimeFiles) {
    try {
      new vm.Script(fs.readFileSync(filePath, 'utf8'), { filename: filePath });
    } catch (error) {
      failures.push(`${path.relative(ROOT, filePath)}: ${error.message}`);
    }
  }

  assert.ok(runtimeFiles.length > 0);
  assert.deepEqual(failures, [], `runtime syntax failures:\n${failures.join('\n')}`);
});
