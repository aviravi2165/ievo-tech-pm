'use strict';

/**
 * aiTechService — "Share a tech": colleagues suggest a new technology, AI model or tool the
 * company could use, with the use case for it. Submitting is OPEN (no Specula login — name,
 * email and department are plain form values). Every post starts 'pending'; an admin approves
 * or rejects it, and only approved posts appear in the public AI Feed.
 */

const fs = require('fs');
const path = require('path');
const { getPool, sql, withTransaction } = require('../../../config/db');
const { STORAGE_ROOT } = require('../../../middleware/upload');
const { toSafeHtml } = require('./richText');
const { httpError, text, rich, EMAIL_RE, getActiveDepartments, fixFilename } = require('./aiStoryService');
const { refCode, idFromRefCode } = require('./submissionCode');

const TECH_TYPES = ['AI model', 'AI tool', 'New technology', 'Software / platform', 'Other'];
const STATUSES = ['pending', 'approved', 'rejected'];
const LIMITS = { name: 100, email: 150, title: 200, other: 50, summary: 4000, useCase: 4000, benefit: 2000, url: 500, note: 500 };

function removeUploaded(files) {
  for (const f of files || []) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } }
}

async function getFormOptions() {
  return { departments: await getActiveDepartments(), techTypes: TECH_TYPES };
}

// Optional link to the tool / site. Only http(s) — never javascript: or data: URLs.
function cleanUrl(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.length > LIMITS.url) throw httpError(400, `Link is too long (max ${LIMITS.url} characters).`);
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let u;
  try { u = new URL(withScheme); } catch { throw httpError(400, 'Enter a valid web link (for example https://example.com).'); }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) throw httpError(400, 'Enter a valid web link (for example https://example.com).');
  return u.toString();
}

async function validate(body) {
  const name = text(body.name, LIMITS.name, 'Name');
  const email = text(body.email, LIMITS.email, 'Email');
  if (!EMAIL_RE.test(email)) throw httpError(400, 'Enter a valid email address.');
  const deptId = Number(body.deptId);
  const depts = await getActiveDepartments();
  if (!depts.some(d => d.deptId === deptId)) throw httpError(400, 'Choose your department.');
  const title = text(body.title, LIMITS.title, 'Title');
  if (!TECH_TYPES.includes(body.techType)) throw httpError(400, 'Choose what kind of technology this is.');
  const techTypeOther = body.techType === 'Other' ? text(body.techTypeOther, LIMITS.other, 'Type') : null;
  return {
    name, email, deptId, title, techType: body.techType, techTypeOther,
    summary: rich(body.summary, LIMITS.summary, 'What it is'),
    linkUrl: cleanUrl(body.linkUrl),
    useCase: rich(body.useCase, LIMITS.useCase, 'How we could use it'),
    expectedBenefit: rich(body.expectedBenefit, LIMITS.benefit, 'Expected benefit', false),
  };
}

// Public — create a pending tech post with optional files.
async function submitTechPost(body, files) {
  let postId;
  try {
    const v = await validate(body);
    await withTransaction(async (req) => {
      const r = await req()
        .input('name', sql.NVarChar(100), v.name).input('email', sql.NVarChar(150), v.email)
        .input('deptId', sql.Int, v.deptId).input('title', sql.NVarChar(200), v.title)
        .input('techType', sql.NVarChar(30), v.techType).input('techTypeOther', sql.NVarChar(50), v.techTypeOther)
        .input('summary', sql.NVarChar(sql.MAX), v.summary).input('linkUrl', sql.NVarChar(500), v.linkUrl)
        .input('useCase', sql.NVarChar(sql.MAX), v.useCase).input('benefit', sql.NVarChar(sql.MAX), v.expectedBenefit)
        .query(`INSERT INTO ai_tech_posts (submitter_name, submitter_email, dept_id, title, tech_type, tech_type_other, summary, link_url, use_case, expected_benefit)
                OUTPUT INSERTED.post_id
                VALUES (@name, @email, @deptId, @title, @techType, @techTypeOther, @summary, @linkUrl, @useCase, @benefit)`);
      postId = r.recordset[0].post_id;
      for (const f of files || []) {
        await req().input('postId', sql.Int, postId)
          .input('originalName', sql.NVarChar(260), fixFilename(f.originalname).slice(0, 260))
          .input('storedName', sql.NVarChar(100), f.filename)
          .input('storagePath', sql.NVarChar(500), path.relative(STORAGE_ROOT, f.path))
          .input('mimeType', sql.NVarChar(150), f.mimetype || null)
          .input('fileSize', sql.BigInt, f.size)
          .query(`INSERT INTO ai_tech_post_files (post_id, original_name, stored_name, storage_path, mime_type, file_size)
                  VALUES (@postId, @originalName, @storedName, @storagePath, @mimeType, @fileSize)`);
      }
    });
    const row = await getPostRow(postId);
    return { submitted: true, postId, refCode: refCode({ kind: 'tech', deptName: row.deptName, createdAt: row.createdAt, id: postId }) };
  } catch (e) {
    removeUploaded(files);
    throw e;
  }
}

const SELECT = `
  SELECT p.post_id AS postId, p.submitter_name AS submitterName, p.submitter_email AS submitterEmail,
         p.dept_id AS deptId, d.dept_name AS deptName, p.title, p.tech_type AS techType, p.tech_type_other AS techTypeOther,
         p.summary, p.link_url AS linkUrl, p.use_case AS useCase, p.expected_benefit AS expectedBenefit,
         p.status, p.review_note AS reviewNote, p.reviewed_at AS reviewedAt, p.created_at AS createdAt,
         COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''), ru.email) AS reviewedByName
  FROM ai_tech_posts p
  INNER JOIN dept_master d ON d.dept_id = p.dept_id
  LEFT JOIN auth_users ru ON ru.user_id = p.reviewed_by`;

async function attachFiles(posts) {
  if (!posts.length) return posts;
  const pool = await getPool();
  const req = pool.request();
  const params = posts.map((p, i) => { req.input(`p${i}`, sql.Int, p.postId); return `@p${i}`; });
  const r = await req.query(`
    SELECT file_id AS fileId, post_id AS postId, original_name AS originalName, mime_type AS mimeType, file_size AS fileSize
    FROM ai_tech_post_files WHERE post_id IN (${params.join(',')}) ORDER BY file_id`);
  const by = new Map();
  for (const f of r.recordset) {
    if (!by.has(f.postId)) by.set(f.postId, []);
    by.get(f.postId).push({ ...f, fileSize: Number(f.fileSize), originalName: fixFilename(f.originalName) });
  }
  return posts.map(p => ({
    ...p, refCode: refCode({ kind: 'tech', deptName: p.deptName, createdAt: p.createdAt, id: p.postId }), summary: toSafeHtml(p.summary), useCase: toSafeHtml(p.useCase), expectedBenefit: p.expectedBenefit == null ? null : toSafeHtml(p.expectedBenefit),
    files: by.get(p.postId) || [],
  }));
}

// Admin list (route-gated).
async function listTechPosts({ status, deptId, search } = {}) {
  const pool = await getPool();
  const req = pool.request();
  const where = ['p.is_deleted = 0'];
  if (status && STATUSES.includes(status)) { where.push('p.status = @status'); req.input('status', sql.NVarChar(10), status); }
  if (deptId && Number.isInteger(Number(deptId))) { where.push('p.dept_id = @deptId'); req.input('deptId', sql.Int, Number(deptId)); }
  const q = String(search || '').trim();
  const byCode = idFromRefCode(q, 'tech');            // a typed reference code points at one post
  if (byCode) {
    where.push('p.post_id = @codeId'); req.input('codeId', sql.Int, byCode.id);
  } else if (q) {
    where.push('(p.title LIKE @q OR p.submitter_name LIKE @q OR p.tech_type_other LIKE @q)');
    req.input('q', sql.NVarChar(210), `%${q.slice(0, 200).replace(/[[%_]/g, '[$&]')}%`);
  }
  const r = await req.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC`);
  const posts = await attachFiles(r.recordset);
  const c = await pool.request().query(`SELECT status, COUNT(*) AS n FROM ai_tech_posts WHERE is_deleted = 0 GROUP BY status`);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of c.recordset) counts[row.status] = row.n;
  return { posts, counts, departments: await getActiveDepartments(), techTypes: TECH_TYPES };
}

async function getPostRow(postId) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, postId).query(`${SELECT} WHERE p.post_id = @id AND p.is_deleted = 0`);
  const row = r.recordset[0];
  if (!row) throw httpError(404, 'Tech post not found.');
  return row;
}

async function reviewTechPost(postId, action, note, actorId) {
  if (!['approve', 'reject'].includes(action)) throw httpError(400, 'Action must be approve or reject.');
  await getPostRow(postId);
  const reviewNote = text(note, LIMITS.note, 'Note', false);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, postId)
    .input('status', sql.NVarChar(10), action === 'approve' ? 'approved' : 'rejected')
    .input('note', sql.NVarChar(500), reviewNote).input('actor', sql.UniqueIdentifier, actorId)
    .query(`UPDATE ai_tech_posts SET status=@status, review_note=@note, reviewed_by=@actor, reviewed_at=SYSDATETIMEOFFSET() WHERE post_id=@id`);
  return (await attachFiles([await getPostRow(postId)]))[0];
}

async function deleteTechPost(postId) {
  await getPostRow(postId);
  const pool = await getPool();
  await pool.request().input('id', sql.Int, postId).query(`UPDATE ai_tech_posts SET is_deleted = 1 WHERE post_id = @id`);
  return { deleted: true };
}

// An approved post's file is public (it is part of the open feed); any post's file for admins.
async function getFileForDownload(postId, fileId, isAdmin) {
  const post = await getPostRow(postId);
  if (!isAdmin && post.status !== 'approved') throw httpError(404, 'Not found.');
  const pool = await getPool();
  const r = await pool.request().input('fileId', sql.Int, fileId).input('id', sql.Int, postId)
    .query(`SELECT original_name AS originalName, storage_path AS storagePath, mime_type AS mimeType FROM ai_tech_post_files WHERE file_id=@fileId AND post_id=@id`);
  const f = r.recordset[0];
  if (!f) throw httpError(404, 'File not found.');
  const root = path.resolve(STORAGE_ROOT);
  const full = path.resolve(root, f.storagePath);
  if (!full.startsWith(root)) throw httpError(400, 'Invalid file path.');
  if (!fs.existsSync(full)) throw httpError(404, 'File is missing on the server.');
  return { originalName: fixFilename(f.originalName), mimeType: f.mimeType, fullPath: full };
}

module.exports = { TECH_TYPES, getFormOptions, submitTechPost, listTechPosts, reviewTechPost, deleteTechPost, getFileForDownload, cleanUrl };
