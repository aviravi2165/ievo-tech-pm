'use strict';

const { getPool, sql } = require('../../../config/db');
const audit = require('./auditService');
const pmChatService = require('./pmChatService');

const PHASE_MEMBER_ROLES = ['Manager', 'Employee', 'Viewer'];

// resolveTaskManagerIds/resolveActivityThreadSeedIds (roleService.js) both
// cumulatively include Phase Managers, alongside Activity/Project Managers —
// so a Phase Manager change needs the exact same chat resync
// activityService.js already does for Activity Manager changes. This was
// previously entirely missing here: making someone a Phase Manager never
// added them to that phase's activity/task chat threads, and removing one
// never took their access away, until some unrelated event happened to
// touch the same activity/task later.
async function resyncPhaseActivityThreads(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT activity_id AS activityId FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);
  await Promise.all(result.recordset.map(a => pmChatService.onActivityManagersChanged(a.activityId)));
}

async function getPhaseMembers(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`
      SELECT pm2.user_id AS userId, pm2.role AS role, pm2.added_at AS addedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name, u.email
      FROM pm_phase_members pm2
      INNER JOIN auth_users u ON u.user_id = pm2.user_id
      WHERE pm2.phase_id = @phaseId
      ORDER BY CASE pm2.role WHEN 'Manager' THEN 0 WHEN 'Employee' THEN 1 ELSE 2 END, u.first_name, u.last_name
    `);
  return result.recordset;
}

async function addOrUpdatePhaseMember(phaseId, targetUserId, role, actorUserId, projectId) {
  const finalRole = PHASE_MEMBER_ROLES.includes(role) ? role : 'Employee';
  const pool = await getPool();
  await pool.request()
    .input('phaseId', sql.Int,              phaseId)
    .input('userId',  sql.UniqueIdentifier, targetUserId)
    .input('role',    sql.NVarChar(20),     finalRole)
    .query(`
      IF EXISTS (SELECT 1 FROM pm_phase_members WHERE phase_id=@phaseId AND user_id=@userId)
        UPDATE pm_phase_members SET role=@role WHERE phase_id=@phaseId AND user_id=@userId
      ELSE
        INSERT INTO pm_phase_members (phase_id, user_id, role) VALUES (@phaseId, @userId, @role)
    `);

  // Ensure baseline project membership too, same convention as Activity members.
  const pid = projectId || (await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT project_id FROM pm_phases WHERE phase_id=@phaseId`)).recordset[0]?.project_id;
  if (pid) {
    await pool.request()
      .input('projectId', sql.Int,              pid)
      .input('userId',    sql.UniqueIdentifier, targetUserId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_members WHERE project_id=@projectId AND user_id=@userId)
          INSERT INTO pm_members (project_id, user_id, role) VALUES (@projectId, @userId, 'Member')
      `);
  }

  await audit.log({ entityType:'phase', entityId:phaseId, projectId:pid, userId:actorUserId, action:'member_added', fieldChanged:'role', newValue:finalRole });
  await resyncPhaseActivityThreads(phaseId);
}

async function removePhaseMember(phaseId, targetUserId, actorUserId, projectId) {
  // Same reasoning as projectService.removeMember — a Phase-level removal
  // can be someone's ONLY access to that phase (e.g. a Viewer scoped only
  // here), so self-removal is admin/other-Manager-only, not self-service.
  if (String(targetUserId) === String(actorUserId)) {
    const e = new Error('You cannot remove yourself from a phase — ask an admin or another Manager.');
    e.statusCode = 403; throw e;
  }
  const pool = await getPool();

  // Cascade, deepest first: their task assignments and any Activity-level
  // override they held anywhere under this phase. Without this, removing
  // someone from a Phase leaves stale pm_activity_members/task-assignee
  // rows behind — which would silently reactivate if they're later
  // re-added to the Phase at a LOWER role than the stale row implies
  // (e.g. re-added as Phase Viewer while a leftover Activity Manager row
  // from before still grants them full Manager access there).
  await pool.request()
    .input('phaseId', sql.Int,              phaseId)
    .input('userId',  sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE r FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks      t ON t.task_id      = r.task_id
      INNER JOIN pm_activities a ON a.activity_id  = t.activity_id
      WHERE a.phase_id=@phaseId AND r.assignee_id=@userId
    `);
  await pool.request()
    .input('phaseId', sql.Int,              phaseId)
    .input('userId',  sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE ta FROM pm_task_assignees ta
      INNER JOIN pm_tasks      t ON t.task_id      = ta.task_id
      INNER JOIN pm_activities a ON a.activity_id  = t.activity_id
      WHERE a.phase_id=@phaseId AND ta.user_id=@userId
    `);
  await pool.request()
    .input('phaseId', sql.Int,              phaseId)
    .input('userId',  sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE am FROM pm_activity_members am
      INNER JOIN pm_activities a ON a.activity_id = am.activity_id
      WHERE a.phase_id=@phaseId AND am.user_id=@userId
    `);

  await pool.request()
    .input('phaseId', sql.Int,              phaseId)
    .input('userId',  sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_phase_members WHERE phase_id=@phaseId AND user_id=@userId`);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId:actorUserId, action:'member_removed', oldValue:targetUserId });
  await resyncPhaseActivityThreads(phaseId);
}

module.exports = { PHASE_MEMBER_ROLES, getPhaseMembers, addOrUpdatePhaseMember, removePhaseMember };