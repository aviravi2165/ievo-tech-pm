'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { blockIfNeeded, isBlocked, isInactive } = require('./dependencyService');
const { deriveStatus, getActivityStats } = require('./progressService');
const { getActivityDelayDays, getOverdueDays } = require('./delayService');
const pmChatService = require('./pmChatService');
const { getEffectiveActivityRole } = require('./roleService');

function parseIdList(val) {
  if (!val) return [];
  return String(val).split(',').filter(Boolean).map(Number);
}

// ── Fetch activities ──────────────────────────────────────────────────────────

// userId — the REQUESTING user, used to compute their effective role per
// activity (explicit activity-level row, else inherited from phase/project
// role; see roleService). Same reasoning as phaseService.getPhasesForProject.
async function getActivitiesForPhase(phaseId, userId, isAdmin = false) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT a.activity_id   AS activityId,
             a.phase_id      AS phaseId,
             a.name, a.description,
             a.display_order AS displayOrder,
             a.planned_start AS plannedStart,
             a.planned_end   AS plannedEnd,
             a.status, a.status_override AS statusOverride,
             a.created_at    AS createdAt,
             parentProj.project_id AS projectId,
             parentPh.status AS parentPhaseStatus,
             a.is_active AS ownIsActive, parentPh.is_active AS parentPhaseActive,
             parentProj.is_active AS parentProjectActive,
             pat.conversation_id AS chatConversationId,
             -- Unread dot for the row's own chat icon — deliberately
             -- separate from the global Inbox/Groups unread badge (which
             -- excludes PM Activity/Task threads entirely, see
             -- messageService.getUnreadCount's comment) and deliberately
             -- INCLUDES system messages (sender_id IS NULL — e.g. the
             -- Activity Insights cron post), unlike the global badge which
             -- excludes those too. This is a per-row "something changed in
             -- this specific chat" signal, not the browsing-noise concern
             -- that exclusion was about.
             CAST(CASE WHEN pat.conversation_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM comm_messages cm
               LEFT JOIN comm_participants cp ON cp.conversation_id = cm.conversation_id AND cp.user_id = @userId
               WHERE cm.conversation_id = pat.conversation_id
                 AND cm.is_deleted = 0
                 AND (cm.sender_id IS NULL OR cm.sender_id <> @userId)
                 AND cm.sent_at > COALESCE(cp.joined_at, '1753-01-01')
                 AND NOT EXISTS (SELECT 1 FROM comm_read_receipts rr WHERE rr.message_id = cm.message_id AND rr.user_id = @userId)
             ) THEN 1 ELSE 0 END AS BIT) AS hasUnreadChat,
             -- Raw "past its own planned_end" only — status exclusion is
             -- applied in JS below, against the DERIVED status, not this
             -- column's raw a.status. pm_activities.status is never
             -- reliably written back to 'Completed' (deriveStatus computes
             -- it fresh from progress on every read, below), so gating here
             -- against the raw column let isOverdue stay true forever on an
             -- Activity that's actually 100% done and reads "Completed" —
             -- exactly the "why is a Completed row still Overdue" report.
             CASE WHEN a.planned_end < CAST(GETDATE() AS DATE)
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS plannedEndPassed,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS ownerName,
             (
               SELECT STRING_AGG(CAST(depends_on_activity_id AS VARCHAR(20)), ',')
               FROM pm_activity_deps WHERE activity_id = a.activity_id
             ) AS dependsOn,
             -- Activity member count for display
             (
               SELECT COUNT(*) FROM pm_activity_members WHERE activity_id = a.activity_id
             ) AS memberCount,
             -- Activity Manager names, for a quick "who to ping" chip
             (
               SELECT STRING_AGG(COALESCE(NULLIF(TRIM(CONCAT(mu.first_name,' ',mu.last_name)),''), mu.email), ', ')
               FROM pm_activity_members mgr
               INNER JOIN auth_users mu ON mu.user_id = mgr.user_id
               WHERE mgr.activity_id = a.activity_id AND mgr.role = 'Manager'
             ) AS managerNames
      FROM pm_activities a
      LEFT JOIN auth_users u ON u.user_id = a.owner_id
      LEFT JOIN pm_activity_threads pat ON pat.activity_id = a.activity_id
      INNER JOIN pm_phases parentPh ON parentPh.phase_id = a.phase_id
      INNER JOIN pm_projects parentProj ON parentProj.project_id = parentPh.project_id
      WHERE a.phase_id = @phaseId AND a.is_deleted = 0
      ORDER BY a.is_active DESC, a.display_order
    `);

  const rows = result.recordset.map(r => ({ ...r, dependsOn: parseIdList(r.dependsOn) }));
  // PERF: this used to be a sequential `for...await` loop, each row waiting
  // on the previous one, and each row separately called
  // getActivityProgress/getActivityHasActiveWork/getActivityHasTasks — three
  // round trips independently re-reading the exact same pm_tasks rows.
  // getActivityStats collapses those three into one query; Promise.all
  // across rows runs every activity's work concurrently instead of
  // serialized — see projectService.listProjects's identical PERF note for
  // why this was the slowest part of loading a Phase's activity list.
  await Promise.all(rows.map(async (act) => {
    const stats = await getActivityStats(act.activityId);
    act.progress = stats.progress;
    if (act.progress >= 100 && act.status === 'Blocked') {
      await pool.request()
        .input('activityId', sql.Int, act.activityId)
        .query(`UPDATE pm_activities SET status = 'To Do' WHERE activity_id = @activityId AND status = 'Blocked'`);
      act.status = 'To Do';
    }
    act.status = deriveStatus(act.progress, act.status, stats.hasActiveWork);
    // Cascade blocking: an Activity under a Blocked Phase reads as Blocked
    // too, until the Phase's own dependency resolves — reflected at read
    // time rather than writing every descendant row.
    if (act.status !== 'Completed' && act.parentPhaseStatus === 'Blocked') act.status = 'Blocked';
    delete act.parentPhaseStatus;
    // Cascade: an Activity under an inactive Phase OR Project reads as
    // inactive too (checks the full ancestor chain, not just the immediate
    // parent's own column — a deactivated Project never touches
    // pm_phases.is_active/pm_activities.is_active, so skipping the
    // grandparent here would leave everything under it looking active).
    act.isActive = act.ownIsActive !== false && act.parentPhaseActive !== false && act.parentProjectActive !== false;
    delete act.ownIsActive; delete act.parentPhaseActive; delete act.parentProjectActive;
    // Same "Completed" gate delayDays already uses, now applied to isOverdue
    // too — both facts go silent together against the same derived status.
    // Also gated on actually having a task underneath — an Activity with
    // nothing in it yet isn't "behind schedule" just because its planned_end
    // passed. isOverdue stays date-gated (a real "behind schedule" fact);
    // emptyState is NOT date-gated — "nothing here yet" is true regardless
    // of whether the date has passed, so the frontend can show a quiet "no
    // tasks yet" note immediately rather than only once it's also overdue.
    act.isOverdue = Boolean(act.plannedEndPassed) && act.status !== 'Completed' && stats.hasTasks;
    act.overdueDays = act.isOverdue ? getOverdueDays(act.plannedEnd) : 0;
    act.emptyState = stats.hasTasks ? null : 'noTasks';
    delete act.plannedEndPassed;
    // delayDays/myRole are independent of progress/hasTasks/hasActiveWork
    // above — run them concurrently rather than after one another.
    const [delayDays, roleResult] = await Promise.all([
      act.status === 'Completed' ? Promise.resolve(0) : getActivityDelayDays(act.activityId, act.plannedEnd),
      userId ? getEffectiveActivityRole(userId, act.activityId, isAdmin) : Promise.resolve(null),
    ]);
    act.delayDays = delayDays;
    act.myRole = roleResult ? roleResult.role : null;
    // Real status-history tracking for Timeline segmented bars — see
    // auditService.recordStatusIfChanged's comment for why this lives here
    // (on every read) rather than only on direct write actions.
    audit.recordStatusIfChanged('activity', act.activityId, act.projectId, act.status).catch(() => {});
  }));
  return rows;
}

// ── Activity members ──────────────────────────────────────────────────────────

async function getActivityMembers(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT am.user_id AS userId,
             am.role AS role,
             am.added_at AS addedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
             u.email
      FROM pm_activity_members am
      INNER JOIN auth_users u ON u.user_id = am.user_id
      WHERE am.activity_id = @activityId
      ORDER BY CASE am.role WHEN 'Manager' THEN 0 WHEN 'Employee' THEN 1 ELSE 2 END, u.first_name, u.last_name
    `);
  return result.recordset;
}

const ACTIVITY_MEMBER_ROLES = ['Manager', 'Employee', 'Viewer'];

async function addActivityMember(activityId, targetUserId, role, actorUserId, projectId) {
  const finalRole = ACTIVITY_MEMBER_ROLES.includes(role) ? role : 'Employee';
  const pool = await getPool();
  await pool.request()
    .input('activityId', sql.Int,              activityId)
    .input('userId',     sql.UniqueIdentifier, targetUserId)
    .input('role',       sql.NVarChar(20),     finalRole)
    .query(`
      IF EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@userId)
        UPDATE pm_activity_members SET role=@role WHERE activity_id=@activityId AND user_id=@userId
      ELSE
        INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @userId, @role)
    `);

  // Ensure they're a project member too (as a baseline Member, never downgrades an existing role)
  const phResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT ph.project_id FROM pm_activities a INNER JOIN pm_phases ph ON ph.phase_id=a.phase_id WHERE a.activity_id=@activityId`);
  const pid = projectId || phResult.recordset[0]?.project_id;
  if (pid) {
    await pool.request()
      .input('projectId', sql.Int,              pid)
      .input('userId',    sql.UniqueIdentifier, targetUserId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_members WHERE project_id=@projectId AND user_id=@userId)
          INSERT INTO pm_members (project_id, user_id, role) VALUES (@projectId, @userId, 'Member')
      `);
  }
  await audit.log({ entityType:'activity', entityId:activityId, projectId:pid, userId:actorUserId, action:'member_added', fieldChanged:'role', newValue:finalRole });

  if (finalRole === 'Manager') await pmChatService.onActivityManagersChanged(activityId);
  else await pmChatService.syncActivityThreadParticipants(activityId);
}

async function updateActivityMemberRole(activityId, targetUserId, role, actorUserId, projectId) {
  if (!ACTIVITY_MEMBER_ROLES.includes(role)) { const e = new Error('Invalid role'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  const updateResult = await pool.request()
    .input('activityId', sql.Int,              activityId)
    .input('userId',     sql.UniqueIdentifier, targetUserId)
    .input('role',       sql.NVarChar(20),     role)
    .query(`UPDATE pm_activity_members SET role=@role WHERE activity_id=@activityId AND user_id=@userId`);
  if (!updateResult.rowsAffected[0]) { const e = new Error('Activity member not found'); e.statusCode = 404; throw e; }

  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId:actorUserId, action:'member_role_changed', fieldChanged:'role', newValue:role });
  await pmChatService.onActivityManagersChanged(activityId);
}

async function removeActivityMember(activityId, targetUserId, actorUserId, projectId) {
  // Same reasoning as projectService.removeMember/phaseMemberService.removePhaseMember —
  // self-removal is admin/other-Manager-only, not self-service.
  if (String(targetUserId) === String(actorUserId)) {
    const e = new Error('You cannot remove yourself from an activity — ask an admin or another Manager.');
    e.statusCode = 403; throw e;
  }
  const pool = await getPool();

  // Cascade: task access is assignee-based, not roster-based (see
  // taskService — a task's Manager-or-assignee gets in regardless of
  // activity membership). Leaving their assignments behind would let a
  // removed Activity member keep working, and keep chat access to, tasks
  // under this activity even though they no longer belong here.
  await pool.request()
    .input('activityId', sql.Int,              activityId)
    .input('userId',     sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE r FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks t ON t.task_id = r.task_id
      WHERE t.activity_id=@activityId AND r.assignee_id=@userId
    `);
  await pool.request()
    .input('activityId', sql.Int,              activityId)
    .input('userId',     sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE ta FROM pm_task_assignees ta
      INNER JOIN pm_tasks t ON t.task_id = ta.task_id
      WHERE t.activity_id=@activityId AND ta.user_id=@userId
    `);

  await pool.request()
    .input('activityId', sql.Int,              activityId)
    .input('userId',     sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@userId`);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId:actorUserId, action:'member_removed', oldValue:targetUserId });
  // Resyncs the activity's group chat AND every task thread under it —
  // now correctly drops them from any task chat too, since their assignee
  // rows are already gone by the time this runs.
  await pmChatService.onActivityManagersChanged(activityId);
}

// ── Create activity (optionally seed initial activity members) ─────────────────

async function createActivity(phaseId, projectId, userId, body) {
  const { name, description, plannedStart, plannedEnd, ownerId, displayOrder, memberIds = [] } = body;
  if (!name?.trim()) { const e = new Error('Activity name required'); e.statusCode = 400; throw e; }
  if (name.trim().length > 200) { const e = new Error('Activity name must be 200 characters or fewer'); e.statusCode = 400; throw e; }

  if (await isBlocked('phase', phaseId)) {
    const e = new Error('This Phase is blocked by an unresolved dependency — resolve it before adding activities.');
    e.statusCode = 409; throw e;
  }
  if (await isInactive('phase', phaseId) || await isInactive('project', projectId)) {
    const e = new Error('This Phase is inactive — reactivate it before adding activities.');
    e.statusCode = 409; throw e;
  }

  if (plannedStart && plannedEnd && new Date(plannedEnd) < new Date(plannedStart)) {
    const e = new Error("Activity end date can't be before its start date."); e.statusCode = 400; throw e;
  }

  const pool = await getPool();

  // An Activity can't be planned to start before its own Phase — but it
  // CAN be planned (or run) past the Phase's planned_end: that's a real
  // schedule delay, not an invalid input, and it's exactly what
  // delayService.getPhaseDelayDays surfaces (it compares each Activity's
  // planned_end against the Phase's own and bubbles up the overrun as
  // delayDays) rather than something to reject at write time.
  if (plannedStart) {
    const phaseResult = await pool.request()
      .input('phaseId', sql.Int, phaseId)
      .query(`SELECT planned_start AS plannedStart FROM pm_phases WHERE phase_id=@phaseId`);
    const phaseStart = phaseResult.recordset[0]?.plannedStart;
    if (phaseStart && new Date(plannedStart) < new Date(phaseStart)) {
      const e = new Error("Activity start date can't be before its Phase's planned start date.");
      e.statusCode = 400; throw e;
    }
  }

  let row;

  await withTransaction(async (req) => {
    const result = await req()
      .input('phaseId',      sql.Int,              phaseId)
      .input('name',         sql.NVarChar(200),    name.trim())
      .input('description',  sql.NVarChar(sql.MAX),description || null)
      .input('plannedStart', sql.Date,             plannedStart || null)
      .input('plannedEnd',   sql.Date,             plannedEnd   || null)
      .input('ownerId',      sql.UniqueIdentifier, ownerId      || null)
      .input('displayOrder', sql.Int,              displayOrder ?? null)
      .query(`
        INSERT INTO pm_activities (phase_id, name, description, planned_start, planned_end, owner_id, display_order)
        OUTPUT INSERTED.activity_id AS activityId, INSERTED.name, INSERTED.status
        VALUES (
          @phaseId, @name, @description, @plannedStart, @plannedEnd, @ownerId,
          COALESCE(@displayOrder, (SELECT COALESCE(MAX(display_order),0)+10 FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0))
        )
      `);
    row = result.recordset[0];

    // The chosen owner (if any) becomes the activity's first Manager.
    if (ownerId) {
      await req()
        .input('activityId', sql.Int,              row.activityId)
        .input('uid',        sql.UniqueIdentifier, ownerId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@uid)
            INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @uid, 'Manager')
        `);
    }

    // Seed additional activity members (default role: Employee).
    // BUG: this used to unconditionally insert an explicit 'Employee' row
    // for every plain member ID (one with no {role} chosen) — but per
    // roleService's inheritance rule, an explicit activity-level row ALWAYS
    // wins over an inherited one from Phase/Project, regardless of rank.
    // So adding someone who's already a Project/Phase Manager as a plain
    // activity member here silently downgraded them to Employee on this
    // one Activity. Same fix as taskService.acceptAssignmentRequest: only
    // seed the default 'Employee' row when the member has no better access
    // already inherited from Phase/Project; an EXPLICITLY chosen role
    // (raw is an object with a real {role}) is a deliberate choice and is
    // always honored as-is.
    for (const raw of [...new Set(memberIds)]) {
      const uid = typeof raw === 'object' ? raw.userId : raw;
      const explicitRole = (typeof raw === 'object' && ACTIVITY_MEMBER_ROLES.includes(raw.role)) ? raw.role : null;
      if (!uid || String(uid) === String(ownerId)) continue; // owner already seeded as Manager above

      let role = explicitRole || 'Employee';
      if (!explicitRole) {
        const inherited = await req()
          .input('checkUid',   sql.UniqueIdentifier, uid)
          .input('phaseId2',   sql.Int,              phaseId)
          .input('projectId2', sql.Int,              projectId)
          .query(`
            SELECT pm2.role AS phaseRole, pm.role AS projectRole
            FROM (SELECT 1 AS x) dummy
            LEFT JOIN pm_phase_members pm2 ON pm2.phase_id=@phaseId2 AND pm2.user_id=@checkUid
            LEFT JOIN pm_members       pm  ON pm.project_id=@projectId2 AND pm.user_id=@checkUid
          `);
        const inheritedRole = inherited.recordset[0]?.phaseRole || inherited.recordset[0]?.projectRole || null;
        if (inheritedRole && inheritedRole !== 'Viewer') continue; // already has Employee-or-above via inheritance — don't downgrade
      }

      await req()
        .input('activityId', sql.Int,              row.activityId)
        .input('uid',        sql.UniqueIdentifier, uid)
        .input('role',       sql.NVarChar(20),     role)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@uid)
            INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @uid, @role)
        `);
    }
  });

  await audit.log({ entityType:'activity', entityId:row.activityId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });

  // Seed the Activity chat thread now that Managers exist (safe no-op if none yet).
  await pmChatService.ensureActivityThread(row.activityId);
  await pmChatService.syncActivityThreadParticipants(row.activityId);

  return row;
}

// ── Update / delete activity ──────────────────────────────────────────────────

const ACTIVITY_FIELD_TYPES = {
  name:          sql.NVarChar(200),
  description:   sql.NVarChar(sql.MAX),
  planned_start: sql.Date,
  planned_end:   sql.Date,
  owner_id:      sql.UniqueIdentifier,
  display_order: sql.Int,
};

async function updateActivity(activityId, projectId, userId, body) {
  if (await isInactive('activity', activityId) || await isInactive('project', projectId)) {
    const e = new Error('This Activity is inactive — reactivate it before making changes.');
    e.statusCode = 409; throw e;
  }
  if (body.plannedStart !== undefined && body.plannedStart) {
    const pool0 = await getPool();
    const phaseResult = await pool0.request()
      .input('activityId', sql.Int, activityId)
      .query(`SELECT ph.planned_start AS plannedStart FROM pm_activities a INNER JOIN pm_phases ph ON ph.phase_id=a.phase_id WHERE a.activity_id=@activityId`);
    const phaseStart = phaseResult.recordset[0]?.plannedStart;
    if (phaseStart && new Date(body.plannedStart) < new Date(phaseStart)) {
      const e = new Error("Activity start date can't be before its Phase's planned start date.");
      e.statusCode = 400; throw e;
    }
  }
  if (body.name !== undefined) {
    if (!body.name.trim()) { const e = new Error('Activity name required'); e.statusCode = 400; throw e; }
    if (body.name.trim().length > 200) { const e = new Error('Activity name must be 200 characters or fewer'); e.statusCode = 400; throw e; }
  }
  if (body.plannedStart !== undefined || body.plannedEnd !== undefined) {
    const pool1 = await getPool();
    const cur = await pool1.request().input('activityId', sql.Int, activityId)
      .query(`SELECT planned_start AS plannedStart, planned_end AS plannedEnd FROM pm_activities WHERE activity_id=@activityId`);
    const row0 = cur.recordset[0] || {};
    const effStart = body.plannedStart !== undefined ? body.plannedStart : row0.plannedStart;
    const effEnd   = body.plannedEnd   !== undefined ? body.plannedEnd   : row0.plannedEnd;
    if (effStart && effEnd && new Date(effEnd) < new Date(effStart)) {
      const e = new Error("Activity end date can't be before its start date."); e.statusCode = 400; throw e;
    }
  }
  const fields = {};
  if (body.name         !== undefined) fields.name          = body.name.trim();
  if (body.description  !== undefined) fields.description   = body.description;
  if (body.plannedStart !== undefined) fields.planned_start = body.plannedStart;
  if (body.plannedEnd   !== undefined) fields.planned_end   = body.plannedEnd;
  if (body.ownerId      !== undefined) fields.owner_id      = body.ownerId;
  if (body.displayOrder !== undefined) fields.display_order = body.displayOrder;
  const keys = Object.keys(fields);
  if (!keys.length) return {};

  const pool = await getPool();
  const req  = pool.request().input('activityId', sql.Int, activityId);
  const set  = keys.map((k, i) => { const ph = `f${i}`; req.input(ph, ACTIVITY_FIELD_TYPES[k], fields[k]); return `${k}=@${ph}`; }).join(', ');
  await req.query(`UPDATE pm_activities SET ${set} WHERE activity_id=@activityId`);

  for (const key of keys) await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });

  // A new owner is folded into pm_activity_members as a Manager, keeping
  // the legacy owner_id field and the role-based roster in step.
  if (body.ownerId !== undefined && body.ownerId) {
    await pool.request()
      .input('activityId', sql.Int,              activityId)
      .input('uid',        sql.UniqueIdentifier, body.ownerId)
      .query(`
        IF EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@uid)
          UPDATE pm_activity_members SET role='Manager' WHERE activity_id=@activityId AND user_id=@uid
        ELSE
          INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @uid, 'Manager')
      `);
    await pmChatService.onActivityManagersChanged(activityId);
  }

  return { activityId, ...fields };
}

// Delete only when empty (no tasks) — otherwise deactivate, preserving data
// underneath instead of orphaning it from view.
async function deleteActivity(activityId, projectId, userId) {
  const pool = await getPool();
  const childResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_tasks WHERE activity_id=@activityId AND is_deleted=0`);

  if (childResult.recordset[0].cnt > 0) {
    await pool.request()
      .input('activityId', sql.Int, activityId)
      .query(`UPDATE pm_activities SET is_active=0 WHERE activity_id=@activityId`);
    await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'deactivated' });
    await pmChatService.setActivityThreadDisabled(activityId, true);
    return { action: 'deactivated' };
  }

  await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`UPDATE pm_activities SET is_deleted=1 WHERE activity_id=@activityId`);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'deleted' });
  // Thread history is preserved (comm_conversations rows are never deleted here) —
  // only the pm_* rows are marked deleted, matching how everything else in this
  // module soft-deletes rather than destroying data.
  return { action: 'deleted' };
}

async function reactivateActivity(activityId, projectId, userId) {
  const pool = await getPool();

  // The Reactivate button reads as available whenever the Activity's
  // CASCADED isActive is false (see getActivitiesForPhase's isActive
  // computation above), which also fires when only an ancestor Phase/
  // Project is inactive and this Activity's own row was never touched.
  // Flipping pm_activities.is_active=1 in that case is a silent no-op —
  // the Activity reads inactive again on the very next fetch because the
  // ancestor still is — so tell the user where to actually act instead of
  // letting the click appear to do nothing.
  if (!(await isInactive('activity', activityId))) {
    const phaseResult = await pool.request()
      .input('activityId', sql.Int, activityId)
      .query(`SELECT phase_id AS phaseId FROM pm_activities WHERE activity_id=@activityId`);
    const phaseId = phaseResult.recordset[0]?.phaseId;
    if (await isInactive('phase', phaseId)) {
      const e = new Error("This Activity is inactive because its Phase is inactive — reactivate the Phase instead.");
      e.statusCode = 409; throw e;
    }
    if (await isInactive('project', projectId)) {
      const e = new Error("This Activity is inactive because its Project is inactive — reactivate the Project instead.");
      e.statusCode = 409; throw e;
    }
  }

  await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`UPDATE pm_activities SET is_active=1 WHERE activity_id=@activityId`);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'reactivated' });
  await pmChatService.setActivityThreadDisabled(activityId, false);
}

// Permanent removal — only reachable once the Activity is already
// deactivated AND already empty of live Tasks. Does not cascade
// is_deleted=1 down to Tasks in one shot — see phaseService.hardDeletePhase's
// comment for why: that bypasses resolveUnblocked and can leave anything
// depending on a Task permanently Blocked. Each Task must be individually
// hard-deleted first (via taskService.hardDeleteTask, which correctly runs
// resolveUnblocked before flipping is_deleted).
async function hardDeleteActivity(activityId, projectId, userId) {
  const pool = await getPool();
  const activityResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT a.is_active AS ownActive, ph.is_active AS phaseActive, pr.is_active AS projectActive
      FROM pm_activities a
      INNER JOIN pm_phases   ph ON ph.phase_id   = a.phase_id
      INNER JOIN pm_projects pr ON pr.project_id = ph.project_id
      WHERE a.activity_id=@activityId AND a.is_deleted=0
    `);
  const activity = activityResult.recordset[0];
  if (!activity) { const e = new Error('Activity not found'); e.statusCode = 404; throw e; }
  // Same cascaded-vs-own mismatch as taskService.hardDeleteTask — an
  // Activity reading Inactive in the list because its Phase/Project is
  // inactive, even though the Activity's own row was never explicitly
  // deactivated, should satisfy this guard too.
  const isActive = activity.ownActive !== false && activity.phaseActive !== false && activity.projectActive !== false;
  if (isActive) {
    const e = new Error('Deactivate this Activity before permanently deleting it.');
    e.statusCode = 409; throw e;
  }

  const childResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_tasks WHERE activity_id=@activityId AND is_deleted=0`);
  if (childResult.recordset[0].cnt > 0) {
    const e = new Error('Permanently delete every Task under this Activity first.');
    e.statusCode = 409; throw e;
  }

  await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`UPDATE pm_activities SET is_deleted=1 WHERE activity_id=@activityId`);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'hard_deleted' });
}

// ── Activity dependencies ─────────────────────────────────────────────────────

async function addActivityDep(activityId, dependsOnId, projectId, userId) {
  // Dependencies are same-level only: an activity may only depend on another
  // activity within its own Phase (mirrors what the UI's dropdown already
  // offers, enforced here so the API can't be used to link across Phases).
  const pool = await getPool();
  const scopeResult = await pool.request()
    .input('activityId',  sql.Int, activityId)
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`
      SELECT
        (SELECT phase_id FROM pm_activities WHERE activity_id=@activityId)  AS phaseId,
        (SELECT phase_id FROM pm_activities WHERE activity_id=@dependsOnId) AS depPhaseId
    `);
  const { phaseId, depPhaseId } = scopeResult.recordset[0] || {};
  if (!depPhaseId) { const e = new Error('Dependency activity not found'); e.statusCode = 404; throw e; }
  if (phaseId !== depPhaseId) {
    const e = new Error('Activities can only depend on other activities within the same phase'); e.statusCode = 400; throw e;
  }

  await withTransaction(async (req) => {
    await req()
      .input('activityId',  sql.Int, activityId)
      .input('dependsOnId', sql.Int, dependsOnId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_activity_deps WHERE activity_id=@activityId AND depends_on_activity_id=@dependsOnId)
          INSERT INTO pm_activity_deps (activity_id, depends_on_activity_id) VALUES (@activityId, @dependsOnId)
      `);
    await blockIfNeeded(req, 'activity', activityId, dependsOnId);
  });
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'dependency_added', newValue:dependsOnId });
}

async function removeActivityDep(activityId, dependsOnId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('activityId',  sql.Int, activityId)
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`DELETE FROM pm_activity_deps WHERE activity_id=@activityId AND depends_on_activity_id=@dependsOnId`);

  // Re-evaluate: if no remaining unresolved deps, unblock the activity
  await withTransaction(async (req) => {
    const unresolved = await req()
      .input('activityId', sql.Int, activityId)
      .query(`
        SELECT 1 AS x FROM pm_activity_deps d
        INNER JOIN pm_activities e ON e.activity_id = d.depends_on_activity_id
        WHERE d.activity_id = @activityId AND e.status <> 'Completed' AND e.is_deleted = 0
      `);
    if (!unresolved.recordset.length) {
      await req()
        .input('activityId', sql.Int, activityId)
        .query(`UPDATE pm_activities SET status = 'To Do' WHERE activity_id = @activityId AND status = 'Blocked'`);
    }
  });

  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'dependency_removed', oldValue:dependsOnId });
}

// ── Chat thread lookup (used by activityRoutes GET /:id/chat) ──────────────────

async function getOrCreateActivityThread(activityId) {
  // Returns { conversationId, groupId } — groupId is used by ChatButton
  // to open the Groups tab to the correct group, not the inbox.
  //
  // Always ensure + sync on every call, not just at creation time.
  // This covers the common case where the thread already exists but a
  // new activity member was added after it was first seeded — they would
  // be in pm_activity_members but not yet in comm_participants or
  // comm_group_members, causing assertConversationParticipant (called by
  // messageService.getThread) to reject them with a 403.
  await pmChatService.ensureActivityThread(activityId);
  await pmChatService.syncActivityThreadParticipants(activityId);
  const thread = await pmChatService.getActivityThreadId(activityId);
  return thread || { conversationId: null, groupId: null };
}

// ── Status history — Timeline segmented bars ────────────────────────────────
// Real tracking (see auditService.recordStatusIfChanged, called from
// getActivitiesForPhase above on every read, and from taskService after
// every cascading recompute) — not an approximation from child tasks.
async function getActivityStatusHistory(activityId) {
  return audit.getStatusHistory('activity', activityId);
}

module.exports = {
  ACTIVITY_MEMBER_ROLES,
  getOrCreateActivityThread,
  getActivitiesForPhase,
  getActivityMembers,
  addActivityMember,
  updateActivityMemberRole,
  removeActivityMember,
  createActivity,
  updateActivity,
  deleteActivity,
  reactivateActivity,
  hardDeleteActivity,
  addActivityDep,
  removeActivityDep,
  getActivityStatusHistory,
};