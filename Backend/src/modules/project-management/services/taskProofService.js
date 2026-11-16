'use strict';

/**
 * taskProofService — optional "proof of completion" files on a task.
 *
 * Who can do what:
 *   - add:    an accepted assignee of the task, or someone who manages it (the
 *             Activity's Manager, the project's Manager, or an admin)
 *   - view / download: anyone who can see the project (route-gated, Viewer+)
 *   - remove: whoever uploaded it, or a manager as above
 *
 * Proof never changes the task's status and is never required.
 */

const fs = require('fs');
const path = require('path');
const { getPool, sql, withTransaction } = require('../../../config/db');
const { STORAGE_ROOT } = require('../../../middleware/upload');
const { getEffectiveActivityRole } = require('./roleService');
const audit = require('./auditService');

const MAX_PROOFS_PER_TASK = 20;
const NOTE_MAX = 500;

const httpError = (status, message) => { const e = new Error(message); e.statusCode = status; return e; };
const removeFiles = (files) => { for (const f of files || []) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } } };

// multer reads the browser's UTF-8 file name as latin-1; undo that when (and only when) it round-trips.
function fixFilename(name) {
  const s = String(name ?? '');
  if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  const fixed = Buffer.from(s, 'latin1').toString('utf8');
  return fixed.includes('�') ? s : fixed;
}

// The task list asks for a proof count on every row. Until this feature's migration has been
// run on a server the table does not exist, and the task list must not fail because of that —
// so the count is only requested once the table is there (checked now and then, not every time).
let proofsTable = { checkedAt: 0, present: false };
async function proofsTableExists() {
  if (proofsTable.present || Date.now() - proofsTable.checkedAt < 60000) return proofsTable.present;
  const pool = await getPool();
  const r = await pool.request().query(`SELECT OBJECT_ID('dbo.pm_task_proofs', 'U') AS id`);
  proofsTable = { checkedAt: Date.now(), present: r.recordset[0].id !== null };
  return proofsTable.present;
}

async function getTaskRow(taskId) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, taskId).query(`
    SELECT t.task_id AS taskId, t.name, t.activity_id AS activityId, t.is_active AS isActive
    FROM pm_tasks t WHERE t.task_id = @id`);
  if (!r.recordset[0]) throw httpError(404, 'Task not found.');
  return r.recordset[0];
}

// True for an accepted assignee of the task.
async function isAssignee(taskId, userId) {
  const pool = await getPool();
  const r = await pool.request().input('t', sql.Int, taskId).input('u', sql.UniqueIdentifier, userId)
    .query(`SELECT 1 AS ok FROM pm_task_assignment_requests WHERE task_id=@t AND assignee_id=@u AND status='Accepted'`);
  return r.recordset.length > 0;
}

// Manager of the task's Activity (or higher: project Manager / admin — projectRole is set by the route gate).
async function isManager(task, userId, projectRole, isAdmin) {
  if (isAdmin || projectRole === 'Manager') return true;
  const eff = await getEffectiveActivityRole(userId, task.activityId, false);
  return eff.role === 'Manager';
}

const SELECT = `
  SELECT p.proof_id AS proofId, p.task_id AS taskId, p.original_name AS originalName, p.mime_type AS mimeType,
         p.file_size AS fileSize, p.note, p.uploaded_at AS uploadedAt, p.uploaded_by AS uploadedById,
         COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS uploadedByName
  FROM pm_task_proofs p LEFT JOIN auth_users u ON u.user_id = p.uploaded_by`;

function shape(rows, viewerId, canManage) {
  return rows.map(r => ({
    ...r, fileSize: Number(r.fileSize), originalName: fixFilename(r.originalName),
    isImage: /^image\//i.test(r.mimeType || ''),
    // The uploader may remove their own proof; a manager may remove any.
    canRemove: canManage || String(r.uploadedById).toLowerCase() === String(viewerId).toLowerCase(),
  }));
}

async function listProofs(taskId, viewerId, projectRole, isAdmin) {
  const task = await getTaskRow(taskId);
  const pool = await getPool();
  const r = await pool.request().input('t', sql.Int, taskId).query(`${SELECT} WHERE p.task_id=@t ORDER BY p.uploaded_at DESC, p.proof_id DESC`);
  const manage = await isManager(task, viewerId, projectRole, isAdmin);
  const canAdd = task.isActive !== false && (manage || await isAssignee(taskId, viewerId));
  return { proofs: shape(r.recordset, viewerId, manage), canAdd };
}

async function addProofs(taskId, projectId, userId, projectRole, isAdmin, files, noteRaw) {
  try {
    const task = await getTaskRow(taskId);
    if (task.isActive === false) throw httpError(409, 'This task is inactive — reactivate it before attaching proof.');
    if (!files?.length) throw httpError(400, 'Choose at least one file to attach.');
    if (!(await isManager(task, userId, projectRole, isAdmin)) && !(await isAssignee(taskId, userId))) {
      throw httpError(403, 'Only the people assigned to this task (or its managers) can attach proof.');
    }
    const note = String(noteRaw ?? '').trim();
    if (note.length > NOTE_MAX) throw httpError(400, `Note is too long (max ${NOTE_MAX} characters).`);

    const pool = await getPool();
    const have = (await pool.request().input('t', sql.Int, taskId).query(`SELECT COUNT(*) AS n FROM pm_task_proofs WHERE task_id=@t`)).recordset[0].n;
    if (have + files.length > MAX_PROOFS_PER_TASK) throw httpError(400, `A task can hold at most ${MAX_PROOFS_PER_TASK} proof files (it has ${have}).`);

    await withTransaction(async (req) => {
      for (const f of files) {
        await req()
          .input('taskId', sql.Int, taskId)
          .input('originalName', sql.NVarChar(260), fixFilename(f.originalname).slice(0, 260))
          .input('storedName', sql.NVarChar(100), f.filename)
          .input('storagePath', sql.NVarChar(500), path.relative(STORAGE_ROOT, f.path))
          .input('mimeType', sql.NVarChar(150), f.mimetype || null)
          .input('fileSize', sql.BigInt, f.size)
          .input('note', sql.NVarChar(500), note || null)
          .input('uploadedBy', sql.UniqueIdentifier, userId)
          .query(`INSERT INTO pm_task_proofs (task_id, original_name, stored_name, storage_path, mime_type, file_size, note, uploaded_by)
                  VALUES (@taskId, @originalName, @storedName, @storagePath, @mimeType, @fileSize, @note, @uploadedBy)`);
      }
    });
    await audit.log({ entityType: 'task', entityId: taskId, projectId, userId, action: 'proof_added', fieldChanged: 'proof',
      newValue: files.map(f => fixFilename(f.originalname)).join(', ') });
  } catch (e) {
    removeFiles(files);
    throw e;
  }
  return listProofs(taskId, userId, projectRole, isAdmin);
}

async function removeProof(taskId, proofId, projectId, userId, projectRole, isAdmin) {
  const task = await getTaskRow(taskId);
  const pool = await getPool();
  const r = await pool.request().input('p', sql.Int, proofId).input('t', sql.Int, taskId)
    .query(`SELECT original_name AS originalName, storage_path AS storagePath, uploaded_by AS uploadedBy FROM pm_task_proofs WHERE proof_id=@p AND task_id=@t`);
  const row = r.recordset[0];
  if (!row) throw httpError(404, 'Proof not found.');
  const mine = String(row.uploadedBy).toLowerCase() === String(userId).toLowerCase();
  if (!mine && !(await isManager(task, userId, projectRole, isAdmin))) throw httpError(403, 'Only the uploader or a manager can remove this proof.');
  await pool.request().input('p', sql.Int, proofId).query(`DELETE FROM pm_task_proofs WHERE proof_id=@p`);
  const root = path.resolve(STORAGE_ROOT); const full = path.resolve(root, row.storagePath);
  if (full.startsWith(root)) { try { fs.unlinkSync(full); } catch { /* already gone */ } }
  await audit.log({ entityType: 'task', entityId: taskId, projectId, userId, action: 'proof_removed', fieldChanged: 'proof', oldValue: fixFilename(row.originalName) });
  return { removed: true };
}

async function getProofForDownload(taskId, proofId) {
  await getTaskRow(taskId);
  const pool = await getPool();
  const r = await pool.request().input('p', sql.Int, proofId).input('t', sql.Int, taskId)
    .query(`SELECT original_name AS originalName, storage_path AS storagePath FROM pm_task_proofs WHERE proof_id=@p AND task_id=@t`);
  const f = r.recordset[0];
  if (!f) throw httpError(404, 'Proof not found.');
  const root = path.resolve(STORAGE_ROOT); const full = path.resolve(root, f.storagePath);
  if (!full.startsWith(root)) throw httpError(400, 'Invalid file path.');
  if (!fs.existsSync(full)) throw httpError(404, 'File is missing on the server.');
  return { originalName: fixFilename(f.originalName), fullPath: full };
}

module.exports = { proofsTableExists, listProofs, addProofs, removeProof, getProofForDownload };
