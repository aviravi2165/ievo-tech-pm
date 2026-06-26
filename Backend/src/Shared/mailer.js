'use strict';

/**
 * Backend/src/Shared/mailer.js
 *
 * Nodemailer singleton. Reads config from environment variables at startup.
 * All outgoing email goes through the `sendMail()` helper below.
 *
 * Required env vars:
 *   SMTP_HOST     — e.g. smtp.gmail.com
 *   SMTP_PORT     — e.g. 587
 *   SMTP_USER     — sender email address / SMTP login
 *   SMTP_PASS     — SMTP password or app-specific password
 *
 * Optional:
 *   SMTP_FROM     — display name + address, e.g. "I.EVO ERP <noreply@ievo.in>"
 *                   Defaults to SMTP_USER if not set.
 *   SMTP_SECURE   — set to "true" for port 465 (SSL). Leave unset for STARTTLS (587).
 */

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'Mailer not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in your .env file.'
    );
  }

  _transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_SECURE === 'true',   // true = SSL (465), false = STARTTLS (587)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Send an email.
 *
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 * @returns {Promise<void>}
 */
async function sendMail({ to, subject, html, text }) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({ from, to, subject, html, text });
}

module.exports = { sendMail };