'use strict';

/**
 * Acknowledgement email sent to the submitter right after they share "Your
 * AI Story" — personalised (full name, time-of-day greeting in IST),
 * encouraging, signed off with "Stay Curious", with the PDF summary
 * summary attached.
 *
 * Three wordings are available; pick one with AI_STORY_EMAIL_TEMPLATE=A|B|C
 * in Backend/.env (default A). No code change needed to switch.
 */

const path = require('path');
const { sendMail } = require('../../../Shared/mailer');
const { renderStoryPdf } = require('./aiStoryPdf');

// Specula Brand Identity Guide: horizontal logo (PNG, from the Logo Kit) at the top of
// emails; Specula Navy for emphasis — Beacon Red is reserved for alerts.
const LOGO_PATH = path.join(__dirname, '..', '..', '..', '..', 'assets', 'specula-horizontal-colour-800px.png');
const NAVY = '#334456';

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const TEMPLATES = {
  // A — warm thank-you
  A: ({ greet, fullName, firstName, title, summary }) => ({
    subject: `Thank you for sharing Your AI Story, ${firstName}!`,
    paragraphs: [
      `${greet}, ${fullName}`,
      `Thank you for sharing your AI story, <b>"${title}"</b>.`,
      `Stories like yours show what becomes possible when we work smarter with AI — and they inspire others to try it too.`,
      `${summary} is attached. Keep exploring, and keep sharing!`,
    ],
  }),
  // B — energetic
  B: ({ greet, firstName, title, model, summary }) => ({
    subject: `Your AI Story is in, ${firstName}!`,
    paragraphs: [
      `${greet}, ${firstName}`,
      `Thanks for sharing <b>"${title}"</b> — great use of ${model}!`,
      `Every story like this makes it easier for a colleague to take their first step with AI.`,
      `${summary} is attached. What will you try next?`,
    ],
  }),
  // C — short and simple
  C: ({ greet, fullName, firstName, title, summary }) => ({
    subject: `Thank you, ${firstName} — Your AI Story`,
    paragraphs: [
      `${greet}, ${fullName},`,
      `Thank you for sharing <b>"${title}"</b>. ${summary} is attached.`,
      `Keep experimenting!`,
    ],
  }),
};

// Default CC list from AI_STORY_EMAIL_CC (comma/semicolon separated). Invalid
// entries are dropped, and the submitter is never CC'd on their own mail.
function ccList(submitterEmail) {
  const mine = String(submitterEmail || '').toLowerCase();
  const seen = new Set();
  const list = String(process.env.AI_STORY_EMAIL_CC || '')
    .split(/[,;\s]+/)
    .map(e => e.trim())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    .filter(e => { const k = e.toLowerCase(); if (k === mine || seen.has(k)) return false; seen.add(k); return true; });
  return list.length ? list.join(', ') : undefined;
}

async function sendAcknowledgement(story) {
  const key = String(process.env.AI_STORY_EMAIL_TEMPLATE || 'A').trim().toUpperCase();
  const template = TEMPLATES[key] || TEMPLATES.A;
  const fullName = story.submitterName.trim();
  // Built first: the email states the PDF's real page count, which depends on how long the story is.
  const { buffer: pdf, pages } = await renderStoryPdf(story);
  const ctx = {
    summary: `Your story summary (PDF, ${pages} ${pages === 1 ? 'page' : 'pages'})`,
    greet: greeting(),
    fullName: escapeHtml(fullName),
    firstName: escapeHtml(fullName.split(/\s+/)[0]),
    title: escapeHtml(story.title),
    model: escapeHtml(story.aiModel === 'Other' ? (story.aiModelOther || 'AI') : story.aiModel),
  };
  const { subject, paragraphs } = template(ctx);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1C2430;max-width:560px;line-height:1.65">
      <img src="cid:specula-logo" alt="Specula" width="170" style="display:block;border:0;margin:0 0 14px">
      ${paragraphs.map(p => `<p style="margin:0 0 14px">${p}</p>`).join('')}
      <p style="margin:22px 0 0;font-size:17px;font-weight:bold;color:${NAVY}">Stay Curious!</p>
      <p style="margin:2px 0 0;color:#555">Team CTO Office</p>
    </div>`;
  const toText = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const text = `${paragraphs.map(toText).join('\n\n')}\n\nStay Curious!\nTeam CTO Office\n`;

  const safeTitle = story.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'story';
  await sendMail({
    to: story.submitterEmail,
    cc: ccList(story.submitterEmail),
    subject: toText(subject),
    html, text,
    attachments: [
      { filename: `Your AI Story - ${safeTitle}.pdf`, content: pdf, contentType: 'application/pdf' },
      { filename: 'specula-logo.png', path: LOGO_PATH, cid: 'specula-logo', contentDisposition: 'inline' },
    ],
  });
}

module.exports = { sendAcknowledgement, greeting, ccList, TEMPLATES };
