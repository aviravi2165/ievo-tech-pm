'use strict';

/**
 * aiStoryService — "Your AI Story": employees share how they use AI.
 *
 * Submitting is OPEN (no Specula login) — name/email/department are plain
 * form values, not linked to auth_users. Every story starts 'pending'; an
 * admin approves (or rejects) it. Logged-in users see approved stories in
 * AI Learning → AI Stories; admins see every status and review them.
 */

const fs = require('fs');
const path = require('path');
const { getPool, sql, withTransaction } = require('../../../config/db');
const { STORAGE_ROOT } = require('../../../middleware/upload');
const { sendAcknowledgement } = require('./aiStoryEmail');

const AI_MODELS = ['ChatGPT', 'Claude', 'Gemini', 'Manus', 'Meta AI', 'Perplexity', 'Other'];
// No longer offered on the form, but older stories may carry it — still
// valid as a filter value so those stories stay findable.
const LEGACY_MODELS = ['Microsoft Copilot'];
const STATUSES = ['pending', 'approved', 'rejected'];
const LIMITS = { name: 100, email: 150, title: 200, description: 4000, modelOther: 50, input: 4000, output: 4000, note: 500, activities: 2000, deliverables: 2000, impact: 1000 };
const truthy = (v) => v === true || v === 'true' || v === '1' || v === 1 || v === 'on';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function httpError(status, message) { const e = new Error(message); e.statusCode = status; return e; }

function removeUploaded(files) {
  for (const f of files || []) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } }
}

async function getActiveDepartments() {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT dept_id AS deptId, dept_name AS deptName FROM dept_master WHERE is_active = 1 ORDER BY dept_name`);
  return r.recordset;
}

async function getFormOptions() {
  return { departments: await getActiveDepartments(), aiModels: AI_MODELS };
}

function text(v, max, label, required = true) {
  const s = String(v ?? '').trim();
  if (required && !s) throw httpError(400, `${label} is required.`);
  if (s.length > max) throw httpError(400, `${label} is too long (max ${max} characters).`);
  return s || null;
}

async function validate(body) {
  const name = text(body.name, LIMITS.name, 'Name');
  const email = text(body.email, LIMITS.email, 'Email');
  if (!EMAIL_RE.test(email)) throw httpError(400, 'Enter a valid email address.');
  const deptId = Number(body.deptId);
  const depts = await getActiveDepartments();
  if (!depts.some(d => d.deptId === deptId)) throw httpError(400, 'Choose your department.');
  const title = text(body.title, LIMITS.title, 'Title');
  const description = text(body.description, LIMITS.description, 'Description');
  if (!AI_MODELS.includes(body.aiModel)) throw httpError(400, 'Choose the AI model you used.');
  const aiModelOther = body.aiModel === 'Other' ? text(body.aiModelOther, LIMITS.modelOther, 'AI model name') : null;
  const inputDetails = text(body.inputDetails, LIMITS.input, 'Input details');
  const outputDetails = text(body.outputDetails, LIMITS.output, 'Output details');
  const dailyActivities = text(body.dailyActivities, LIMITS.activities, 'Daily activities', false);
  const deliverables = text(body.deliverables, LIMITS.deliverables, 'Deliverables', false);
  const impactDescription = text(body.impactDescription, LIMITS.impact, 'Impact description', false);
  return {
    name, email, deptId, title, description, aiModel: body.aiModel, aiModelOther, inputDetails, outputDetails,
    dailyActivities, deliverables, impactDescription,
    improvedProductivity: truthy(body.improvedProductivity), improvedAccuracy: truthy(body.improvedAccuracy),
  };
}

// Public — create a pending story with optional before/after files.
async function submitStory(body, filesByField) {
  const before = filesByField?.beforeFiles || [];
  const after = filesByField?.afterFiles || [];
  const all = [...before, ...after];
  let storyId;
  try {
    const v = await validate(body);
    await withTransaction(async (req) => {
      const r = await req()
        .input('name', sql.NVarChar(100), v.name).input('email', sql.NVarChar(150), v.email)
        .input('deptId', sql.Int, v.deptId).input('title', sql.NVarChar(200), v.title)
        .input('description', sql.NVarChar(4000), v.description)
        .input('aiModel', sql.NVarChar(50), v.aiModel).input('aiModelOther', sql.NVarChar(50), v.aiModelOther)
        .input('input', sql.NVarChar(4000), v.inputDetails).input('output', sql.NVarChar(4000), v.outputDetails)
        .input('activities', sql.NVarChar(2000), v.dailyActivities).input('deliverables', sql.NVarChar(2000), v.deliverables)
        .input('productivity', sql.Bit, v.improvedProductivity ? 1 : 0).input('accuracy', sql.Bit, v.improvedAccuracy ? 1 : 0)
        .input('impact', sql.NVarChar(1000), v.impactDescription)
        .query(`INSERT INTO ai_stories (submitter_name, submitter_email, dept_id, title, description, ai_model, ai_model_other,
                  input_details, output_details, daily_activities, deliverables, improved_productivity, improved_accuracy, impact_description)
                OUTPUT INSERTED.story_id
                VALUES (@name, @email, @deptId, @title, @description, @aiModel, @aiModelOther, @input, @output,
                        @activities, @deliverables, @productivity, @accuracy, @impact)`);
      storyId = r.recordset[0].story_id;
      const add = async (f, kind) => req()
        .input('storyId', sql.Int, storyId).input('kind', sql.NVarChar(10), kind)
        .input('originalName', sql.NVarChar(260), f.originalname.slice(0, 260))
        .input('storedName', sql.NVarChar(100), f.filename)
        .input('storagePath', sql.NVarChar(500), path.relative(STORAGE_ROOT, f.path))
        .input('mimeType', sql.NVarChar(150), f.mimetype || null)
        .input('fileSize', sql.BigInt, f.size)
        .query(`INSERT INTO ai_story_files (story_id, kind, original_name, stored_name, storage_path, mime_type, file_size)
                VALUES (@storyId, @kind, @originalName, @storedName, @storagePath, @mimeType, @fileSize)`);
      for (const f of before) await add(f, 'before');
      for (const f of after) await add(f, 'after');
    });
  } catch (e) {
    removeUploaded(all);
    throw e;
  }
  // Acknowledgement email (with the PDF summary) goes out in the background:
  // a mail problem must never turn a saved story into a failed submission.
  setImmediate(async () => {
    try { await sendAcknowledgement(await getFullStory(storyId)); }
    catch (err) { console.error(`[ai-story] acknowledgement email for story ${storyId} failed:`, err.message); }
  });
  return { submitted: true, storyId };
}

const SELECT = `
  SELECT s.story_id AS storyId, s.submitter_name AS submitterName, s.submitter_email AS submitterEmail,
         s.dept_id AS deptId, d.dept_name AS deptName, s.title, s.description,
         s.ai_model AS aiModel, s.ai_model_other AS aiModelOther,
         s.input_details AS inputDetails, s.output_details AS outputDetails,
         s.hours_saved_per_week AS hoursSaved, s.status, s.review_note AS reviewNote,
         s.daily_activities AS dailyActivities, s.deliverables, s.impact_description AS impactDescription,
         s.improved_productivity AS improvedProductivity, s.improved_accuracy AS improvedAccuracy,
         s.reviewed_at AS reviewedAt, s.created_at AS createdAt,
         COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''), ru.email) AS reviewedByName
  FROM ai_stories s
  INNER JOIN dept_master d ON d.dept_id = s.dept_id
  LEFT JOIN auth_users ru ON ru.user_id = s.reviewed_by`;

async function attachFiles(stories) {
  if (!stories.length) return stories;
  const pool = await getPool();
  const req = pool.request();
  const params = stories.map((s, i) => { req.input(`s${i}`, sql.Int, s.storyId); return `@s${i}`; });
  const r = await req.query(`
    SELECT file_id AS fileId, story_id AS storyId, kind, original_name AS originalName, mime_type AS mimeType, file_size AS fileSize
    FROM ai_story_files WHERE story_id IN (${params.join(',')}) ORDER BY file_id`);
  const byStory = new Map();
  for (const f of r.recordset) {
    if (!byStory.has(f.storyId)) byStory.set(f.storyId, []);
    byStory.get(f.storyId).push({ ...f, fileSize: Number(f.fileSize) });
  }
  return stories.map(s => ({
    ...s, hoursSaved: s.hoursSaved == null ? null : Number(s.hoursSaved),
    improvedProductivity: Boolean(s.improvedProductivity), improvedAccuracy: Boolean(s.improvedAccuracy),
    files: byStory.get(s.storyId) || [],
  }));
}

// Logged-in list. Non-admins only ever get approved stories.
async function listStories({ status, deptId, aiModel, search } = {}, isAdmin) {
  const pool = await getPool();
  const req = pool.request();
  const where = ['s.is_deleted = 0'];
  if (isAdmin) {
    if (status && STATUSES.includes(status)) { where.push('s.status = @status'); req.input('status', sql.NVarChar(10), status); }
  } else {
    where.push(`s.status = 'approved'`);
  }
  if (deptId && Number.isInteger(Number(deptId))) { where.push('s.dept_id = @deptId'); req.input('deptId', sql.Int, Number(deptId)); }
  if (aiModel && [...AI_MODELS, ...LEGACY_MODELS].includes(aiModel)) { where.push('s.ai_model = @aiModel'); req.input('aiModel', sql.NVarChar(50), aiModel); }
  const q = String(search || '').trim();
  if (q) {
    where.push(`(s.title LIKE @q OR s.description LIKE @q OR s.submitter_name LIKE @q OR s.ai_model_other LIKE @q)`);
    req.input('q', sql.NVarChar(210), `%${q.slice(0, 200).replace(/[[%_]/g, '[$&]')}%`);
  }
  const r = await req.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC`);
  const stories = await attachFiles(r.recordset);

  let counts = null;
  if (isAdmin) {
    const c = await pool.request().query(`SELECT status, COUNT(*) AS n FROM ai_stories WHERE is_deleted = 0 GROUP BY status`);
    counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of c.recordset) counts[row.status] = row.n;
  }
  return { stories, counts, isAdmin: Boolean(isAdmin), departments: await getActiveDepartments(), aiModels: [...AI_MODELS, ...LEGACY_MODELS] };
}

async function getStoryRow(storyId) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, storyId).query(`${SELECT} WHERE s.story_id = @id AND s.is_deleted = 0`);
  const row = r.recordset[0];
  if (!row) throw httpError(404, 'Story not found.');
  return row;
}

async function getFullStory(storyId) {
  return (await attachFiles([await getStoryRow(storyId)]))[0];
}

// Logged-in: an approved story's PDF for everyone, any story's PDF for admins.
async function getStoryForPdf(storyId, isAdmin) {
  const story = await getFullStory(storyId);
  if (!isAdmin && story.status !== 'approved') throw httpError(404, 'Story not found.');
  return story;
}

// Admin only (route-gated).
async function reviewStory(storyId, action, note, actorId) {
  if (!['approve', 'reject'].includes(action)) throw httpError(400, 'Action must be approve or reject.');
  await getStoryRow(storyId);
  const reviewNote = text(note, LIMITS.note, 'Note', false);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, storyId)
    .input('status', sql.NVarChar(10), action === 'approve' ? 'approved' : 'rejected')
    .input('note', sql.NVarChar(500), reviewNote).input('actor', sql.UniqueIdentifier, actorId)
    .query(`UPDATE ai_stories SET status=@status, review_note=@note, reviewed_by=@actor, reviewed_at=SYSDATETIMEOFFSET() WHERE story_id=@id`);
  return (await attachFiles([await getStoryRow(storyId)]))[0];
}

// Admin only (route-gated).
async function deleteStory(storyId) {
  await getStoryRow(storyId);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, storyId).query(`UPDATE ai_stories SET is_deleted = 1 WHERE story_id = @id`);
  return { deleted: true };
}

// Logged-in: approved stories' files for everyone, any story's files for admins.
async function getFileForDownload(storyId, fileId, isAdmin) {
  const story = await getStoryRow(storyId);
  if (!isAdmin && story.status !== 'approved') throw httpError(404, 'Story not found.');
  const pool = await getPool();
  const r = await pool.request().input('fileId', sql.Int, fileId).input('id', sql.Int, storyId)
    .query(`SELECT original_name AS originalName, storage_path AS storagePath FROM ai_story_files WHERE file_id=@fileId AND story_id=@id`);
  const f = r.recordset[0];
  if (!f) throw httpError(404, 'File not found.');
  const root = path.resolve(STORAGE_ROOT);
  const full = path.resolve(root, f.storagePath);
  if (!full.startsWith(root)) throw httpError(400, 'Invalid file path.');
  if (!fs.existsSync(full)) throw httpError(404, 'File is missing on the server.');
  return { originalName: f.originalName, fullPath: full };
}

module.exports = { AI_MODELS, getFormOptions, submitStory, listStories, reviewStory, deleteStory, getFileForDownload, getFullStory, getStoryForPdf };
