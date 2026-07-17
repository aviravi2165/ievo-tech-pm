'use strict';

const { getPool, sql } = require('../../../config/db');

async function log({ entityType, entityId, projectId, userId, action, fieldChanged, oldValue, newValue }) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('entityType',   sql.NVarChar(20),     entityType)
      .input('entityId',     sql.Int,              entityId)
      .input('projectId',    sql.Int,              projectId ?? null)
      .input('userId',       sql.UniqueIdentifier, userId ?? null)
      .input('action',       sql.NVarChar(60),     action)
      .input('fieldChanged', sql.NVarChar(100),    fieldChanged ?? null)
      .input('oldValue',     sql.NVarChar(sql.MAX),oldValue != null ? String(oldValue) : null)
      .input('newValue',     sql.NVarChar(sql.MAX),newValue != null ? String(newValue) : null)
      .query(`
        INSERT INTO pm_audit_log (entity_type,entity_id,project_id,user_id,action,field_changed,old_value,new_value)
        VALUES (@entityType,@entityId,@projectId,@userId,@action,@fieldChanged,@oldValue,@newValue)
      `);
  } catch (err) { console.error('[pm:audit]', err.message); }
}

async function getProjectAudit(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT TOP (500)
             a.id, a.entity_type AS entityType, a.entity_id AS entityId,
             a.action, a.field_changed AS fieldChanged,
             a.old_value AS oldValue, a.new_value AS newValue,
             a.changed_at AS changedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS userName
      FROM pm_audit_log a
      LEFT JOIN auth_users u ON u.user_id = a.user_id
      -- 'status_computed' rows are a background recording of Phase/Activity
      -- status-over-time for the Timeline's segmented bars (see
      -- recordStatusIfChanged below) — they fire on ordinary page reads
      -- whenever a computed status happens to differ, not on anything a
      -- person actually did, so they don't belong in a human-facing
      -- "what happened" feed. getStatusHistory queries them directly and is
      -- the only consumer that should ever see this action.
      WHERE a.project_id = @projectId AND a.action <> 'status_computed'
      ORDER BY a.changed_at DESC
    `);
  return result.recordset;
}

// Org-wide activity feed for the admin dashboard — same shape as
// getMyRecentAudit but with no per-user project-membership scoping, since
// an admin isn't a member/assignee anywhere and that scoping would return
// nothing for them.
async function getAllRecentAudit() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`
      SELECT TOP (60)
        a.id,
        a.entity_type   AS entityType,
        a.entity_id     AS entityId,
        a.project_id    AS projectId,
        a.action,
        a.field_changed AS fieldChanged,
        a.old_value     AS oldValue,
        a.new_value     AS newValue,
        a.changed_at    AS createdAt,
        pr.name         AS projectName,
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email, 'System') AS actorName
      FROM pm_audit_log a
      INNER JOIN pm_projects pr ON pr.project_id = a.project_id
      LEFT  JOIN auth_users  u  ON u.user_id = a.user_id
      WHERE a.action <> 'status_computed'
      ORDER BY a.changed_at DESC
    `);
  return result.recordset;
}

// ── Status history — real tracking for Timeline segmented bars ─────────────────
//
// Phase/Activity status is computed live from child progress on every read
// (progressService.deriveStatus) — there's no column that just holds "the
// current status" the way pm_tasks.status does, so nothing was ever
// recording WHEN a transition actually happened. recordStatusIfChanged is
// called every time a Phase/Activity's status gets (re)computed — on the
// list-read endpoints (phaseService/activityService) and right after a
// cascading recompute (taskService.updateTaskStatus) — and only writes a
// new row when the status actually differs from the last recorded one, so
// repeatedly viewing an unchanged project doesn't spam the log. Uses a
// distinct action ('status_computed', actor 'System'/null userId) instead
// of task's 'status_changed' so these system-inferred transitions don't get
// misattributed to whichever user happened to be viewing when the
// recompute ran, and so getStatusHistory can query it precisely without
// following a random authenticated task ordering.
async function recordStatusIfChanged(entityType, entityId, projectId, newStatus) {
  if (!newStatus) return;
  try {
    const pool = await getPool();
    const last = await pool.request()
      .input('entityType', sql.NVarChar(20), entityType)
      .input('entityId',   sql.Int,          entityId)
      .query(`
        SELECT TOP 1 new_value AS lastStatus
        FROM pm_audit_log
        WHERE entity_type=@entityType AND entity_id=@entityId AND action='status_computed'
        ORDER BY changed_at DESC, id DESC
      `);
    const lastStatus = last.recordset[0]?.lastStatus;
    if (lastStatus === newStatus) return;
    await log({
      entityType, entityId, projectId, userId: null,
      action: 'status_computed', fieldChanged: 'status',
      oldValue: lastStatus || null, newValue: newStatus,
    });
  } catch (err) { console.error('[pm:audit:status]', err.message); }
}

// Ordered [{ status, from, to }] segments for a Phase/Activity/Task, built
// from its real status_changed/status_computed audit trail. `to: null`
// on the last segment means "still current, extend to today" — the caller
// (TimelineView) clips this to the entity's planned date range.
async function getStatusHistory(entityType, entityId) {
  const pool = await getPool();
  const action = entityType === 'task' ? 'status_changed' : 'status_computed';
  const result = await pool.request()
    .input('entityType', sql.NVarChar(20), entityType)
    .input('entityId',   sql.Int,          entityId)
    .input('action',     sql.NVarChar(60), action)
    .query(`
      SELECT changed_at AS changedAt, old_value AS oldValue, new_value AS newValue
      FROM pm_audit_log
      WHERE entity_type=@entityType AND entity_id=@entityId AND action=@action AND field_changed='status'
      ORDER BY changed_at ASC, id ASC
    `);
  const changes = result.recordset;
  if (!changes.length) return [];

  // First segment's `from: null` mirrors the last segment's `to: null` —
  // "open-ended, extend to whatever boundary the caller actually has"
  // (bar start for the first segment, now for the last). Without this the
  // entity's true initial status period collapses to zero width, since
  // there's no earlier audit row marking when it entered that state.
  const segments = [];
  let cursor = changes[0].changedAt;
  let status = changes[0].oldValue || 'To Do';
  let first = true;
  for (const c of changes) {
    segments.push({ status, from: first ? null : cursor, to: c.changedAt });
    cursor = c.changedAt;
    status = c.newValue;
    first = false;
  }
  segments.push({ status, from: first ? null : cursor, to: null });

  // Merge adjacent segments that share the same status. This happens for
  // real (an entity that computes back to a status it already had) but
  // also — and this was the actual bug — for every entity's very FIRST
  // logged entry: the initial recordStatusIfChanged call always writes a
  // row (oldValue=null → newValue=current status) just to start tracking,
  // which produces a same-status "To Do → To Do" split with the seam
  // sitting wherever that first read happened to fire. Rendered as two
  // bar segments that seam is usually a sliver right next to "now", which
  // silently ate the status label (SegmentBar only labels the LAST piece)
  // and made an otherwise-untouched bar look like a solid blob with no text.
  const merged = [];
  for (const s of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.status === s.status) prev.to = s.to;
    else merged.push({ ...s });
  }

  return merged.map(s => ({
    status: s.status,
    from: s.from ? new Date(s.from).toISOString() : null,
    to: s.to ? new Date(s.to).toISOString() : null,
  }));
}

module.exports = {
  log, getProjectAudit, getMyRecentAudit, getAllRecentAudit,
  recordStatusIfChanged, getStatusHistory,
};

async function getMyRecentAudit(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT TOP (60)
        a.id,
        a.entity_type   AS entityType,
        a.entity_id     AS entityId,
        a.project_id    AS projectId,
        a.action,
        a.field_changed AS fieldChanged,
        a.old_value     AS oldValue,
        a.new_value     AS newValue,
        a.changed_at    AS createdAt,
        pr.name         AS projectName,
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email, 'System') AS actorName
      FROM pm_audit_log a
      INNER JOIN pm_projects pr ON pr.project_id = a.project_id
      LEFT  JOIN auth_users  u  ON u.user_id = a.user_id
      WHERE a.project_id IN (
        -- Projects where this user is a direct project member
        SELECT pm.project_id FROM pm_members pm WHERE pm.user_id = @userId
        UNION
        -- Projects where this user is an activity member
        SELECT ph.project_id
        FROM pm_activity_members am
        INNER JOIN pm_activities ac ON ac.activity_id = am.activity_id
        INNER JOIN pm_phases     ph ON ph.phase_id     = ac.phase_id
        WHERE am.user_id = @userId
        UNION
        -- Projects where this user has accepted task assignments
        SELECT ph2.project_id
        FROM pm_task_assignees ta
        INNER JOIN pm_tasks      t2  ON t2.task_id      = ta.task_id
        INNER JOIN pm_activities ac2 ON ac2.activity_id = t2.activity_id
        INNER JOIN pm_phases     ph2 ON ph2.phase_id     = ac2.phase_id
        WHERE ta.user_id = @userId
      )
      AND a.action <> 'status_computed'
      ORDER BY a.changed_at DESC
    `);
  return result.recordset;
}