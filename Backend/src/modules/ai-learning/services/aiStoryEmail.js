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
      `${greet}, ${fullName},`,
      `Thank you for sharing <b>"${title}"</b>. Every story like yours helps a colleague discover a smarter way to work.`,
      `Our team will review it shortly. Once approved, it will be featured in Specula's AI Stories for everyone to learn from. Your one-page summary is attached for your records.`,
      `Keep experimenting, keep sharing.`,
    ],
  }),
  // B — energetic explorer
  B: ({ greet, firstName, title, model }) => ({
    subject: `Your AI Story has landed, ${firstName}!`,
    paragraphs: [
      `${greet} ${firstName},`,
      `You just turned a smart shortcut into something the whole team can learn from — that's exactly how a curious culture grows.`,
      `We've received <b>"${title}"</b>, powered by ${model}. It's now with our team for a quick review before it goes live in Specula's AI Stories. A one-page summary is attached.`,
      `So… what's the next task you'll hand over to AI?`,
    ],
  }),
  // C — short and crisp
  C: ({ greet, fullName, title }) => ({
    subject: `Received: Your AI Story — ${title}`,
    paragraphs: [
      `${greet}, ${fullName}.`,
      `We've received your AI story <b>"${title}"</b>. It will appear in Specula's AI Stories after a quick review. The one-page summary is attached.`,
      `Thank you for leading the way.`,
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
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:600px;line-height:1.6">
      ${paragraphs.map(p => `<p style="margin:0 0 12px">${p}</p>`).join('')}
      <p style="margin:20px 0 0;font-size:16px;font-weight:bold;color:#d22630">Stay Curious!</p>
      <p style="margin:4px 0 0">— Team I.EVO</p>
    </div>`;
  const toText = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const text = `${paragraphs.map(toText).join('\n\n')}\n\nStay Curious!\n— Team I.EVO\n`;

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
