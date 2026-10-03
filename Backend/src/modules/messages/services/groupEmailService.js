'use strict';

/**
 * groupEmailService — "Email team": one email to every member of a chat
 * group, all addresses together in To: (same internal team, so everyone sees
 * who got it and Reply-All works). Sent only when a member chooses to.
 */

const { getPool, sql } = require('../../../config/db');
const { sendMail } = require('../../../Shared/mailer');
const { assertGroupMember } = require('./groupService');

const SUBJECT_MAX = 200;
const MESSAGE_MAX = 5000;
const COOLDOWN_MS = 30 * 1000;
const lastSentAt = new Map(); // `${userId}:${groupId}` -> ms

function httpError(status, message) { const e = new Error(message); e.statusCode = status; return e; }

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function emailGroup(groupId, senderId, { subject, message }) {
  const subj = String(subject || '').replace(/\s+/g, ' ').trim();
  const body = String(message || '').trim();
  if (!subj) throw httpError(400, 'Subject is required.');
  if (!body) throw httpError(400, 'Message is required.');
  if (subj.length > SUBJECT_MAX) throw httpError(400, `Subject is too long (max ${SUBJECT_MAX}).`);
  if (body.length > MESSAGE_MAX) throw httpError(400, `Message is too long (max ${MESSAGE_MAX}).`);

  await assertGroupMember(groupId, senderId);

  const key = `${senderId}:${groupId}`;
  const last = lastSentAt.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) throw httpError(429, 'Please wait a few seconds before emailing this team again.');

  const pool = await getPool();
  const g = await pool.request().input('groupId', sql.Int, groupId)
    .query(`SELECT group_name AS groupName, is_disabled AS isDisabled FROM comm_groups WHERE group_id=@groupId`);
  const group = g.recordset[0];
  if (!group) throw httpError(404, 'Group not found.');
  if (group.isDisabled) throw httpError(409, 'This group is disabled.');

  const r = await pool.request().input('groupId', sql.Int, groupId).input('senderId', sql.UniqueIdentifier, senderId).query(`
    SELECT u.user_id AS userId, u.email,
           COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
           CASE WHEN u.user_id = @senderId THEN 1 ELSE 0 END AS isSender
    FROM comm_group_members gm
    INNER JOIN auth_users u ON u.user_id = gm.user_id
    WHERE gm.group_id = @groupId AND u.is_active = 1
  `);
  const sender = r.recordset.find(x => x.isSender);
  const recipients = r.recordset.filter(x => x.email && x.email.includes('@'));
  const others = recipients.filter(x => !x.isSender);
  if (!others.length) throw httpError(400, 'No other team member has an email address on file.');

  const senderName = sender?.name || 'A team member';
  const appUrl = process.env.APP_URL || '';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:620px">
      <p style="color:#666;font-size:12px;margin:0 0 12px">
        <strong>${escapeHtml(senderName)}</strong> sent this to the team <strong>${escapeHtml(group.groupName)}</strong>
      </p>
      <div style="white-space:pre-wrap;line-height:1.55">${escapeHtml(body)}</div>
      <hr style="border:none;border-top:1px solid #ddd;margin:20px 0 10px">
      <p style="color:#888;font-size:11px;margin:0">
        Sent from Specula${appUrl ? ` — <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a>` : ''}.
        Replying goes to ${escapeHtml(senderName)}; use Reply All to answer the whole team.
      </p>
    </div>`;
  const text = `${senderName} sent this to the team "${group.groupName}":\n\n${body}\n`;

  await sendMail({
    to: recipients.map(x => x.email).join(', '),
    subject: `[${group.groupName}] ${subj}`,
    html, text,
    replyTo: sender?.email || undefined,
  });
  lastSentAt.set(key, Date.now());

  return { sent: true, recipientCount: recipients.length, skipped: r.recordset.length - recipients.length };
}

module.exports = { emailGroup };
