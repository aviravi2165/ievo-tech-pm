'use strict';

/**
 * meetingMinutesService — Minutes of Meeting (MoM) for a pm_meetings row.
 *
 * A chat-like log: each entry is a text note and/or attached files, with
 * author + time. Kept in its own tables (not a comm_conversations thread) so
 * meetings don't flood everyone's chat inbox.
 *
 * Read:  anyone who can open the meeting (project Viewer+, route-gated).
 * Write: meeting participants and project Managers (incl. admins).
 * Edit:  author only. Delete: author or Manager.
 */

const fs = require('fs');
const path = require('path');
const { getPool, sql, withTransaction } = require('../../../config/db');
const { STORAGE_ROOT } = require('../../../middleware/upload');

const BODY_MAX = 10000;

function httpError(status, message) { const e = new Error(message); e.statusCode = status; return e; }

async function getMeeting(meetingId, projectId) {
  const pool = await getPool();
  const r = await pool.request().input('meetingId', sql.Int, meetingId).input('projectId', sql.Int, projectId)
    .query(`SELECT meeting_id AS meetingId, is_cancelled AS isCancelled FROM pm_meetings WHERE meeting_id=@meetingId AND project_id=@projectId`);
  const m = r.recordset[0];
  if (!m) throw httpError(404, 'Meeting not found.');
  return m;
}

async function isParticipant(meetingId, userId) {
  const pool = await getPool();
  const r = await pool.request().input('meetingId', sql.Int, meetingId).input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT 1 AS ok FROM pm_meeting_members WHERE meeting_id=@meetingId AND user_id=@userId`);
  return r.recordset.length > 0;
}

async function canWrite(meetingId, userId, projectRole) {
  return projectRole === 'Manager' || isParticipant(meetingId, userId);
}

async function listMinutes(meetingId, projectId, viewerId, projectRole) {
  await getMeeting(meetingId, projectId);
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
  return { entries, canWrite: await canWrite(meetingId, viewerId, projectRole) };
}

function removeUploaded(files) {
  for (const f of files || []) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } }
}

async function addMinute(meetingId, projectId, { body, files }, actorId, projectRole) {
  try {
    const meeting = await getMeeting(meetingId, projectId);
    if (meeting.isCancelled) throw httpError(409, 'This meeting was cancelled.');
    if (!(await canWrite(meetingId, actorId, projectRole))) throw httpError(403, 'Only meeting participants or the project Manager can add minutes.');
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

module.exports = { listMinutes, addMinute, updateMinute, deleteMinute, getFileForDownload };
