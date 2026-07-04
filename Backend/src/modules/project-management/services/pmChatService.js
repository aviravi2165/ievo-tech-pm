'use strict';

/**
 * pmChatService — links Tasks and Activities to auto-managed chat threads.
 *
 *   Task thread     → comm_conversations.conv_type = 'cc'  (Shared)
 *                      Participants: accepted assignees of THIS task + the
 *                      Activity's Manager(s).
 *   Activity thread → comm_conversations.conv_type = 'group_thread',
 *                      group_id = NULL (not a user-curated comm_groups row —
 *                      this is a system thread keyed off pm_activity_threads).
 *                      Participants: the Activity's Manager(s) + the union of
 *                      accepted assignees across ALL tasks in the activity.
 *
 * Both are fully auto-synced: accepting/declining/removing a task
 * assignment, or changing who holds the Activity Manager role, immediately
 * recomputes and applies the participant list. Nobody manually adds or
 * removes people from these threads — that happens through the PM screens
 * (assign someone to a task, make someone an Activity Manager) and this
 * service keeps the chat in step.
 *
 * These threads never delete messages or history when someone is removed —
 * removal is the same soft-delete-with-left_at pattern used everywhere else
 * in the messaging schema, which is what already powers the gap-window
 * logic in messageService.getThread(). Removing someone from a PM thread
 * just closes their visibility window; re-adding them (e.g. reassigning the
 * same task later) opens a new one.
 */

const { getPool, withTransaction, sql } = require('../../../config/db');
const { resolveActivityManagerIds, resolveActivityThreadSeedIds } = require('./roleService');

// ── Low-level: mirrors messageService's MERGE-based participant upsert ────────
// Duplicated intentionally rather than importing from messageService — these
// system threads are not subject to the "only the CC creator can add
// participants" rule that governs user-initiated Shared/CC conversations,
// so they need their own unguarded path.

async function upsertParticipants(reqFn, conversationId, userIds, participantType = 'to') {
  const unique = [...new Set(userIds.map(String))];
  for (const uid of unique) {
    await reqFn()
      .input('convId', sql.Int,              conversationId)
      .input('uid',    sql.UniqueIdentifier, uid)
      .input('ptype',  sql.NVarChar,         participantType)
      .query(`
        MERGE comm_participants AS target
        USING (SELECT @convId AS conversation_id, @uid AS user_id, @ptype AS participant_type) AS source
        ON (target.conversation_id = source.conversation_id AND target.user_id = source.user_id)
        WHEN MATCHED AND target.is_deleted = 1 THEN UPDATE SET
          is_deleted       = 0,
          participant_type = source.participant_type,
          rejoined_at      = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN INSERT (conversation_id, user_id, participant_type, joined_at)
          VALUES (source.conversation_id, source.user_id, source.participant_type, SYSDATETIMEOFFSET());
      `);
  }
}

async function removeParticipantsSoft(reqFn, conversationId, userIds) {
  const unique = [...new Set(userIds.map(String))];
  for (const uid of unique) {
    await reqFn()
      .input('convId', sql.Int,              conversationId)
      .input('uid',    sql.UniqueIdentifier, uid)
      .query(`
        UPDATE comm_participants
        SET is_deleted = 1, left_at = SYSDATETIMEOFFSET()
        WHERE conversation_id = @convId AND user_id = @uid AND is_deleted = 0
      `);
  }
}

async function getActiveParticipantIds(conversationId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`SELECT user_id AS userId FROM comm_participants WHERE conversation_id=@convId AND is_deleted=0`);
  return result.recordset.map(r => String(r.userId));
}

async function createSystemConversation(reqFn, { subject, createdBy, convType }) {
  const result = await reqFn()
    .input('subject',   sql.NVarChar,        subject)
    .input('createdBy', sql.UniqueIdentifier, createdBy)
    .input('convType',  sql.NVarChar,         convType)
    .query(`
      INSERT INTO comm_conversations (subject, created_by, allow_reply, group_id, conv_type, last_message_at)
      OUTPUT INSERTED.conversation_id
      VALUES (@subject, @createdBy, 1, NULL, @convType, SYSDATETIMEOFFSET())
    `);
  return result.recordset[0].conversation_id;
}

// ── Desired-participant computation ────────────────────────────────────────

async function getAcceptedAssigneeIds(taskId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT user_id AS userId FROM pm_task_assignees WHERE task_id=@taskId`);
  return result.recordset.map(r => String(r.userId));
}

// ── Task threads ────────────────────────────────────────────────────────────

async function getTaskThreadId(taskId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT conversation_id AS conversationId FROM pm_task_threads WHERE task_id=@taskId`);
  return result.recordset[0]?.conversationId ?? null;
}

/**
 * Creates the task's thread if it doesn't exist yet. Called at task
 * creation time (seeded with the creator + Activity Manager(s)) and
 * defensively any time we're about to sync membership.
 */
async function ensureTaskThread(taskId) {
  const existing = await getTaskThreadId(taskId);
  if (existing) return existing;

  const pool = await getPool();
  const taskResult = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT t.name, t.activity_id AS activityId, t.created_by AS createdBy FROM pm_tasks t WHERE t.task_id=@taskId`);
  const task = taskResult.recordset[0];
  if (!task) return null;

  const managerIds = await resolveActivityManagerIds(task.activityId);
  const seedIds = [...new Set([...(task.createdBy ? [String(task.createdBy)] : []), ...managerIds])];

  let conversationId;
  await withTransaction(async (req) => {
    conversationId = await createSystemConversation(req, {
      subject:   `Task: ${task.name}`,
      createdBy: task.createdBy || managerIds[0],
      convType:  'cc',
    });
    if (seedIds.length) await upsertParticipants(req, conversationId, seedIds, 'to');
    await req()
      .input('taskId', sql.Int, taskId)
      .input('convId', sql.Int, conversationId)
      .query(`INSERT INTO pm_task_threads (task_id, conversation_id) VALUES (@taskId, @convId)`);
  });
  return conversationId;
}

/**
 * Recomputes the task thread's desired membership (accepted assignees +
 * current Activity Manager(s)) and applies additions/removals.
 */
async function syncTaskThreadParticipants(taskId) {
  const pool = await getPool();
  const taskResult = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT activity_id AS activityId FROM pm_tasks t WHERE t.task_id=@taskId`);
  const activityId = taskResult.recordset[0]?.activityId;
  if (!activityId) return;

  const conversationId = await ensureTaskThread(taskId);
  if (!conversationId) return;

  const [assignees, managerIds, current] = await Promise.all([
    getAcceptedAssigneeIds(taskId),
    resolveActivityManagerIds(activityId),
    getActiveParticipantIds(conversationId),
  ]);
  const desired = new Set([...assignees, ...managerIds]);
  const toAdd    = [...desired].filter(id => !current.includes(id));
  const toRemove = current.filter(id => !desired.has(id));

  await withTransaction(async (req) => {
    if (toAdd.length)    await upsertParticipants(req, conversationId, toAdd, 'to');
    if (toRemove.length) await removeParticipantsSoft(req, conversationId, toRemove);
  });
}

// ── Activity threads ─────────────────────────────────────────────────────────

async function getActivityThreadId(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT conversation_id AS conversationId FROM pm_activity_threads WHERE activity_id=@activityId`);
  return result.recordset[0]?.conversationId ?? null;
}

async function ensureActivityThread(activityId) {
  const existing = await getActivityThreadId(activityId);
  if (existing) return existing;

  const pool = await getPool();
  const actResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT name FROM pm_activities WHERE activity_id=@activityId`);
  const activity = actResult.recordset[0];
  if (!activity) return null; // activity itself doesn't exist — nothing to do

  // Always resolves to at least one person: activity members, else the
  // Activity Manager/owner, else the project's Manager(s) — a project is
  // guaranteed to have a Manager from the moment it's created, so this
  // never comes back empty. A brand-new Activity with nobody added yet
  // still gets a real, open-able thread instead of failing.
  const seedIds = await resolveActivityThreadSeedIds(activityId);
  const creatorId = seedIds[0];
  if (!creatorId) return null; // only possible if the project itself has no Manager — shouldn't happen

  let conversationId;
  await withTransaction(async (req) => {
    conversationId = await createSystemConversation(req, {
      subject:   `Activity: ${activity.name}`,
      createdBy: creatorId,
      convType:  'group_thread',
    });
    await upsertParticipants(req, conversationId, seedIds, 'to');
    await req()
      .input('activityId', sql.Int, activityId)
      .input('convId',     sql.Int, conversationId)
      .query(`INSERT INTO pm_activity_threads (activity_id, conversation_id) VALUES (@activityId, @convId)`);
  });
  return conversationId;
}

/**
 * Recomputes the activity thread's desired membership — the FULL activity
 * roster (every pm_activity_members row, any role), falling back to
 * Manager/owner/project-Manager only while the roster is still empty —
 * and applies additions/removals. Always includes everyone actually on
 * the activity; it is not filtered down to Managers or assignees only.
 */
async function syncActivityThreadParticipants(activityId) {
  const conversationId = await ensureActivityThread(activityId);
  if (!conversationId) return;

  const [desiredIds, current] = await Promise.all([
    resolveActivityThreadSeedIds(activityId),
    getActiveParticipantIds(conversationId),
  ]);
  const desired = new Set(desiredIds);
  const toAdd    = [...desired].filter(id => !current.includes(id));
  const toRemove = current.filter(id => !desired.has(id));

  await withTransaction(async (req) => {
    if (toAdd.length)    await upsertParticipants(req, conversationId, toAdd, 'to');
    if (toRemove.length) await removeParticipantsSoft(req, conversationId, toRemove);
  });
}

// ── Event hooks called by taskService / activityService ───────────────────────

/** A task assignment request was accepted — add the user to both threads. */
async function onAssigneeAccepted(taskId, activityId) {
  await ensureTaskThread(taskId);
  await syncTaskThreadParticipants(taskId);
  await syncActivityThreadParticipants(activityId);
}

/** An assignee was removed (declined, or unassigned after acceptance). */
async function onAssigneeRemoved(taskId, activityId) {
  await syncTaskThreadParticipants(taskId);
  await syncActivityThreadParticipants(activityId);
}

/** Activity Manager roster changed (member added/removed/role changed, or owner_id changed). */
async function onActivityManagersChanged(activityId) {
  await syncActivityThreadParticipants(activityId);
  // Every open task under this activity also needs its Manager-participant re-synced.
  const pool = await getPool();
  const tasksResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT task_id AS taskId FROM pm_tasks WHERE activity_id=@activityId AND is_deleted=0`);
  for (const t of tasksResult.recordset) await syncTaskThreadParticipants(t.taskId);
}

module.exports = {
  ensureTaskThread,
  ensureActivityThread,
  getTaskThreadId,
  getActivityThreadId,
  syncTaskThreadParticipants,
  syncActivityThreadParticipants,
  onAssigneeAccepted,
  onAssigneeRemoved,
  onActivityManagersChanged,
};