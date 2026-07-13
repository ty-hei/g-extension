// Render Markdown and sanitize the generated HTML with a strict DOM allowlist.
(function (global) {
  'use strict';

  const ALLOWED_TAGS = new Set([
    'a', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt',
    'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'kbd', 'li', 'mark',
    'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
    'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
  ]);

  const DROP_CONTENT_TAGS = new Set([
    'applet', 'audio', 'base', 'canvas', 'embed', 'form', 'frame', 'frameset',
    'iframe', 'img', 'link', 'math', 'meta', 'noscript', 'object', 'script',
    'source', 'style', 'svg', 'template', 'track', 'video'
  ]);

  function renderPlainText(text) {
    const container = document.createElement('div');
    container.textContent = String(text ?? '');
    return container.innerHTML.replace(/\r?\n/g, '<br>');
  }

  function getSafeHref(rawHref) {
    const href = String(rawHref || '').trim();
    if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null;
    if (href.startsWith('#')) return href;

    try {
      const parsed = new URL(href);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') &&
        !parsed.username &&
        !parsed.password
      ) {
        return href;
      }
    } catch (_) {
      // Relative and malformed URLs are intentionally rejected.
    }
    return null;
  }

  function copySafeAttributes(source, target, tagName, options) {
    if (tagName === 'a') {
      const href = getSafeHref(source.getAttribute('href'));
      if (href) target.setAttribute('href', href);

      const title = source.getAttribute('title');
      if (title) target.setAttribute('title', title);
      if (options.allowOptionsLink && source.getAttribute('id') === 'open-options-link') {
        target.setAttribute('id', 'open-options-link');
      }
      target.setAttribute('rel', 'noopener noreferrer');
      return;
    }

    if (tagName === 'code') {
      const safeClasses = String(source.getAttribute('class') || '')
        .split(/\s+/)
        .filter(className => /^language-[a-z0-9_+-]+$/i.test(className));
      if (safeClasses.length > 0) target.setAttribute('class', safeClasses.join(' '));
      return;
    }

    if (tagName === 'td' || tagName === 'th') {
      const align = String(source.getAttribute('align') || '').toLowerCase();
      if (align === 'left' || align === 'center' || align === 'right') {
        target.setAttribute('align', align);
      }
      return;
    }

    if (tagName === 'ol') {
      const start = source.getAttribute('start');
      if (/^-?\d+$/.test(start || '')) target.setAttribute('start', start);
    }
  }

  function appendSanitizedNode(source, targetParent, options) {
    if (source.nodeType === Node.TEXT_NODE) {
      targetParent.appendChild(document.createTextNode(source.textContent || ''));
      return;
    }

    if (source.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = source.tagName.toLowerCase();
    if (DROP_CONTENT_TAGS.has(tagName)) return;

    if (!ALLOWED_TAGS.has(tagName)) {
      Array.from(source.childNodes).forEach(child => appendSanitizedNode(child, targetParent, options));
      return;
    }

    const cleanElement = document.createElement(tagName);
    copySafeAttributes(source, cleanElement, tagName, options);
    Array.from(source.childNodes).forEach(child => appendSanitizedNode(child, cleanElement, options));
    targetParent.appendChild(cleanElement);
  }

  global.renderSafeMarkdown = function renderSafeMarkdown(text, rawOptions = {}) {
    const options = { allowOptionsLink: rawOptions?.allowOptionsLink === true };
    if (!global.marked || typeof global.marked.parse !== 'function') {
      return renderPlainText(text);
    }

    try {
      const parsedHtml = global.marked.parse(String(text ?? ''));
      if (typeof parsedHtml !== 'string') return renderPlainText(text);

      const sourceTemplate = document.createElement('template');
      const cleanTemplate = document.createElement('template');
      sourceTemplate.innerHTML = parsedHtml;
      Array.from(sourceTemplate.content.childNodes)
        .forEach(node => appendSanitizedNode(node, cleanTemplate.content, options));
      return cleanTemplate.innerHTML;
    } catch (error) {
      console.error('Safe Markdown rendering failed:', error);
      return renderPlainText(text);
    }
  };
})(globalThis);
