'use strict';

/**
 * meetingMinutesService — Minutes of Meeting (MoM) for a pm_meetings row.
 *
 * A chat-like log: each entry is a text note and/or attached files, with
 * author + time. Kept in its own tables (not a comm_conversations thread) so
 * meetings don't flood everyone's chat inbox.
 *
 * Read:  anyone who can open the meeting (project Viewer+, route-gated).
 * Write: only the person who created the meeting.
 * Edit:  author only. Delete: author or Manager.
 * Email: the creator can send the posted minutes to every participant.
 */

const fs = require('fs');
const path = require('path');
const { getPool, sql, withTransaction } = require('../../../config/db');
const { STORAGE_ROOT } = require('../../../middleware/upload');
const { sendMail } = require('../../../Shared/mailer');

const BODY_MAX = 10000;
const EMAIL_ATTACH_MAX_BYTES = 15 * 1024 * 1024; // keep well under Gmail's 25 MB message cap
const EMAIL_COOLDOWN_MS = 30 * 1000;
const lastEmailAt = new Map(); // meetingId -> ms

function httpError(status, message) { const e = new Error(message); e.statusCode = status; return e; }

async function getMeeting(meetingId, projectId) {
  const pool = await getPool();
  const r = await pool.request().input('meetingId', sql.Int, meetingId).input('projectId', sql.Int, projectId)
    .query(`SELECT m.meeting_id AS meetingId, m.is_cancelled AS isCancelled, m.title,
                   CONVERT(varchar(10), m.meeting_date, 23) AS meetingDate, m.created_by AS createdById,
                   COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS createdByName
            FROM pm_meetings m LEFT JOIN auth_users u ON u.user_id = m.created_by
            WHERE m.meeting_id=@meetingId AND m.project_id=@projectId`);
  const m = r.recordset[0];
  if (!m) throw httpError(404, 'Meeting not found.');
  return m;
}

const isCreator = (meeting, userId) => String(meeting.createdById) === String(userId);

async function listMinutes(meetingId, projectId, viewerId, projectRole) {
  const meeting = await getMeeting(meetingId, projectId);
  const pool = await getPool();
  const entriesR = await pool.request().input('meetingId', sql.Int, meetingId).query(`
    SELECT mi.minute_id AS minuteId, mi.body, mi.created_at AS createdAt, mi.updated_at AS updatedAt,
           mi.author_id AS authorId,
           COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS authorName
    FROM pm_meeting_minutes mi
    INNER JOIN auth_users u ON u.user_id = mi.author_id
    WHERE mi.meeting_id = @meetingId AND mi.is_deleted = 0
    ORDER BY mi.created_at ASC, mi.minute_id ASC
  `);
  const filesR = await pool.request().input('meetingId', sql.Int, meetingId).query(`
    SELECT f.file_id AS fileId, f.minute_id AS minuteId, f.original_name AS originalName,
           f.mime_type AS mimeType, f.file_size AS fileSize
    FROM pm_meeting_minute_files f
    INNER JOIN pm_meeting_minutes mi ON mi.minute_id = f.minute_id
    WHERE mi.meeting_id = @meetingId AND mi.is_deleted = 0
    ORDER BY f.file_id
  `);
  const filesByMinute = new Map();
  for (const f of filesR.recordset) {
    const k = f.minuteId;
    if (!filesByMinute.has(k)) filesByMinute.set(k, []);
    filesByMinute.get(k).push(f);
  }
  const isManager = projectRole === 'Manager';
  const entries = entriesR.recordset.map(e => {
    const mine = String(e.authorId) === String(viewerId);
    const files = (filesByMinute.get(e.minuteId) || []).map(f => ({ ...f, fileSize: Number(f.fileSize) }));
    return { ...e, files, canEdit: mine, canDelete: mine || isManager };
  });
  const creator = isCreator(meeting, viewerId);
  return { entries, canWrite: creator, canEmail: creator && entries.length > 0, createdByName: meeting.createdByName };
}

function removeUploaded(files) {
  for (const f of files || []) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } }
}

async function addMinute(meetingId, projectId, { body, files }, actorId, projectRole) {
  try {
    const meeting = await getMeeting(meetingId, projectId);
    if (meeting.isCancelled) throw httpError(409, 'This meeting was cancelled.');
    if (!isCreator(meeting, actorId)) throw httpError(403, 'Only the person who created this meeting can write its minutes.');
    const text = (body || '').trim();
    if (!text && !(files && files.length)) throw httpError(400, 'Write something or attach a file.');
    if (text.length > BODY_MAX) throw httpError(400, `Minutes entry is too long (max ${BODY_MAX} characters).`);

    let minuteId;
    await withTransaction(async (req) => {
      const r = await req().input('meetingId', sql.Int, meetingId).input('authorId', sql.UniqueIdentifier, actorId)
        .input('body', sql.NVarChar(sql.MAX), text || null)
        .query(`INSERT INTO pm_meeting_minutes (meeting_id, author_id, body) OUTPUT INSERTED.minute_id VALUES (@meetingId, @authorId, @body)`);
      minuteId = r.recordset[0].minute_id;
      for (const f of files || []) {
        await req().input('minuteId', sql.Int, minuteId)
          .input('originalName', sql.NVarChar(260), f.originalname.slice(0, 260))
          .input('storedName', sql.NVarChar(100), f.filename)
          .input('storagePath', sql.NVarChar(500), path.relative(STORAGE_ROOT, f.path))
          .input('mimeType', sql.NVarChar(150), f.mimetype || null)
          .input('fileSize', sql.BigInt, f.size)
          .query(`INSERT INTO pm_meeting_minute_files (minute_id, original_name, stored_name, storage_path, mime_type, file_size)
                  VALUES (@minuteId, @originalName, @storedName, @storagePath, @mimeType, @fileSize)`);
      }
    });
    return { minuteId };
  } catch (e) {
    removeUploaded(files);
    throw e;
  }
}

async function getMinute(minuteId, meetingId) {
  const pool = await getPool();
  const r = await pool.request().input('minuteId', sql.Int, minuteId).input('meetingId', sql.Int, meetingId)
    .query(`SELECT minute_id AS minuteId, author_id AS authorId FROM pm_meeting_minutes WHERE minute_id=@minuteId AND meeting_id=@meetingId AND is_deleted=0`);
  const m = r.recordset[0];
  if (!m) throw httpError(404, 'Minutes entry not found.');
  return m;
}

async function updateMinute(meetingId, projectId, minuteId, body, actorId) {
  await getMeeting(meetingId, projectId);
  const minute = await getMinute(minuteId, meetingId);
  if (String(minute.authorId) !== String(actorId)) throw httpError(403, 'You can only edit your own entries.');
  const text = (body || '').trim();
  if (text.length > BODY_MAX) throw httpError(400, `Minutes entry is too long (max ${BODY_MAX} characters).`);
  const pool = await getPool();
  const files = await pool.request().input('minuteId', sql.Int, minuteId).query(`SELECT COUNT(*) AS n FROM pm_meeting_minute_files WHERE minute_id=@minuteId`);
  if (!text && files.recordset[0].n === 0) throw httpError(400, 'Entry cannot be empty.');
  await pool.request().input('minuteId', sql.Int, minuteId).input('body', sql.NVarChar(sql.MAX), text || null)
    .query(`UPDATE pm_meeting_minutes SET body=@body, updated_at=SYSDATETIMEOFFSET() WHERE minute_id=@minuteId`);
  return { updated: true };
}

async function deleteMinute(meetingId, projectId, minuteId, actorId, projectRole) {
  await getMeeting(meetingId, projectId);
  const minute = await getMinute(minuteId, meetingId);
  if (String(minute.authorId) !== String(actorId) && projectRole !== 'Manager') throw httpError(403, 'You can only delete your own entries.');
  const pool = await getPool();
  await pool.request().input('minuteId', sql.Int, minuteId)
    .query(`UPDATE pm_meeting_minutes SET is_deleted=1, updated_at=SYSDATETIMEOFFSET() WHERE minute_id=@minuteId`);
  return { deleted: true };
}

async function getFileForDownload(meetingId, projectId, fileId) {
  await getMeeting(meetingId, projectId);
  const pool = await getPool();
  const r = await pool.request().input('fileId', sql.Int, fileId).input('meetingId', sql.Int, meetingId).query(`
    SELECT f.original_name AS originalName, f.storage_path AS storagePath, f.mime_type AS mimeType
    FROM pm_meeting_minute_files f
    INNER JOIN pm_meeting_minutes mi ON mi.minute_id = f.minute_id
    WHERE f.file_id=@fileId AND mi.meeting_id=@meetingId AND mi.is_deleted=0
  `);
  const f = r.recordset[0];
  if (!f) throw httpError(404, 'File not found.');
  const full = path.resolve(STORAGE_ROOT, f.storagePath);
  if (!full.startsWith(path.resolve(STORAGE_ROOT))) throw httpError(400, 'Invalid file path.');
  if (!fs.existsSync(full)) throw httpError(404, 'File is missing on the server.');
  return { ...f, fullPath: full };
}

function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const ddmmyyyy = (d) => { const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}`; };

// Creator only — one email to every participant: subject "<title> — <date>",
// body = every posted minutes entry in order, signed "Regards, <creator>".
// Files posted with the minutes are attached while they fit under the cap;
// beyond that they're listed by name only.
async function emailMinutes(meetingId, projectId, actorId) {
  const meeting = await getMeeting(meetingId, projectId);
  if (!isCreator(meeting, actorId)) throw httpError(403, 'Only the person who created this meeting can email its minutes.');
  const last = lastEmailAt.get(String(meetingId)) || 0;
  if (Date.now() - last < EMAIL_COOLDOWN_MS) throw httpError(429, 'The minutes were just emailed — wait a few seconds before sending again.');

  const pool = await getPool();
  const entries = (await pool.request().input('meetingId', sql.Int, meetingId).query(`
    SELECT minute_id AS minuteId, body FROM pm_meeting_minutes
    WHERE meeting_id=@meetingId AND is_deleted=0 ORDER BY created_at ASC, minute_id ASC`)).recordset;
  if (!entries.length) throw httpError(400, 'There are no minutes to send yet.');
  const files = (await pool.request().input('meetingId', sql.Int, meetingId).query(`
    SELECT f.minute_id AS minuteId, f.original_name AS originalName, f.storage_path AS storagePath, f.mime_type AS mimeType, f.file_size AS fileSize
    FROM pm_meeting_minute_files f INNER JOIN pm_meeting_minutes mi ON mi.minute_id=f.minute_id
    WHERE mi.meeting_id=@meetingId AND mi.is_deleted=0 ORDER BY f.file_id`)).recordset;
  const people = (await pool.request().input('meetingId', sql.Int, meetingId).query(`
    SELECT u.email FROM pm_meeting_members mm INNER JOIN auth_users u ON u.user_id=mm.user_id
    WHERE mm.meeting_id=@meetingId AND u.is_active=1`)).recordset;
  const recipients = [...new Set(people.map(x => x.email).filter(e => e && e.includes('@')))];
  if (!recipients.length) throw httpError(400, 'None of the participants has an email address on file.');

  const root = path.resolve(STORAGE_ROOT);
  const attachments = [];
  const notAttached = [];
  let attachedBytes = 0;
  for (const f of files) {
    const full = path.resolve(root, f.storagePath);
    const size = Number(f.fileSize) || 0;
    if (full.startsWith(root) && fs.existsSync(full) && attachedBytes + size <= EMAIL_ATTACH_MAX_BYTES) {
      attachments.push({ filename: f.originalName, path: full, contentType: f.mimeType || undefined });
      attachedBytes += size;
    } else {
      notAttached.push(f.originalName);
    }
  }

  const sender = meeting.createdByName || 'Meeting organiser';
  const subject = `${meeting.title} — ${ddmmyyyy(meeting.meetingDate)}`.replace(/\s+/g, ' ');
  const bodyText = entries.map(e => (e.body || '').trim()).filter(Boolean).join('\n\n');
  const fileNames = files.map(f => f.originalName);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:640px">
      <p style="margin:0 0 4px;font-size:16px;font-weight:bold">Minutes of Meeting — ${escapeHtml(meeting.title)}</p>
      <p style="margin:0 0 16px;color:#666;font-size:12px">Date: ${escapeHtml(ddmmyyyy(meeting.meetingDate))}</p>
      ${bodyText ? `<div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(bodyText)}</div>` : ''}
      ${fileNames.length ? `<p style="margin:16px 0 4px;font-weight:bold">Files</p><ul style="margin:0;padding-left:18px">${fileNames.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
      ${notAttached.length ? `<p style="color:#888;font-size:12px">Too large to attach here — open the meeting in Specula to download: ${escapeHtml(notAttached.join(', '))}</p>` : ''}
      <p style="margin:24px 0 0">Regards,<br>${escapeHtml(sender)}</p>
    </div>`;
  const text = `Minutes of Meeting — ${meeting.title}\nDate: ${ddmmyyyy(meeting.meetingDate)}\n\n${bodyText}`
    + (fileNames.length ? `\n\nFiles: ${fileNames.join(', ')}` : '')
    + `\n\nRegards,\n${sender}\n`;

  const actor = (await pool.request().input('id', sql.UniqueIdentifier, actorId).query(`SELECT email FROM auth_users WHERE user_id=@id`)).recordset[0];
  await sendMail({ to: recipients.join(', '), subject, html, text, replyTo: actor?.email || undefined, attachments });
  lastEmailAt.set(String(meetingId), Date.now());
  return { sent: true, recipientCount: recipients.length, attached: attachments.length, notAttached: notAttached.length };
}

module.exports = { listMinutes, addMinute, updateMinute, deleteMinute, getFileForDownload, emailMinutes };
