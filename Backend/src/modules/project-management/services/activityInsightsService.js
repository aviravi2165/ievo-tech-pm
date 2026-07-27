'use strict';

const { getPool, sql } = require('../../../config/db');

// How many days back "Completed recently" looks — decoupled from the cron
// schedule itself (ACTIVITY_INSIGHTS_CRON_SCHEDULE) on purpose: tracking
// "since the last run" would need a persisted job-run timestamp, and the
// schedule can be reconfigured independently of what counts as "recent".
const LOOKBACK_DAYS   = parseInt(process.env.ACTIVITY_INSIGHTS_LOOKBACK_DAYS   || '7', 10);
// How many days ahead of today counts as "due soon" (not yet overdue, but
// close enough to flag as upcoming direction).
const DUE_SOON_DAYS   = parseInt(process.env.ACTIVITY_INSIGHTS_DUE_SOON_DAYS  || '3', 10);
// How many task names to list inline per section before collapsing the
// rest into "+N more" — keeps the message readable for activities with
// dozens of tasks instead of dumping every name.
const MAX_NAMES_SHOWN = 5;

const DONE = 'Complete';

// ── Data gathering ──────────────────────────────────────────────────────────

// Every Activity that (a) already has a group chat thread — insights only
// go where a conversation already exists, this job never creates one just
// to post into it — and (b) belongs to a project that's still actually in
// flight (not Completed/Cancelled, not soft-deleted). Phase/Activity
// themselves must also be live.
async function getEligibleActivities() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      a.activity_id       AS activityId,
      a.name               AS activityName,
      pat.conversation_id  AS conversationId,
      cg.group_id          AS groupId,
      cg.group_name        AS groupName
    FROM pm_activities a
    INNER JOIN pm_activity_threads  pat ON pat.activity_id = a.activity_id
    INNER JOIN comm_conversations   cc  ON cc.conversation_id = pat.conversation_id AND cc.is_deleted = 0
    INNER JOIN comm_groups          cg  ON cg.group_id = cc.group_id AND cg.is_active = 1
    INNER JOIN pm_phases            ph  ON ph.phase_id = a.phase_id AND ph.is_deleted = 0
    INNER JOIN pm_projects          p   ON p.project_id = ph.project_id AND p.is_deleted = 0
    WHERE a.is_deleted = 0
      AND p.status NOT IN ('Completed', 'Cancelled')
  `);
  return result.recordset;
}

async function getActivityTasks(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT task_id AS taskId, name, status, due_date AS dueDate, priority
      FROM pm_tasks
      WHERE activity_id = @activityId AND is_deleted = 0
    `);
  return result.recordset;
}

// taskId -> completedAt, for tasks under this activity that have a real
// 'status_changed' → Complete audit row (same source as the Analytics tab's
// on-time-completion chart — see auditService.getTaskCompletionDates).
async function getActivityTaskCompletions(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT entity_id AS taskId, MAX(changed_at) AS completedAt
      FROM pm_audit_log
      WHERE entity_type = 'task' AND action = 'status_changed'
        AND field_changed = 'status' AND new_value = 'Complete'
        AND entity_id IN (SELECT task_id FROM pm_tasks WHERE activity_id = @activityId AND is_deleted = 0)
      GROUP BY entity_id
    `);
  const map = {};
  result.recordset.forEach(r => { map[r.taskId] = r.completedAt; });
  return map;
}

// ── Message composition ──────────────────────────────────────────────────────

function namesList(tasks) {
  const shown = tasks.slice(0, MAX_NAMES_SHOWN).map(t => t.name).join(', ');
  const extra = tasks.length - MAX_NAMES_SHOWN;
  return extra > 0 ? `${shown}, +${extra} more` : shown;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

// Pure function — no I/O — so it's independently testable and reused by
// buildInsightMessage below. Returns null when there's genuinely nothing to
// say (no tasks at all), which the caller uses to skip posting entirely.
function composeInsightMessage(activityName, tasks, completions, now = new Date()) {
  if (!tasks.length) return null;

  const total    = tasks.length;
  const complete = tasks.filter(t => t.status === DONE);
  const dueSoonCutoff = new Date(now); dueSoonCutoff.setDate(dueSoonCutoff.getDate() + DUE_SOON_DAYS);
  const lookbackCutoff = new Date(now); lookbackCutoff.setDate(lookbackCutoff.getDate() - LOOKBACK_DAYS);

  const overdue = tasks.filter(t => t.status !== DONE && t.dueDate && new Date(t.dueDate) < now)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)); // most overdue first
  const dueSoon = tasks.filter(t =>
    t.status !== DONE && t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= dueSoonCutoff
  ).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const blocked = tasks.filter(t => t.status === 'Blocked');
  const recentlyCompleted = complete.filter(t => {
    const at = completions[t.taskId];
    return at && new Date(at) >= lookbackCutoff;
  });

  const pct = Math.round((complete.length / total) * 100);

  const lines = [];
  lines.push(`📊 Activity Insights — ${activityName}`);
  lines.push(`Progress: ${pct}% complete (${complete.length}/${total} tasks)`);
  lines.push('');

  if (overdue.length) {
    lines.push(`🔴 Overdue (${overdue.length}): ${namesList(overdue)}`);
  }
  if (dueSoon.length) {
    lines.push(`🟠 Due in the next ${DUE_SOON_DAYS} day${DUE_SOON_DAYS === 1 ? '' : 's'} (${dueSoon.length}): ${namesList(dueSoon)}`);
  }
  if (blocked.length) {
    lines.push(`🚧 Blocked (${blocked.length}): ${namesList(blocked)}`);
  }
  if (recentlyCompleted.length) {
    lines.push(`✅ Completed in the last ${LOOKBACK_DAYS} days (${recentlyCompleted.length}): ${namesList(recentlyCompleted)}`);
  }

  // "Direction" — the single most urgent remaining thing, so the message
  // doesn't just describe status but points at what to do next. Overdue
  // (oldest first) beats due-soon (soonest first) as the priority pick.
  const nextUp = overdue[0] || dueSoon[0]
    || tasks.filter(t => t.status !== DONE).sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    })[0];

  lines.push('');
  if (nextUp) {
    lines.push(`➡ Next up: "${nextUp.name}"${nextUp.dueDate ? ` — due ${fmtDate(nextUp.dueDate)}` : ' — no due date set'}`);
  } else {
    lines.push('🎉 All tasks complete — nothing remaining under this activity.');
  }

  return lines.join('\n');
}

// ── Posting ──────────────────────────────────────────────────────────────────

async function postInsightMessage(conversationId, bodyText) {
  const pool = await getPool();
  const msgRes = await pool.request()
    .input('convId', sql.Int, conversationId)
    .input('body',   sql.NVarChar, bodyText)
    .query(`
      INSERT INTO comm_messages (conversation_id, sender_id, body_html, is_system)
      OUTPUT INSERTED.message_id AS messageId, INSERTED.sent_at AS sentAt
      VALUES (@convId, NULL, @body, 1)
    `);
  await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`UPDATE comm_conversations SET last_message_at = SYSDATETIMEOFFSET() WHERE conversation_id = @convId`);
  return msgRes.recordset[0];
}

async function postInsightsForActivity(activity) {
  const [tasks, completions] = await Promise.all([
    getActivityTasks(activity.activityId),
    getActivityTaskCompletions(activity.activityId),
  ]);
  const body = composeInsightMessage(activity.activityName, tasks, completions);
  if (!body) return null; // nothing to report — no tasks under this activity

  const inserted = await postInsightMessage(activity.conversationId, body);

  // Lazily required — same pattern PM's own socketHandler.js uses to reach
  // the messages module's shared io instance without a load-time circular
  // require between the two modules.
  const { broadcastNewMessage } = require('../../messages/socket/socketHandler');
  await broadcastNewMessage({
    conversationId: activity.conversationId,
    messageId:      inserted.messageId,
    senderName:     null,
    senderUserId:   null,
    groupId:        activity.groupId,
    groupName:      activity.groupName,
    convType:       'group_thread',
    bodyHtml:       body,
    createdAt:      inserted.sentAt,
    isSystem:       true,
    excludeFromUnread: true,
  }).catch(err => console.error('[activityInsights] broadcast failed:', err.message));

  return inserted;
}

// Runs the full sweep — one activity's failure (bad data, a task with a
// malformed date, etc.) is caught and logged per-activity so it can't take
// down the rest of the run.
async function runActivityInsightsJob() {
  const activities = await getEligibleActivities();
  let posted = 0, skipped = 0, failed = 0;
  for (const activity of activities) {
    try {
      const result = await postInsightsForActivity(activity);
      if (result) posted += 1; else skipped += 1;
    } catch (err) {
      failed += 1;
      console.error(`[activityInsights] failed for activity ${activity.activityId}:`, err.message);
    }
  }
  console.log(`[activityInsights] run complete — posted ${posted}, skipped ${skipped} (no tasks), failed ${failed}, eligible ${activities.length}`);
  return { posted, skipped, failed, eligible: activities.length };
}

module.exports = {
  getEligibleActivities,
  composeInsightMessage,
  postInsightsForActivity,
  runActivityInsightsJob,
};
