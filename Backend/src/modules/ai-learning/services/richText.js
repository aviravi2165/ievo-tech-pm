'use strict';

/**
 * Rich text for the AI Story form boxes (bold / italic / underline / lists /
 * links). Anyone on the open form can submit, and admins later VIEW that HTML,
 * so it is always passed through sanitize-html with a tiny allow-list before
 * it is stored — and again before it is shown, so older plain-text stories
 * and anything stored before this existed are safe too.
 */

const sanitizeHtml = require('sanitize-html');

const ALLOWED = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'p', 'br', 'div', 'a'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    // Links from the form open in a new tab and can't touch the opener page.
    a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href, target: '_blank', rel: 'noopener noreferrer nofollow' } }),
  },
};
// transformTags adds target/rel, so they must be allowed through as well.
ALLOWED.allowedAttributes.a = ['href', 'target', 'rel'];

const HAS_TAGS = /<\/?(b|strong|i|em|u|ul|ol|li|p|br|div|a)\b/i;

function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Safe HTML for storing AND displaying. Plain text (old stories, API clients)
// has its line breaks kept.
function toSafeHtml(value) {
  const s = String(value ?? '');
  if (!s.trim()) return '';
  const html = HAS_TAGS.test(s) ? s : escapeText(s).replace(/\r?\n/g, '<br>');
  return sanitizeHtml(html, ALLOWED).trim();
}

// Plain text of a rich value — used for length limits, the PDF and search.
function toPlainText(value) {
  const html = toSafeHtml(value);
  if (!html) return '';
  const withBreaks = html
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(li|p|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { toSafeHtml, toPlainText };
