'use strict';

/**
 * aiFeedService — the open "AI Feed": approved AI stories and approved tech posts together,
 * newest first, with likes and comments.
 *
 * There is no login, so a visitor is just a name + email they type. That identity is only an
 * honour system: nobody can verify an email, so it is used to keep things tidy (one like per
 * email per item, a name on a comment) and is never shown to other visitors. Admins can
 * remove any comment.
 */

const { getPool, sql } = require('../../../config/db');
const { toSafeHtml } = require('./richText');
const { httpError, EMAIL_RE, getActiveDepartments } = require('./aiStoryService');

const TYPES = ['story', 'tech'];
const PAGE_SIZE = 10;
const COMMENT_MAX = 1000;
const COMMENT_LIST_MAX = 200;
const COMMENTS_PER_EMAIL_PER_HOUR = 20;

const normEmail = (e) => String(e ?? '').trim().toLowerCase();

function assertType(t) {
  if (!TYPES.includes(t)) throw httpError(400, 'Unknown item type.');
}
function assertId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, 'Unknown item.');
  return n;
}
function identity(name, email) {
  const n = String(name ?? '').trim();
  const e = normEmail(email);
  if (!n) throw httpError(400, 'Please enter your name.');
  if (n.length > 100) throw httpError(400, 'Name is too long (max 100 characters).');
  if (!EMAIL_RE.test(e) || e.length > 150) throw httpError(400, 'Please enter a valid email address.');
  return { name: n, email: e };
}

// `(@p0,@p1,…)` for a list of ints (or `(NULL)` when empty) — values go in as parameters.
function inList(req, prefix, ids) {
  if (!ids.length) return '(NULL)';
  return `(${ids.map((id, i) => { req.input(`${prefix}${i}`, sql.Int, id); return `@${prefix}${i}`; }).join(',')})`;
}

// An item must be a live, approved story / tech post to be liked or commented on.
async function assertItem(type, id) {
  assertType(type);
  const pool = await getPool();
  const q = type === 'story'
    ? `SELECT 1 AS ok FROM ai_stories WHERE story_id=@id AND status='approved' AND is_deleted=0`
    : `SELECT 1 AS ok FROM ai_tech_posts WHERE post_id=@id AND status='approved' AND is_deleted=0`;
  const r = await pool.request().input('id', sql.Int, id).query(q);
  if (!r.recordset.length) throw httpError(404, 'This post is no longer available.');
}

async function getFeedOptions() {
  return { departments: await getActiveDepartments() };
}

const section = (label, html) => (html && String(html).trim() ? { label, html: toSafeHtml(html) } : null);

// ── The feed ───────────────────────────────────────────────────────────────
async function listFeed({ type, deptId, q, page, email } = {}) {
  const pool = await getPool();
  const pageNo = Math.max(1, Math.min(Number(page) || 1, 500));
  const where = [];
  const req = pool.request();
  if (TYPES.includes(type)) { where.push('itemType = @type'); req.input('type', sql.NVarChar(10), type); }
  if (deptId && Number.isInteger(Number(deptId))) { where.push('deptId = @deptId'); req.input('deptId', sql.Int, Number(deptId)); }
  const term = String(q ?? '').trim();
  if (term) {
    where.push('(title LIKE @q OR authorName LIKE @q OR badge LIKE @q OR searchText LIKE @q)');
    req.input('q', sql.NVarChar(210), `%${term.slice(0, 200).replace(/[[%_]/g, '[$&]')}%`);
  }
  req.input('off', sql.Int, (pageNo - 1) * PAGE_SIZE).input('n', sql.Int, PAGE_SIZE + 1);

  const rows = (await req.query(`
    WITH items AS (
      SELECT 'story' AS itemType, s.story_id AS itemId, s.title, s.submitter_name AS authorName, s.dept_id AS deptId,
             d.dept_name AS deptName, s.created_at AS createdAt,
             CASE WHEN s.ai_models IS NOT NULL THEN s.ai_models
                  WHEN s.ai_model = 'Other' THEN COALESCE(s.ai_model_other, 'Other') ELSE s.ai_model END AS badge,
             s.description AS searchText
      FROM ai_stories s INNER JOIN dept_master d ON d.dept_id = s.dept_id
      WHERE s.status = 'approved' AND s.is_deleted = 0
      UNION ALL
      SELECT 'tech', p.post_id, p.title, p.submitter_name, p.dept_id, d.dept_name, p.created_at,
             CASE WHEN p.tech_type = 'Other' THEN COALESCE(p.tech_type_other, 'Other') ELSE p.tech_type END,
             p.summary
      FROM ai_tech_posts p INNER JOIN dept_master d ON d.dept_id = p.dept_id
      WHERE p.status = 'approved' AND p.is_deleted = 0
    )
    SELECT itemType, itemId, title, authorName, deptId, deptName, createdAt, badge
    FROM items ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY createdAt DESC, itemId DESC
    OFFSET @off ROWS FETCH NEXT @n ROWS ONLY`)).recordset;

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);
  const storyIds = pageRows.filter(r => r.itemType === 'story').map(r => r.itemId);
  const techIds = pageRows.filter(r => r.itemType === 'tech').map(r => r.itemId);

  // Full text of the items on this page.
  const storyBody = new Map();
  if (storyIds.length) {
    const r2 = pool.request();
    const list = inList(r2, 's', storyIds);
    for (const s of (await r2.query(`
      SELECT story_id AS id, description, daily_activities AS dailyActivities, deliverables, input_details AS inputDetails,
             output_details AS outputDetails, impact_description AS impactDescription,
             improved_productivity AS improvedProductivity, improved_accuracy AS improvedAccuracy
      FROM ai_stories WHERE story_id IN ${list}`)).recordset) storyBody.set(s.id, s);
  }
  const techBody = new Map();
  const techFiles = new Map();
  if (techIds.length) {
    const r3 = pool.request();
    const list = inList(r3, 't', techIds);
    for (const t of (await r3.query(`
      SELECT post_id AS id, summary, use_case AS useCase, expected_benefit AS expectedBenefit, link_url AS linkUrl
      FROM ai_tech_posts WHERE post_id IN ${list}`)).recordset) techBody.set(t.id, t);
    const r4 = pool.request();
    const list4 = inList(r4, 'f', techIds);
    for (const f of (await r4.query(`
      SELECT file_id AS fileId, post_id AS postId, original_name AS originalName, mime_type AS mimeType
      FROM ai_tech_post_files WHERE post_id IN ${list4} ORDER BY file_id`)).recordset) {
      if (!techFiles.has(f.postId)) techFiles.set(f.postId, []);
      techFiles.get(f.postId).push({ fileId: f.fileId, originalName: f.originalName, isImage: /^image\//i.test(f.mimeType || '') });
    }
  }

  // Likes, comments and "did I like this" for the page.
  const counts = new Map();   // `${type}:${id}` -> { likes, comments, liked }
  const bump = (t, id, key, n) => { const k = `${t}:${id}`; counts.set(k, { likes: 0, comments: 0, liked: false, ...(counts.get(k) || {}), [key]: n }); };
  if (pageRows.length) {
    const rl = pool.request(); const lS = inList(rl, 'ls', storyIds); const lT = inList(rl, 'lt', techIds);
    for (const r of (await rl.query(`
      SELECT item_type AS t, item_id AS id, COUNT(*) AS n FROM ai_feed_likes
      WHERE (item_type='story' AND item_id IN ${lS}) OR (item_type='tech' AND item_id IN ${lT}) GROUP BY item_type, item_id`)).recordset) bump(r.t, r.id, 'likes', r.n);
    const rc = pool.request(); const cS = inList(rc, 'cs', storyIds); const cT = inList(rc, 'ct', techIds);
    for (const r of (await rc.query(`
      SELECT item_type AS t, item_id AS id, COUNT(*) AS n FROM ai_feed_comments
      WHERE is_deleted = 0 AND ((item_type='story' AND item_id IN ${cS}) OR (item_type='tech' AND item_id IN ${cT})) GROUP BY item_type, item_id`)).recordset) bump(r.t, r.id, 'comments', r.n);
    const me = normEmail(email);
    if (me && EMAIL_RE.test(me)) {
      const rm = pool.request().input('email', sql.NVarChar(150), me); const mS = inList(rm, 'ms', storyIds); const mT = inList(rm, 'mt', techIds);
      for (const r of (await rm.query(`
        SELECT item_type AS t, item_id AS id FROM ai_feed_likes
        WHERE liker_email = @email AND ((item_type='story' AND item_id IN ${mS}) OR (item_type='tech' AND item_id IN ${mT}))`)).recordset) bump(r.t, r.id, 'liked', true);
    }
  }

  const items = pageRows.map(r => {
    const c = counts.get(`${r.itemType}:${r.itemId}`) || { likes: 0, comments: 0, liked: false };
    // A multi-tool story's badge arrives as its JSON list of tools: show them comma-separated.
    let badge = r.badge;
    if (r.itemType === 'story' && typeof badge === 'string' && badge.startsWith('[')) {
      try { badge = JSON.parse(badge).join(', '); } catch { /* keep as is */ }
    }
    const base = {
      key: `${r.itemType}-${r.itemId}`, type: r.itemType, id: r.itemId, title: r.title, authorName: r.authorName,
      deptName: r.deptName, createdAt: r.createdAt, badge,
      likeCount: c.likes, commentCount: c.comments, likedByMe: c.liked,
    };
    if (r.itemType === 'story') {
      const b = storyBody.get(r.itemId) || {};
      return {
        ...base, linkUrl: null, files: [],
        chips: [b.improvedProductivity && 'Productivity ↑', b.improvedAccuracy && 'Accuracy ↑'].filter(Boolean),
        sections: [
          section('Their AI story', b.description), section('Daily activities handed to AI', b.dailyActivities),
          section('Deliverables made with AI', b.deliverables), section('Input', b.inputDetails),
          section('Output', b.outputDetails), section('Impact', b.impactDescription),
        ].filter(Boolean),
      };
    }
    const b = techBody.get(r.itemId) || {};
    return {
      ...base, linkUrl: b.linkUrl || null, files: techFiles.get(r.itemId) || [], chips: [],
      sections: [section('What it is', b.summary), section('How we could use it', b.useCase), section('Expected benefit', b.expectedBenefit)].filter(Boolean),
    };
  });

  return { items, hasMore, page: pageNo };
}

// ── Comments ───────────────────────────────────────────────────────────────
async function listComments(type, id) {
  const itemId = assertId(id);
  await assertItem(type, itemId);
  const pool = await getPool();
  const r = await pool.request().input('t', sql.NVarChar(10), type).input('id', sql.Int, itemId).query(`
    SELECT TOP (${COMMENT_LIST_MAX}) comment_id AS commentId, author_name AS authorName, body, created_at AS createdAt
    FROM ai_feed_comments WHERE item_type=@t AND item_id=@id AND is_deleted=0 ORDER BY created_at ASC, comment_id ASC`);
  return { comments: r.recordset };
}

async function addComment(type, id, name, email, body) {
  const itemId = assertId(id);
  const who = identity(name, email);
  const text = String(body ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) throw httpError(400, 'Write a comment first.');
  if (text.length > COMMENT_MAX) throw httpError(400, `Comment is too long (max ${COMMENT_MAX} characters).`);
  await assertItem(type, itemId);
  const pool = await getPool();
  const recent = await pool.request().input('email', sql.NVarChar(150), who.email)
    .query(`SELECT COUNT(*) AS n FROM ai_feed_comments WHERE author_email=@email AND created_at > DATEADD(hour, -1, SYSDATETIMEOFFSET())`);
  if (recent.recordset[0].n >= COMMENTS_PER_EMAIL_PER_HOUR) throw httpError(429, 'You are commenting very quickly — please wait a little and try again.');
  const r = await pool.request()
    .input('t', sql.NVarChar(10), type).input('id', sql.Int, itemId).input('name', sql.NVarChar(100), who.name)
    .input('email', sql.NVarChar(150), who.email).input('body', sql.NVarChar(1000), text)
    .query(`INSERT INTO ai_feed_comments (item_type, item_id, author_name, author_email, body)
            OUTPUT INSERTED.comment_id AS commentId, INSERTED.author_name AS authorName, INSERTED.body, INSERTED.created_at AS createdAt
            VALUES (@t, @id, @name, @email, @body)`);
  return { comment: r.recordset[0] };
}

// ── Likes ─────────────────────────────────────────────────────────────────
async function likeCount(type, itemId) {
  const pool = await getPool();
  const r = await pool.request().input('t', sql.NVarChar(10), type).input('id', sql.Int, itemId)
    .query(`SELECT COUNT(*) AS n FROM ai_feed_likes WHERE item_type=@t AND item_id=@id`);
  return r.recordset[0].n;
}

// Press once to like, again to un-like. One like per email per item.
async function toggleLike(type, id, name, email) {
  const itemId = assertId(id);
  const who = identity(name, email);
  await assertItem(type, itemId);
  const pool = await getPool();
  const mk = () => pool.request().input('t', sql.NVarChar(10), type).input('id', sql.Int, itemId)
    .input('email', sql.NVarChar(150), who.email).input('name', sql.NVarChar(100), who.name);
  const del = await mk().query(`DELETE FROM ai_feed_likes WHERE item_type=@t AND item_id=@id AND liker_email=@email`);
  let liked = false;
  if (!del.rowsAffected[0]) {
    try {
      await mk().query(`INSERT INTO ai_feed_likes (item_type, item_id, liker_email, liker_name) VALUES (@t, @id, @email, @name)`);
    } catch (e) {
      if (![2627, 2601].includes(e.number)) throw e;   // a double-click raced us: it is already liked
    }
    liked = true;
  }
  return { liked, likeCount: await likeCount(type, itemId) };
}

// ── Admin moderation (route-gated) ───────────────────────────────────────
async function listRecentComments() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT TOP (100) c.comment_id AS commentId, c.item_type AS itemType, c.item_id AS itemId, c.author_name AS authorName,
           c.author_email AS authorEmail, c.body, c.created_at AS createdAt, COALESCE(s.title, p.title) AS itemTitle
    FROM ai_feed_comments c
    LEFT JOIN ai_stories s ON c.item_type = 'story' AND s.story_id = c.item_id
    LEFT JOIN ai_tech_posts p ON c.item_type = 'tech' AND p.post_id = c.item_id
    WHERE c.is_deleted = 0 ORDER BY c.created_at DESC, c.comment_id DESC`);
  return { comments: r.recordset };
}

async function deleteComment(commentId) {
  const id = assertId(commentId);
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`UPDATE ai_feed_comments SET is_deleted = 1 WHERE comment_id=@id AND is_deleted=0`);
  if (!r.rowsAffected[0]) throw httpError(404, 'Comment not found.');
  return { deleted: true };
}

module.exports = { TYPES, PAGE_SIZE, getFeedOptions, listFeed, listComments, addComment, toggleLike, listRecentComments, deleteComment };
