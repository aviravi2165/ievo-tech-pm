'use strict';

/**
 * Acknowledgement email sent to the submitter right after they share "Your
 * AI Story" — personalised (full name, time-of-day greeting in IST),
 * encouraging, signed off with "Stay Curious", with the one-page PDF
 * summary attached.
 *
 * Three wordings are available; pick one with AI_STORY_EMAIL_TEMPLATE=A|B|C
 * in Backend/.env (default A). No code change needed to switch.
 */

const { sendMail } = require('../../../Shared/mailer');
const { buildStoryPdf } = require('./aiStoryPdf');

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
  A: ({ greet, fullName, firstName, title }) => ({
    subject: `Thank you for sharing Your AI Story, ${firstName}!`,
    paragraphs: [
      `${greet}, ${fullName}`,
      `Thank you for sharing your AI story, <b>"${title}"</b>.`,
      `Stories like yours show what becomes possible when we work smarter with AI — and they inspire others to try it too.`,
      `Your one-page summary is attached. Keep exploring, and keep sharing!`,
    ],
  }),
  // B — energetic
  B: ({ greet, firstName, title, model }) => ({
    subject: `Your AI Story is in, ${firstName}!`,
    paragraphs: [
      `${greet}, ${firstName}`,
      `Thanks for sharing <b>"${title}"</b> — great use of ${model}!`,
      `Every story like this makes it easier for a colleague to take their first step with AI.`,
      `Your one-page summary is attached. What will you try next?`,
    ],
  }),
  // C — short and simple
  C: ({ greet, fullName, firstName, title }) => ({
    subject: `Thank you, ${firstName} — Your AI Story`,
    paragraphs: [
      `${greet}, ${fullName},`,
      `Thank you for sharing <b>"${title}"</b>. Your one-page summary is attached.`,
      `Keep experimenting!`,
    ],
  }),
};

async function sendAcknowledgement(story) {
  const key = String(process.env.AI_STORY_EMAIL_TEMPLATE || 'A').trim().toUpperCase();
  const template = TEMPLATES[key] || TEMPLATES.A;
  const fullName = story.submitterName.trim();
  const ctx = {
    greet: greeting(),
    fullName: escapeHtml(fullName),
    firstName: escapeHtml(fullName.split(/\s+/)[0]),
    title: escapeHtml(story.title),
    model: escapeHtml(story.aiModel === 'Other' ? (story.aiModelOther || 'AI') : story.aiModel),
  };
  const { subject, paragraphs } = template(ctx);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;max-width:560px;line-height:1.65">
      ${paragraphs.map(p => `<p style="margin:0 0 14px">${p}</p>`).join('')}
      <p style="margin:22px 0 0;font-size:17px;font-weight:bold;color:#d22630">Stay Curious!</p>
      <p style="margin:2px 0 0;color:#555">Team CTO Office</p>
    </div>`;
  const toText = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const text = `${paragraphs.map(toText).join('\n\n')}\n\nStay Curious!\nTeam CTO Office\n`;

  const pdf = await buildStoryPdf(story);
  const safeTitle = story.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'story';
  await sendMail({
    to: story.submitterEmail,
    subject: toText(subject),
    html, text,
    attachments: [{ filename: `Your AI Story - ${safeTitle}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
}

module.exports = { sendAcknowledgement, greeting, TEMPLATES };
