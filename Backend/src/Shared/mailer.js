'use strict';

/**
 * Backend/src/Shared/mailer.js
 *
 * Nodemailer singleton. Lazy-initialises the transporter on first use.
 *
 * Required env vars:
 *   SMTP_HOST   — e.g. smtp.gmail.com
 *   SMTP_PORT   — e.g. 587  (STARTTLS) or 465 (SSL)
 *   SMTP_USER   — your full email address used to authenticate
 *   SMTP_PASS   — for Gmail: App Password from myaccount.google.com/apppasswords
 *
 * Optional:
 *   SMTP_SECURE — "true" for port 465 SSL. Leave blank for port 587 STARTTLS.
 *   SMTP_FROM   — display name shown to recipients, e.g. "I.EVO ERP"
 *                 The actual sender address is always SMTP_USER.
 *   APP_URL     — base URL used in email links, e.g. http://192.168.1.10:5173
 *
 * Gmail setup:
 *   1. Enable 2-Step Verification on your Google account.
 *   2. Go to myaccount.google.com/apppasswords → create an App Password.
 *   3. Use that 16-char password as SMTP_PASS (no spaces).
 *   4. SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE= (blank)
 */

const nodemailer = require('nodemailer');

let _transporter = null;
let _verified    = false;

function buildTransporter() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'Mailer not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in Backend/.env'
    );
  }

  const secure = SMTP_SECURE === 'true';
  const port   = parseInt(SMTP_PORT || (secure ? '465' : '587'), 10);

  return nodemailer.createTransport({
    host:   SMTP_HOST,
    port,
    secure,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    tls: {
      // Accepts self-signed / internal certs — safe for an internal ERP.
      // Set to true in production if your SMTP server has a valid CA cert.
      rejectUnauthorized: false,
    },
  });
}

async function getTransporter() {
  if (_transporter && _verified) return _transporter;

  _transporter = buildTransporter();

  // Verify the connection once so misconfiguration shows up immediately
  // in the server log rather than silently failing on the first email.
  try {
    await _transporter.verify();
    _verified = true;
    console.log('[mailer] SMTP connection verified OK —', process.env.SMTP_HOST);
  } catch (err) {
    // Reset so the next call retries rather than reusing a broken transporter
    _transporter = null;
    _verified    = false;
    console.error('[mailer] SMTP verification failed:', err.message);
    throw err;
  }

  return _transporter;
}

/**
 * Send an email.
 *
 * The "from" address is always SMTP_USER (the authenticated account).
 * SMTP_FROM is used as the display name only — Gmail rejects mismatched
 * sender addresses, so we never set `from` to an address different from
 * the auth user.
 *
 * @param {{ to: string, subject: string, html: string, text?: string }} opts
 */
async function sendMail({ to, subject, html, text }) {
  const transporter = await getTransporter();

  const displayName = process.env.SMTP_FROM
    ? process.env.SMTP_FROM.replace(/<.*>/, '').trim()   // strip any <addr> part
    : 'I.EVO ERP';

  const from = `"${displayName}" <${process.env.SMTP_USER}>`;

  await transporter.sendMail({ from, to, subject, html, text });
  console.log(`[mailer] Email sent to ${to} — "${subject}"`);
}

module.exports = { sendMail };