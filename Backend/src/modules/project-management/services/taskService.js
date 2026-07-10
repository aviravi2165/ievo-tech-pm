'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded, isBlocked, isInactive } = require('./dependencyService');
const { getActivityProgress, getPhaseProgress } = require('./progressService');
const { getEffectiveActivityRole } = require('./roleService');
const { broadcastStatusChanged, broadcastUnblocked, broadcastAssignmentRequest, broadcastProgressUpdated } = require('../socket/socketHandler');
const pmChatService = require('./pmChatService');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIdList(val) {
  if (!val) return [];
  return String(val).split(',').filter(Boolean).map(Number);
}

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// Task statuses: To Do / Ongoing / Complete / Blocked
// (In Progress → Ongoing, Done → Complete, In Review removed)
const DONE_STATUS = 'Complete';

// ── Fetch tasks ───────────────────────────────────────────────────────────────

async function getTasksForActivity(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT t.task_id       AS taskId,
             t.activity_id  AS activityId,
             t.name, t.description, t.priority, t.status,
             t.due_date      AS dueDate,
             t.estimated_hours AS estimatedHours,
             t.created_at   AS createdAt,
             pa.status AS parentActivityStatus, pph.status AS parentPhaseStatus,
             t.is_active AS ownIsActive, pa.is_active AS parentActivityActive, pph.is_active AS parentPhaseActive,
             pproj.is_active AS parentProjectActive,
             CASE WHEN t.due_date < CAST(GETDATE() AS DATE) AND t.status <> 'Complete'
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isOverdue,
             -- Accepted assignees (confirmed participants)
             (
               SELECT CAST(r.assignee_id AS NVARCHAR(36)) AS userId,
                      COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
                      r.status AS requestStatus
               FROM pm_task_assignment_requests r
               LEFT JOIN auth_users u ON u.user_id = r.assignee_id
               WHERE r.task_id = t.task_id AND r.status = 'Accepted'
               FOR JSON PATH
             ) AS assignees,
             -- All requests (for showing pending/declined badges)
             (
               SELECT CAST(r.assignee_id AS NVARCHAR(36)) AS userId,
                      COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
                      r.status AS requestStatus,
                      r.request_id AS requestId
               FROM pm_task_assignment_requests r
               LEFT JOIN auth_users u ON u.user_id = r.assignee_id
               WHERE r.task_id = t.task_id
               FOR JSON PATH
             ) AS allRequests,
             (
               SELECT STRING_AGG(CAST(depends_on_task_id AS VARCHAR(20)), ',')
               FROM pm_task_deps WHERE task_id = t.task_id
             ) AS dependsOn,
             -- Whether a chat thread already exists for this task (frontend uses this
             -- to decide whether to show "Open Chat" vs "Chat available once assigned")
             (
               SELECT CAST(CASE WHEN EXISTS (SELECT 1 FROM pm_task_threads WHERE task_id = t.task_id) THEN 1 ELSE 0 END AS BIT)
             ) AS hasThread
      FROM pm_tasks t
      INNER JOIN pm_activities pa ON pa.activity_id = t.activity_id
      INNER JOIN pm_phases     pph ON pph.phase_id  = pa.phase_id
      INNER JOIN pm_projects   pproj ON pproj.project_id = pph.project_id
      WHERE t.activity_id = @activityId AND t.is_deleted = 0
      ORDER BY t.created_at
    `);

  return result.recordset.map(r => {
    // Cascade blocking: a task under a Blocked Activity or Phase reads as
    // Blocked too, until that ancestor's own dependency resolves — same rule
    // as blockIfNeeded/resolveUnblocked apply at their own level, just
    // reflected downward at read time instead of writing every descendant row.
    const cascadeBlocked = r.status !== 'Complete'
      && (r.parentActivityStatus === 'Blocked' || r.parentPhaseStatus === 'Blocked');
    // Cascade: a task under an inactive Activity, Phase, or Project (or
    // itself deactivated) reads as inactive too, frozen until reactivated.
    const cascadeInactive = r.ownIsActive === false
      || r.parentActivityActive === false
      || r.parentPhaseActive === false
      || r.parentProjectActive === false;
    const { parentActivityStatus, parentPhaseStatus, ownIsActive, parentActivityActive, parentPhaseActive, parentProjectActive, ...rest } = r;
    return {
      ...rest,
      assignees:   parseJsonArray(r.assignees),
      allRequests: parseJsonArray(r.allRequests),
      dependsOn:   parseIdList(r.dependsOn),
      status:      cascadeBlocked ? 'Blocked' : r.status,
      isActive:    !cascadeInactive,
    };
  });
}

// ── Create task + send assignment requests ────────────────────────────────────
//
// When a manager creates a task and selects assignees, each one gets an
// assignment REQUEST (status = Pending) — not a direct insert into
// pm_task_assignees. The request appears on the assignee's Dashboard.
// pm_task_assignees is no longer written here; accepted requests populate
// pm_activity_members (via acceptAssignmentRequest below).
//
// A task's Shared/CC chat thread is created immediately, seeded with the
// creator + the Activity's Manager(s) — assignees are added to it (and to
// the Activity's group thread) once they actually accept, in
// acceptAssignmentRequest.

async function createTask(activityId, projectId, userId, body) {
  const { name, description, priority = 'Medium', dueDate, estimatedHours, assigneeIds = [] } = body;
  if (!name?.trim()) { const e = new Error('Task name required'); e.statusCode = 400; throw e; }

  // Refuse to create work under something that's Blocked — this was
  // previously unenforced, so a Task could be added (and even marked
  // Complete) inside an Activity/Phase still waiting on an unresolved
  // dependency, making the block meaningless.
  const pool = await getPool();
  const parentResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT a.status AS activityStatus, a.is_active AS activityActive, ph.phase_id AS phaseId FROM pm_activities a INNER JOIN pm_phases ph ON ph.phase_id=a.phase_id WHERE a.activity_id=@activityId`);
  const parent = parentResult.recordset[0];
  if (!parent) { const e = new Error('Activity not found'); e.statusCode = 404; throw e; }
  if (parent.activityStatus === 'Blocked') {
    const e = new Error('This Activity is blocked by an unresolved dependency — resolve it before adding tasks.');
    e.statusCode = 409; throw e;
  }
  if (await isBlocked('phase', parent.phaseId)) {
    const e = new Error('This Phase is blocked by an unresolved dependency — resolve it before adding tasks.');
    e.statusCode = 409; throw e;
  }
  if (parent.activityActive === false) {
    const e = new Error('This Activity is inactive — reactivate it before adding tasks.');
    e.statusCode = 409; throw e;
  }
  if (await isInactive('phase', parent.phaseId) || await isInactive('project', projectId)) {
    const e = new Error('This Phase is inactive — reactivate it before adding tasks.');
    e.statusCode = 409; throw e;
  }

  let task;
  await withTransaction(async (req) => {
    const result = await req()
      .input('activityId',     sql.Int,              activityId)
      .input('name',           sql.NVarChar(200),    name.trim())
      .input('description',    sql.NVarChar(sql.MAX),description || null)
      .input('priority',       sql.NVarChar(20),     priority)
      .input('dueDate',        sql.Date,             dueDate || null)
      .input('estimatedHours', sql.Decimal(5, 1),    estimatedHours || null)
      .input('userId',         sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO pm_tasks (activity_id, name, description, priority, due_date, estimated_hours, created_by)
        OUTPUT INSERTED.task_id AS taskId, INSERTED.name, INSERTED.status
        VALUES (@activityId, @name, @description, @priority, @dueDate, @estimatedHours, @userId)
      `);
    task = result.recordset[0];

    // Send an assignment request to each chosen assignee
    for (const uid of [...new Set(assigneeIds)]) {
      await req()
        .input('taskId',      sql.Int,              task.taskId)
        .input('assigneeId',  sql.UniqueIdentifier, uid)
        .input('requestedBy', sql.UniqueIdentifier, userId)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM pm_task_assignment_requests
            WHERE task_id = @taskId AND assignee_id = @assigneeId
          )
            INSERT INTO pm_task_assignment_requests (task_id, assignee_id, requested_by)
            VALUES (@taskId, @assigneeId, @requestedBy)
        `);
    }
  });

  // Notify assignees via socket so their future Dashboard badge updates live
  for (const uid of assigneeIds) {
    broadcastAssignmentRequest(uid, { taskId: task.taskId, taskName: task.name, projectId });
  }

  await audit.log({ entityType:'task', entityId:task.taskId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });

  // Seed the task's chat thread now (creator + Activity Manager(s)). Assignees
  // join once they accept — see acceptAssignmentRequest.
  await pmChatService.ensureTaskThread(task.taskId);

  return { ...task, allRequests: assigneeIds.map(uid => ({ userId: uid, requestStatus: 'Pending' })) };
}

// ── Fetch pending assignment requests for a user ──────────────────────────────
// Called by the Dashboard module — returns everything the user needs to
// render a "you've been assigned to task X in project Y — accept / decline?"
// card.

async function getMyAssignmentRequests(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        r.request_id    AS requestId,
        r.task_id       AS taskId,
        r.status,
        r.created_at    AS createdAt,
        r.responded_at  AS respondedAt,
        t.name          AS taskName,
        t.description   AS taskDescription,
        t.priority,
        t.due_date      AS dueDate,
        t.status        AS taskStatus,
        -- activity
        a.activity_id   AS activityId,
        a.name          AS activityName,
        -- phase
        ph.phase_id     AS phaseId,
        ph.name         AS phaseName,
        -- project
        p.project_id    AS projectId,
        p.name          AS projectName,
        -- requested by
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS requestedByName
      FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks      t  ON t.task_id      = r.task_id
      INNER JOIN pm_activities a  ON a.activity_id  = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id    = a.phase_id
      INNER JOIN pm_projects   p  ON p.project_id   = ph.project_id
      INNER JOIN auth_users    u  ON u.user_id       = r.requested_by
      WHERE r.assignee_id = @userId
        AND t.is_deleted  = 0
        AND a.is_deleted  = 0
        AND ph.is_deleted = 0
        AND p.is_deleted  = 0
      ORDER BY r.created_at DESC
    `);
  return result.recordset;
}

// ── Accept / Decline request ──────────────────────────────────────────────────

async function acceptAssignmentRequest(requestId, userId) {
  const pool = await getPool();

  // Load the request (verify it belongs to this user and is still Pending)
  const reqResult = await pool.request()
    .input('requestId', sql.Int,              requestId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      SELECT r.request_id, r.task_id, r.status, t.activity_id, ph.project_id
      FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks      t  ON t.task_id     = r.task_id
      INNER JOIN pm_activities a  ON a.activity_id = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id   = a.phase_id
      WHERE r.request_id = @requestId AND r.assignee_id = @userId
    `);

  const row = reqResult.recordset[0];
  if (!row) { const e = new Error('Request not found'); e.statusCode = 404; throw e; }
  if (row.status !== 'Pending') { const e = new Error('Request already responded to'); e.statusCode = 400; throw e; }

  await withTransaction(async (req) => {
    // Mark request as Accepted
    await req()
      .input('requestId', sql.Int,              requestId)
      .input('userId',    sql.UniqueIdentifier, userId)
      .query(`
        UPDATE pm_task_assignment_requests
        SET status = 'Accepted', responded_at = SYSDATETIMEOFFSET()
        WHERE request_id = @requestId AND assignee_id = @userId
      `);

    // Insert confirmed assignee into pm_task_assignees (the live lookup table)
    await req()
      .input('taskId', sql.Int,              row.task_id)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_task_assignees WHERE task_id = @taskId AND user_id = @userId)
          INSERT INTO pm_task_assignees (task_id, user_id) VALUES (@taskId, @userId)
      `);

    // Auto-add accepted user to the activity's member roster (default Employee —
    // never downgrades if they already hold a higher role there)
    await req()
      .input('activityId', sql.Int,              row.activity_id)
      .input('userId',     sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id = @activityId AND user_id = @userId)
          INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @userId, 'Employee')
      `);

    // Also ensure they're in pm_members as a project Member (so they can see the project)
    await req()
      .input('projectId', sql.Int,              row.project_id)
      .input('userId',    sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_members WHERE project_id = @projectId AND user_id = @userId)
          INSERT INTO pm_members (project_id, user_id, role) VALUES (@projectId, @userId, 'Member')
      `);
  });

  await audit.log({ entityType:'task', entityId:row.task_id, projectId:row.project_id, userId, action:'assignment_accepted' });

  // Fully auto-sync: they now show up in both the task's Shared chat and
  // the Activity's group chat.
  await pmChatService.onAssigneeAccepted(row.task_id, row.activity_id);

  return { requestId, status: 'Accepted', taskId: row.task_id };
}

async function declineAssignmentRequest(requestId, userId) {
  const pool = await getPool();

  const reqResult = await pool.request()
    .input('requestId', sql.Int,              requestId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      SELECT r.request_id, r.task_id, r.status, ph.project_id
      FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks      t  ON t.task_id     = r.task_id
      INNER JOIN pm_activities a  ON a.activity_id = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id   = a.phase_id
      WHERE r.request_id = @requestId AND r.assignee_id = @userId
    `);

  const row = reqResult.recordset[0];
  if (!row) { const e = new Error('Request not found'); e.statusCode = 404; throw e; }
  if (row.status !== 'Pending') { const e = new Error('Request already responded to'); e.statusCode = 400; throw e; }

  await pool.request()
    .input('requestId', sql.Int,              requestId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      UPDATE pm_task_assignment_requests
      SET status = 'Declined', responded_at = SYSDATETIMEOFFSET()
      WHERE request_id = @requestId AND assignee_id = @userId
    `);

  await audit.log({ entityType:'task', entityId:row.task_id, projectId:row.project_id, userId, action:'assignment_declined' });
  // Nothing to sync in chat — a Pending request was never added to either thread.
  return { requestId, status: 'Declined', taskId: row.task_id };
}

// ── Update / Delete task ──────────────────────────────────────────────────────

const TASK_FIELD_TYPES = {
  name:            sql.NVarChar(200),
  description:     sql.NVarChar(sql.MAX),
  priority:        sql.NVarChar(20),
  due_date:        sql.Date,
  estimated_hours: sql.Decimal(5, 1),
};

async function updateTask(taskId, projectId, userId, body) {
  if (await isInactive('task', taskId) || await isInactive('project', projectId)) {
    const e = new Error('This Task is inactive — reactivate it before making changes.');
    e.statusCode = 409; throw e;
  }
  // Description is view-only for assignees, editable only by a Manager
  // (Activity/Phase/Project, by the same effective-role hierarchy used
  // everywhere else) — this route is otherwise only gated by the generic
  // "requireRole('Member')" at the router level, which doesn't distinguish
  // an assignee from a Manager, so without this check any project Member
  // could edit the description via a direct API call even though the
  // frontend now hides that ability from assignees.
  if (body.description !== undefined) {
    const pool0 = await getPool();
    const actResult = await pool0.request()
      .input('taskId', sql.Int, taskId)
      .query(`SELECT activity_id AS activityId FROM pm_tasks WHERE task_id=@taskId`);
    const activityId = actResult.recordset[0]?.activityId;
    const effective = activityId ? await getEffectiveActivityRole(userId, activityId) : { role: null };
    if (effective.role !== 'Manager') {
      const e = new Error('Only a Manager can edit the task description.');
      e.statusCode = 403; throw e;
    }
  }
  const fields = {};
  if (body.name           !== undefined) fields.name            = body.name.trim();
  if (body.description    !== undefined) fields.description     = body.description;
  if (body.priority       !== undefined) fields.priority        = body.priority;
  if (body.dueDate        !== undefined) fields.due_date        = body.dueDate;
  if (body.estimatedHours !== undefined) fields.estimated_hours = body.estimatedHours;
  const keys = Object.keys(fields);
  if (keys.length) {
    const pool = await getPool();
    const req  = pool.request().input('taskId', sql.Int, taskId);
    const set  = keys.map((k, i) => { const ph = `f${i}`; req.input(ph, TASK_FIELD_TYPES[k], fields[k]); return `${k}=@${ph}`; }).join(', ');
    await req.query(`UPDATE pm_tasks SET ${set} WHERE task_id=@taskId`);
    for (const key of keys) await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  }
  return { taskId, ...fields };
}

async function updateTaskStatus(taskId, projectId, userId, newStatus, projectRole) {
  const pool = await getPool();
  const cur = await pool.request()
    .input('taskId', sql.Int,              taskId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT t.status, t.activity_id AS activityId, a.phase_id AS phaseId, a.status AS activityStatus,
        CAST(CASE WHEN EXISTS(SELECT 1 FROM pm_task_assignees WHERE task_id=@taskId AND user_id=@userId)
             THEN 1 ELSE 0 END AS BIT) AS isAssigned
      FROM pm_tasks t
      INNER JOIN pm_activities a ON a.activity_id = t.activity_id
      WHERE t.task_id=@taskId AND t.is_deleted=0
    `);
  if (!cur.recordset[0]) { const e = new Error('Task not found'); e.statusCode = 404; throw e; }
  if (projectRole === 'Member' && !cur.recordset[0].isAssigned) {
    const e = new Error('Members can only update their own assigned tasks'); e.statusCode = 403; throw e;
  }
  const { status: oldStatus, activityId, phaseId, activityStatus } = cur.recordset[0];

  // Refuse to change the status of a task sitting inside something that's
  // currently Blocked (Activity or Phase) — it cascades down until the
  // ancestor's own dependency resolves. Previously only marking a task
  // Complete was guarded, so a task could still be moved to Ongoing (or any
  // other status) underneath a Blocked Activity/Phase with the block having
  // no real effect on it.
  if (activityStatus === 'Blocked') {
    const e = new Error('This task\'s Activity is blocked by an unresolved dependency — resolve it before changing status.');
    e.statusCode = 409; throw e;
  }
  if (await isBlocked('phase', phaseId)) {
    const e = new Error('This task\'s Phase is blocked by an unresolved dependency — resolve it before changing status.');
    e.statusCode = 409; throw e;
  }

  // Task's OWN prerequisite dependencies — this is the actual enforcement
  // point that was missing. blockIfNeeded/resolveUnblocked only maintain
  // the task's `status` column as a best-effort reflection of the
  // dependency graph (and only catch the transition at the moment a dep is
  // added/removed) — nothing previously stopped a manual status change
  // (e.g. via the dropdown, or a direct API call) from moving a task
  // straight past 'Blocked' to 'Complete' while its prerequisites were
  // still unresolved. This re-checks the live dependency graph on every
  // status change, regardless of what the cached status column says.
  const depCheck = await pool.request()
    .input('taskId', sql.Int, taskId)
    .input('done',   sql.NVarChar(30), DONE_STATUS)
    .query(`
      SELECT 1 AS x FROM pm_task_deps d
      INNER JOIN pm_tasks e ON e.task_id = d.depends_on_task_id
      WHERE d.task_id = @taskId AND e.status <> @done AND e.is_deleted = 0
    `);
  if (depCheck.recordset.length && newStatus !== 'Blocked') {
    const e = new Error('This task has unresolved prerequisite dependencies — complete them first.');
    e.statusCode = 409; throw e;
  }

  if (await isInactive('task', taskId) || await isInactive('activity', activityId)
      || await isInactive('phase', phaseId) || await isInactive('project', projectId)) {
    const e = new Error('This task is inactive — reactivate it before changing status.');
    e.statusCode = 409; throw e;
  }

  let unblockedIds = [];
  await withTransaction(async (req) => {
    await req()
      .input('status', sql.NVarChar(30), newStatus)
      .input('taskId', sql.Int,          taskId)
      .query(`UPDATE pm_tasks SET status=@status WHERE task_id=@taskId`);
    unblockedIds = newStatus === DONE_STATUS ? await resolveUnblocked(req, 'task', taskId) : [];
  });

  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'status_changed', fieldChanged:'status', oldValue:oldStatus, newValue:newStatus });
  broadcastStatusChanged(projectId, { entityType:'task', entityId:taskId, status:newStatus });
  if (unblockedIds.length) broadcastUnblocked(projectId, { entityType:'task', unblockedIds });

  // Broadcast updated progress immediately so all clients refresh without waiting for a full refetch
  const { getProjectProgress: gpp, getActivityProgress: gap, getPhaseProgress: gphp } = require('./progressService');
  const [projectProg, actProg, phaseProg] = await Promise.all([
    gpp(projectId),
    gap(activityId),
    gphp(phaseId),
  ]);
  broadcastProgressUpdated(projectId, {
    projectProgress: projectProg,
    activityId, activityProgress: actProg,
    phaseId,    phaseProgress:    phaseProg,
  });

  // Activity/Phase status is now purely computed from child progress — there's
  // no manual "mark Completed" action left to hang resolveUnblocked off of at
  // those levels. So: every time a task completes, check right here whether
  // that just pushed its parent Activity (and in turn Phase) to 100%, and if
  // so run the same unblock check those levels used to only get on a manual
  // status change. Read AFTER the transaction commits, so progress reflects
  // the update above. resolveUnblocked accepts a plain pool-request factory
  // for non-transactional use — no separate transaction needed here.
  if (newStatus === DONE_STATUS) {
    const activityProgress = await getActivityProgress(activityId);
    if (activityProgress >= 100) {
      // Clear any stale Blocked flag on the activity itself
      await pool.request()
        .input('activityId', sql.Int, activityId)
        .query(`UPDATE pm_activities SET status = 'To Do' WHERE activity_id = @activityId AND status = 'Blocked'`);

      const unblockedActivityIds = await resolveUnblocked(() => pool.request(), 'activity', activityId);
      if (unblockedActivityIds.length) broadcastUnblocked(projectId, { entityType:'activity', unblockedIds: unblockedActivityIds });

      const phaseProgress = await getPhaseProgress(phaseId);
      if (phaseProgress >= 100) {
        // Clear any stale Blocked flag on the phase itself
        await pool.request()
          .input('phaseId', sql.Int, phaseId)
          .query(`UPDATE pm_phases SET status = 'To Do' WHERE phase_id = @phaseId AND status = 'Blocked'`);

        const unblockedPhaseIds = await resolveUnblocked(() => pool.request(), 'phase', phaseId);
        if (unblockedPhaseIds.length) broadcastUnblocked(projectId, { entityType:'phase', unblockedIds: unblockedPhaseIds });
      }
    }
  }

  return { taskId, status:newStatus, unblockedTaskIds:unblockedIds };
}

// Tasks have no child table, so "children" here means confirmed assignees
// (pm_task_assignees) — committed work that would otherwise silently vanish
// from an assignee's active-tasks view. Pending/declined-only requests don't
// count (no committed work yet), so an unassigned task still hard-deletes.
async function deleteTask(taskId, projectId, userId) {
  const pool = await getPool();
  const childResult = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_task_assignees WHERE task_id=@taskId`);

  if (childResult.recordset[0].cnt > 0) {
    await pool.request()
      .input('taskId', sql.Int, taskId)
      .query(`UPDATE pm_tasks SET is_active=0 WHERE task_id=@taskId`);
    await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'deactivated' });
    return { action: 'deactivated' };
  }

  await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`UPDATE pm_tasks SET is_deleted=1 WHERE task_id=@taskId`);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'deleted' });
  // The task's chat thread (if any) is left intact for history — it simply
  // stops appearing as "linked to an open task" in the UI. Nothing to sync.
  return { action: 'deleted' };
}

async function reactivateTask(taskId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`UPDATE pm_tasks SET is_active=1 WHERE task_id=@taskId`);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'reactivated' });
}

// ── Send a new assignment request (post-creation) ─────────────────────────────

async function sendAssignmentRequest(taskId, targetUserId, projectId, actorUserId) {
  const pool = await getPool();

  // Look up task name for the notification payload
  const taskResult = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT name FROM pm_tasks WHERE task_id=@taskId AND is_deleted=0`);
  if (!taskResult.recordset[0]) { const e = new Error('Task not found'); e.statusCode = 404; throw e; }

  await pool.request()
    .input('taskId',      sql.Int,              taskId)
    .input('assigneeId',  sql.UniqueIdentifier, targetUserId)
    .input('requestedBy', sql.UniqueIdentifier, actorUserId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM pm_task_assignment_requests WHERE task_id=@taskId AND assignee_id=@assigneeId)
        INSERT INTO pm_task_assignment_requests (task_id, assignee_id, requested_by)
        VALUES (@taskId, @assigneeId, @requestedBy)
    `);

  broadcastAssignmentRequest(targetUserId, { taskId, taskName: taskResult.recordset[0].name, projectId });
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId:actorUserId, action:'assignee_requested', newValue:targetUserId });
}

async function removeAssignmentRequest(taskId, targetUserId, projectId, actorUserId) {
  const pool = await getPool();

  const taskResult = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT activity_id AS activityId FROM pm_tasks WHERE task_id=@taskId`);
  const activityId = taskResult.recordset[0]?.activityId;

  await pool.request()
    .input('taskId',     sql.Int,              taskId)
    .input('assigneeId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_task_assignment_requests WHERE task_id=@taskId AND assignee_id=@assigneeId`);
  // Also remove from confirmed assignees if they had accepted
  await pool.request()
    .input('taskId', sql.Int,              taskId)
    .input('userId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_task_assignees WHERE task_id=@taskId AND user_id=@userId`);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId:actorUserId, action:'assignee_removed', oldValue:targetUserId });

  // Fully auto-sync: drop them from the task thread, and from the Activity
  // thread too if this was their last accepted task in that activity.
  if (activityId) await pmChatService.onAssigneeRemoved(taskId, activityId);
}

// ── Dependency management ─────────────────────────────────────────────────────

async function addTaskDep(taskId, dependsOnId, projectId, userId) {
  // Dependencies are same-level only: a task may only depend on another
  // task within its own Activity (mirrors what the UI's dropdown already
  // offers, enforced here so the API can't be used to link across Activities).
  const pool = await getPool();
  const scopeResult = await pool.request()
    .input('taskId',      sql.Int, taskId)
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`
      SELECT
        (SELECT activity_id FROM pm_tasks WHERE task_id=@taskId)      AS activityId,
        (SELECT activity_id FROM pm_tasks WHERE task_id=@dependsOnId) AS depActivityId
    `);
  const { activityId, depActivityId } = scopeResult.recordset[0] || {};
  if (!depActivityId) { const e = new Error('Dependency task not found'); e.statusCode = 404; throw e; }
  if (activityId !== depActivityId) {
    const e = new Error('Tasks can only depend on other tasks within the same activity'); e.statusCode = 400; throw e;
  }

  await withTransaction(async (req) => {
    await req()
      .input('taskId',      sql.Int, taskId)
      .input('dependsOnId', sql.Int, dependsOnId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_task_deps WHERE task_id=@taskId AND depends_on_task_id=@dependsOnId)
          INSERT INTO pm_task_deps (task_id, depends_on_task_id) VALUES (@taskId, @dependsOnId)
      `);
    await blockIfNeeded(req, 'task', taskId, dependsOnId);
  });
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'dependency_added', newValue:dependsOnId });
}

async function removeTaskDep(taskId, dependsOnId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('taskId',      sql.Int, taskId)
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`DELETE FROM pm_task_deps WHERE task_id=@taskId AND depends_on_task_id=@dependsOnId`);

  // Re-evaluate: if no remaining unresolved deps, unblock the task
  await withTransaction(async (req) => {
    const unresolved = await req()
      .input('taskId', sql.Int, taskId)
      .input('done',   sql.NVarChar(30), DONE_STATUS)
      .query(`
        SELECT 1 AS x FROM pm_task_deps d
        INNER JOIN pm_tasks e ON e.task_id = d.depends_on_task_id
        WHERE d.task_id = @taskId AND e.status <> @done AND e.is_deleted = 0
      `);
    if (!unresolved.recordset.length) {
      await req()
        .input('taskId', sql.Int, taskId)
        .query(`UPDATE pm_tasks SET status = 'To Do' WHERE task_id = @taskId AND status = 'Blocked'`);
    }
  });

  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'dependency_removed', oldValue:dependsOnId });
}

// ── My Active Tasks — accepted Ongoing tasks with project/activity context ──────

async function getMyActiveTasks(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        t.task_id        AS taskId,
        t.name           AS taskName,
        t.description    AS taskDescription,
        t.priority       AS priority,
        t.status         AS status,
        t.due_date       AS dueDate,
        t.estimated_hours AS estimatedHours,
        a.activity_id    AS activityId,
        a.name           AS activityName,
        ph.phase_id      AS phaseId,
        ph.name          AS phaseName,
        pr.project_id    AS projectId,
        pr.name          AS projectName
      FROM pm_task_assignees ta
      INNER JOIN pm_tasks       t   ON t.task_id       = ta.task_id     AND t.is_deleted  = 0
      INNER JOIN pm_activities  a   ON a.activity_id   = t.activity_id  AND a.is_deleted  = 0
      INNER JOIN pm_phases      ph  ON ph.phase_id      = a.phase_id    AND ph.is_deleted = 0
      INNER JOIN pm_projects    pr  ON pr.project_id    = ph.project_id AND pr.is_deleted = 0
      WHERE ta.user_id = @userId
        AND t.status NOT IN ('Complete')
      ORDER BY
        CASE t.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
        t.due_date ASC
    `);
  return result.recordset;
}

// ── Chat thread lookup (used by taskRoutes GET /:id/chat) ──────────────────────

async function getOrCreateTaskThread(taskId) {
  return pmChatService.ensureTaskThread(taskId);
}

module.exports = {
  getTasksForActivity,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  reactivateTask,
  sendAssignmentRequest,
  removeAssignmentRequest,
  getMyAssignmentRequests,
  getMyActiveTasks,
  acceptAssignmentRequest,
  declineAssignmentRequest,
  addTaskDep,
  removeTaskDep,
  getOrCreateTaskThread,
};