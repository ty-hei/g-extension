'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('sidebar keeps primary actions visible and provides an accessible empty state', function () {
  const html = read('sidebar.html');
  const css = read('sidebar.css');
  const script = read('sidebar.js');

  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(0, 1fr\)\s+40px/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  assert.match(html, /id="toggleMoreActionsButton"[^>]+aria-label="更多操作"/);
  assert.match(html, /id="clearAllHistoryButton"[^>]+aria-label="清除所有历史"/);
  assert.match(html, /id="promptShortcutsSection"[^>]+hidden/);
  assert.match(html, /class="chat-empty-state"/);
  assert.match(script, /function renderChatEmptyState\(\)/);
  assert.match(script, /emptyChatTitle:\s*"从当前网页开始"/);
  assert.match(script, /promptShortcutsSection\.hidden = sortedPrompts\.length === 0/);
});

test('all primary UI surfaces respect reduced-motion preferences', function () {
  for (const relativePath of [
    'sidebar.css',
    'archive.css',
    'prompts.css',
    'options.html',
    'guide/index.html'
  ]) {
    assert.match(
      read(relativePath),
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
      `${relativePath} must provide a reduced-motion mode`
    );
  }
});

test('archive initial markup is localized and destructive controls follow empty state', function () {
  const html = read('archive.html');
  const script = read('archive.js');

  assert.match(html, />0 个对话</);
  assert.match(html, />请选择一个对话查看详情</);
  assert.match(html, /placeholder="输入消息\.\.\."/);
  assert.match(html, /id="clearAllArchivedButton"[^>]+disabled/);
  assert.match(script, /clearAllArchivedButton\.disabled = archivedChats\.length === 0/);
  assert.match(script, /archiveChatInput\.placeholder = t\('inputPlaceholder'\)/);
});

test('prompt textarea examples use real line breaks instead of visible escape sequences', function () {
  const html = read('prompts.html');
  const script = read('prompts.js');

  assert.match(html, /placeholder="例如：请将以下文本翻译成英文：&#10;&#10;\{\{text\}\}"/);
  assert.doesNotMatch(script, /promptContentPlaceholder:[^\n]+\\\\n/);
  assert.match(script, /promptContentPlaceholder:\s*"例如：请将以下文本翻译成英文：\\n\\n\{\{text\}\}"/);
});
