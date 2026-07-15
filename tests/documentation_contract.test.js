'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

function headingSlug(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function collectAnchors(markdown) {
  const anchors = new Set();
  const counts = new Map();
  let inFence = false;

  for (const match of markdown.matchAll(/<a\s+[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi)) {
    anchors.add(match[1]);
  }

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    const base = headingSlug(heading[1]);
    if (!base) continue;
    const duplicateCount = counts.get(base) || 0;
    counts.set(base, duplicateCount + 1);
    anchors.add(duplicateCount === 0 ? base : `${base}-${duplicateCount}`);
  }

  return anchors;
}

function localMarkdownTargets(markdown) {
  const targets = [];
  let inFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    for (const match of line.matchAll(/!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^(?:https?:|mailto:|data:)/i.test(target)) continue;
      targets.push(target);
    }
  }

  return targets;
}

test('all local Markdown links resolve to files and documented anchors', function () {
  const markdownFiles = walk(ROOT, filePath => filePath.endsWith('.md'));
  const anchorCache = new Map();
  const failures = [];

  for (const markdownPath of markdownFiles) {
    const markdown = fs.readFileSync(markdownPath, 'utf8');
    for (const target of localMarkdownTargets(markdown)) {
      const hashIndex = target.indexOf('#');
      const rawFile = hashIndex === -1 ? target : target.slice(0, hashIndex);
      const rawAnchor = hashIndex === -1 ? '' : target.slice(hashIndex + 1);
      let filePart;
      let anchorPart;
      try {
        filePart = decodeURIComponent(rawFile);
        anchorPart = decodeURIComponent(rawAnchor);
      } catch (error) {
        failures.push(`${path.relative(ROOT, markdownPath)} -> ${target}: invalid URL encoding`);
        continue;
      }

      const resolvedPath = filePart
        ? path.resolve(path.dirname(markdownPath), filePart)
        : markdownPath;
      if (resolvedPath !== ROOT && !resolvedPath.startsWith(ROOT + path.sep)) {
        failures.push(`${path.relative(ROOT, markdownPath)} -> ${target}: escapes repository root`);
        continue;
      }
      if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
        failures.push(`${path.relative(ROOT, markdownPath)} -> ${target}: file not found`);
        continue;
      }

      if (!anchorPart || path.extname(resolvedPath).toLowerCase() !== '.md') continue;
      if (!anchorCache.has(resolvedPath)) {
        anchorCache.set(resolvedPath, collectAnchors(fs.readFileSync(resolvedPath, 'utf8')));
      }
      if (!anchorCache.get(resolvedPath).has(anchorPart.toLowerCase())) {
        failures.push(`${path.relative(ROOT, markdownPath)} -> ${target}: anchor not found`);
      }
    }
  }

  assert.ok(markdownFiles.length >= 7, 'expected the project documentation set to be present');
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('documentation hub exposes the maintained guides in both languages', function () {
  const hub = fs.readFileSync(path.join(ROOT, 'docs', 'README.md'), 'utf8');
  const bilingualFiles = [
    'docs/user-guide.md',
    'docs/architecture.md',
    'docs/development.md',
    'docs/troubleshooting.md',
    'CONTRIBUTING.md'
  ];

  for (const relativePath of bilingualFiles) {
    const contents = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.match(contents, /<a id="english"><\/a>/, `${relativePath} needs a stable English anchor`);
  }

  for (const expectedTarget of [
    './user-guide.md',
    './architecture.md',
    './development.md',
    './troubleshooting.md',
    '../CONTRIBUTING.md',
    '../privacy_policy/privacy_policy_zh.html',
    '../privacy_policy/index.html'
  ]) {
    assert.ok(hub.includes(expectedTarget), `documentation hub is missing ${expectedTarget}`);
  }
});

test('local links in packaged HTML resolve', function () {
  const htmlFiles = walk(ROOT, filePath => filePath.endsWith('.html'));
  const failures = [];

  for (const htmlPath of htmlFiles) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
      const target = match[2];
      if (!target || /^(?:https?:|mailto:|data:|javascript:|#)/i.test(target)) continue;
      let pathname;
      try {
        pathname = decodeURIComponent(target.split(/[?#]/, 1)[0]);
      } catch (_) {
        failures.push(`${path.relative(ROOT, htmlPath)} -> ${target}: invalid URL encoding`);
        continue;
      }
      const resolvedPath = pathname.startsWith('/')
        ? path.join(ROOT, pathname.slice(1))
        : path.resolve(path.dirname(htmlPath), pathname);
      if (resolvedPath !== ROOT && !resolvedPath.startsWith(ROOT + path.sep)) {
        failures.push(`${path.relative(ROOT, htmlPath)} -> ${target}: escapes repository root`);
      } else if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
        failures.push(`${path.relative(ROOT, htmlPath)} -> ${target}: file not found`);
      }
    }
  }

  assert.deepEqual(failures, [], failures.join('\n'));
});

test('the installed options page uses packaged privacy docs without passive font requests', function () {
  const optionsHtml = fs.readFileSync(path.join(ROOT, 'options.html'), 'utf8');
  const guideHtml = fs.readFileSync(path.join(ROOT, 'guide', 'index.html'), 'utf8');

  assert.match(optionsHtml, /href="privacy_policy\/privacy_policy_zh\.html"/);
  assert.doesNotMatch(optionsHtml, /privacy-policy\.browser-plugin\.heihaheihaha\.com/);
  assert.doesNotMatch(guideHtml, /fonts\.(?:googleapis|gstatic)\.com/);
});

test('Markdown documents have balanced fences and no trailing whitespace', function () {
  const failures = [];
  for (const markdownPath of walk(ROOT, filePath => filePath.endsWith('.md'))) {
    const relativePath = path.relative(ROOT, markdownPath);
    const lines = fs.readFileSync(markdownPath, 'utf8').split(/\r?\n/);
    const fenceCount = lines.filter(line => /^\s*```/.test(line)).length;
    if (fenceCount % 2 !== 0) failures.push(`${relativePath}: unbalanced fenced code block`);
    lines.forEach((line, index) => {
      if (/[ \t]+$/.test(line)) failures.push(`${relativePath}:${index + 1}: trailing whitespace`);
    });
  }

  assert.deepEqual(failures, [], failures.join('\n'));
});

test('published documentation uses the canonical repository URL', function () {
  const documentationFiles = [
    ...walk(path.join(ROOT, 'guide'), filePath => filePath.endsWith('.html')),
    ...walk(path.join(ROOT, 'privacy_policy'), filePath => filePath.endsWith('.html')),
    ...walk(path.join(ROOT, 'docs'), filePath => filePath.endsWith('.md')),
    path.join(ROOT, 'README.md'),
    path.join(ROOT, 'README.en.md'),
    path.join(ROOT, 'CONTRIBUTING.md')
  ];
  const staleReferences = documentationFiles
    .filter(filePath => fs.readFileSync(filePath, 'utf8').includes('github.com/ty-hei/g-extension'))
    .map(filePath => path.relative(ROOT, filePath));

  assert.deepEqual(staleReferences, []);
});
