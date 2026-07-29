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
const { resolveTaskManagerIds, resolveActivityThreadSeedIds } = require('./roleService');

// Column widths the composed names must fit into. Entity names are each
// valid on their own (≤200 chars), but the thread subject/group name is a
// CONCATENATION of up to four of them — which can far exceed these column
// limits and made the INSERT throw "String or binary data would be
// truncated", failing the whole Activity/Task creation it was part of.
const GROUP_NAME_MAX = 150; // comm_groups.group_name  varchar(150)
const SUBJECT_MAX    = 300; // comm_conversations.subject varchar(300)

function clip(str, max) {
  const s = String(str ?? '');
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

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

async function createSystemConversation(reqFn, { subject, createdBy, convType, groupId = null }) {
  const result = await reqFn()
    .input('subject',   sql.NVarChar,        subject)
    .input('createdBy', sql.UniqueIdentifier, createdBy)
    .input('convType',  sql.NVarChar,         convType)
    .input('groupId',   sql.Int,              groupId)
    .query(`
      INSERT INTO comm_conversations (subject, created_by, allow_reply, group_id, conv_type, last_message_at)
      OUTPUT INSERTED.conversation_id
      VALUES (@subject, @createdBy, 1, @groupId, @convType, SYSDATETIMEOFFSET())
    `);
  return result.recordset[0].conversation_id;
}

/**
 * Creates a real comm_groups entry for the activity group chat so it
 * surfaces in the Groups tab (not inbox). Returns { groupId, conversationId }.
 */
async function createGroupAndConversation(reqFn, { groupName, subject, createdBy }) {
  // Insert a comm_groups row — same as user-created groups but flagged as system-managed
  const groupResult = await reqFn()
    .input('groupName',  sql.NVarChar,        groupName)
    .input('createdBy',  sql.UniqueIdentifier, createdBy)
    .query(`
      INSERT INTO comm_groups (group_name, created_by, description)
      OUTPUT INSERTED.group_id
      VALUES (@groupName, @createdBy, 'Auto-managed activity chat group')
    `);
  const groupId = groupResult.recordset[0].group_id;

  // Add creator as first member of the comm_group
  await reqFn()
    .input('groupId', sql.Int,              groupId)
    .input('userId',  sql.UniqueIdentifier, createdBy)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM comm_group_members WHERE group_id=@groupId AND user_id=@userId)
        INSERT INTO comm_group_members (group_id, user_id) VALUES (@groupId, @userId)
    `);

  // Create the group_thread conversation linked to this group
  const conversationId = await createSystemConversation(reqFn, {
    subject,
    createdBy,
    convType: 'group_thread',
    groupId,
  });

  return { groupId, conversationId };
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
  // Fetch task + full hierarchy names for the subject
  const taskResult = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`
      SELECT
        t.name            AS taskName,
        t.activity_id     AS activityId,
        t.created_by      AS createdBy,
        a.name            AS activityName,
        ph.name           AS phaseName,
        pr.name           AS projectName
      FROM pm_tasks       t
      INNER JOIN pm_activities a  ON a.activity_id  = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id     = a.phase_id
      INNER JOIN pm_projects   pr ON pr.project_id   = ph.project_id
      WHERE t.task_id = @taskId
    `);
  const task = taskResult.recordset[0];
  if (!task) return null;

  // Hierarchical subject: Project / Phase / Activity / Task
  const subject = clip(`${task.projectName} / ${task.phaseName} / ${task.activityName} / ${task.taskName}`, SUBJECT_MAX);

  // resolveTaskManagerIds (not resolveActivityManagerIds) — cumulatively
  // includes Phase and Project Managers too, not just the Activity's own
  // explicit Manager. Per the role hierarchy they have authority over this
  // task regardless of whether the Activity has its own Manager set.
  const managerIds = await resolveTaskManagerIds(task.activityId);
  const seedIds = [...new Set([...(task.createdBy ? [String(task.createdBy)] : []), ...managerIds])];

  let conversationId;
  await withTransaction(async (req) => {
    conversationId = await createSystemConversation(req, {
      subject,
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
 * every Manager with authority over it — Activity, Phase, and Project,
 * cumulatively) and applies additions/removals.
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
    resolveTaskManagerIds(activityId),
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
    .query(`
      SELECT t.conversation_id AS conversationId, c.group_id AS groupId
      FROM pm_activity_threads t
      INNER JOIN comm_conversations c ON c.conversation_id = t.conversation_id
      WHERE t.activity_id = @activityId
    `);
  const row = result.recordset[0];
  return row ? { conversationId: row.conversationId, groupId: row.groupId } : null;
}

async function ensureActivityThread(activityId) {
  const existing = await getActivityThreadId(activityId);
  if (existing) return existing;

  const pool = await getPool();
  const actResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT
        a.name          AS activityName,
        ph.name         AS phaseName,
        pr.name         AS projectName
      FROM pm_activities  a
      INNER JOIN pm_phases   ph ON ph.phase_id   = a.phase_id
      INNER JOIN pm_projects pr ON pr.project_id = ph.project_id
      WHERE a.activity_id = @activityId
    `);
  const activity = actResult.recordset[0];
  if (!activity) return null;

  // Group name: "ProjectName / ActivityName" — short and recognisable in the Groups tab
  const groupName = clip(`${activity.projectName} · ${activity.activityName}`, GROUP_NAME_MAX);
  // Conversation subject: full hierarchy for context in thread header
  const subject   = clip(`${activity.projectName} / ${activity.phaseName} / ${activity.activityName}`, SUBJECT_MAX);

  const seedIds   = await resolveActivityThreadSeedIds(activityId);
  const creatorId = seedIds[0];
  if (!creatorId) return null;

  let conversationId;
  await withTransaction(async (req) => {
    // Creates comm_groups row + group_thread conversation — appears in Groups tab
    const { groupId, conversationId: cid } = await createGroupAndConversation(req, {
      groupName,
      subject,
      createdBy: creatorId,
    });
    conversationId = cid;

    // Seed members in both comm_participants (for the conversation) and
    // comm_group_members (so the group shows correctly in the Groups tab)
    for (const uid of seedIds) {
      await req()
        .input('groupId', sql.Int,              groupId)
        .input('userId',  sql.UniqueIdentifier, uid)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM comm_group_members WHERE group_id=@groupId AND user_id=@userId)
            INSERT INTO comm_group_members (group_id, user_id) VALUES (@groupId, @userId)
        `);
    }
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
  let thread = await getActivityThreadId(activityId);
  if (!thread) {
    const convId = await ensureActivityThread(activityId);
    thread = await getActivityThreadId(activityId);
    if (!thread) return;
  }
  const { conversationId, groupId } = thread;

  const [desiredIds, current] = await Promise.all([
    resolveActivityThreadSeedIds(activityId),
    getActiveParticipantIds(conversationId),
  ]);
  const desired  = new Set(desiredIds);
  const toAdd    = [...desired].filter(id => !current.includes(id));
  const toRemove = current.filter(id => !desired.has(id));

  await withTransaction(async (req) => {
    if (toAdd.length)    await upsertParticipants(req, conversationId, toAdd, 'to');
    if (toRemove.length) await removeParticipantsSoft(req, conversationId, toRemove);

    // Keep comm_group_members in sync so the Groups tab shows correct membership.
    // IMPORTANT: sync ALL desired members, not just `toAdd`.
    // A user already in comm_participants (read access) from a previous sync would
    // not be in toAdd and would therefore miss the comm_group_members insert, leaving
    // them able to READ but not WRITE (userCanReply checks comm_group_members).
    if (groupId) {
      for (const uid of desiredIds) {
        await req()
          .input('groupId', sql.Int,              groupId)
          .input('userId',  sql.UniqueIdentifier, uid)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM comm_group_members WHERE group_id=@groupId AND user_id=@userId)
              INSERT INTO comm_group_members (group_id, user_id) VALUES (@groupId, @userId)
          `);
      }
      for (const uid of toRemove) {
        await req()
          .input('groupId', sql.Int,              groupId)
          .input('userId',  sql.UniqueIdentifier, uid)
          .query(`DELETE FROM comm_group_members WHERE group_id=@groupId AND user_id=@userId`);
      }
    }
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

// ── Deactivate / reactivate: keep an Activity's group chat in step with its
// (or an ancestor's) active state ─────────────────────────────────────────
//
// Written directly against comm_groups rather than routed through
// messageService/groupService's disableGroup/enableGroup — those are
// user-initiated admin actions gated by assertGroupAdmin, and this is a
// system-triggered side effect of a PM write with no admin in the loop
// (same reasoning as upsertParticipants above being duplicated rather than
// imported). `disabled_by` is left NULL so an admin's own manual disable
// (which does set disabled_by) is visibly distinguishable from this.
//
// Guarded with `AND is_disabled <> @disabled` so re-running this (e.g.
// reactivating a Project whose Activity chat an admin had already manually
// re-enabled) is a no-op rather than clobbering unrelated state.
async function setActivityThreadDisabled(activityId, disabled) {
  const thread = await getActivityThreadId(activityId);
  if (!thread?.groupId) return; // no thread yet — nothing to toggle
  const pool = await getPool();
  await pool.request()
    .input('groupId',  sql.Int, thread.groupId)
    .input('disabled', sql.Bit, disabled ? 1 : 0)
    .query(`
      UPDATE comm_groups
      SET is_disabled = @disabled,
          disabled_at = CASE WHEN @disabled = 1 THEN SYSDATETIMEOFFSET() ELSE NULL END,
          disabled_by = NULL
      WHERE group_id = @groupId AND is_disabled <> @disabled
    `);
}

/** Every Activity under a Phase — used when the Phase itself is (de)activated. */
async function setActivityThreadsDisabledForPhase(phaseId, disabled) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT activity_id AS activityId FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);
  for (const r of result.recordset) await setActivityThreadDisabled(r.activityId, disabled);
}

/** Every Activity under a Project — used when the Project itself is (de)activated. */
async function setActivityThreadsDisabledForProject(projectId, disabled) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT a.activity_id AS activityId
      FROM pm_activities a
      INNER JOIN pm_phases ph ON ph.phase_id = a.phase_id
      WHERE ph.project_id = @projectId AND a.is_deleted = 0 AND ph.is_deleted = 0
    `);
  for (const r of result.recordset) await setActivityThreadDisabled(r.activityId, disabled);
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
  setActivityThreadDisabled,
  setActivityThreadsDisabledForPhase,
  setActivityThreadsDisabledForProject,
};