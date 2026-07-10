'use strict';

/**
 * roleService — computes the EFFECTIVE role a user holds at any point in the
 * Project → Phase → Activity → Task tree.
 *
 * Inheritance rule (matches the CSV's "Inheritance Path" column):
 *   - Look for an explicit role at the most specific level first
 *     (Activity, then Phase, then Project).
 *   - The first explicit row found WINS outright — it does not get
 *     "topped up" by a higher role at a broader level. An Activity Manager
 *     who is only a project-level Member is still a full Manager inside
 *     that one Activity, and a project Manager who is explicitly set as
 *     Viewer on one Activity is a Viewer there.
 *   - If no explicit row exists at any level, there is no access — being a
 *     project Manager does NOT implicitly make you a member of every
 *     Activity; it only means you're ALLOWED to manage the roster there.
 *     (See requireEntityRole in middleware/entityRole.js, which layers the
 *     "project Manager can always administer" rule on top of this.)
 *
 * Task-level access is intentionally NOT resolved here — a task has no
 * role of its own, only assignees (pm_task_assignees). Whether someone can
 * touch a specific task is decided by taskService (assignee OR Activity
 * Manager OR above), not by this resolver.
 */

const { getPool, sql } = require('../../../config/db');

const RANK = { Viewer: 1, Employee: 2, Member: 2, Manager: 3 };

function rank(role) {
  return RANK[role] ?? 0;
}

/**
 * Returns { role, level } for the most specific explicit role a user has
 * for the given activity, walking Activity → Phase → Project.
 * `level` is one of 'activity' | 'phase' | 'project' | null.
 */
// Admins get full Manager-equivalent access everywhere in PM, same as the
// project-level bypass in projectRole.js/entityRole.js — but those two
// middlewares only guard WRITE routes; every per-row `myRole` a list
// endpoint computes (phase list, activity list) calls straight into this
// file, which had no admin awareness at all. An admin therefore saw
// `myRole: 'Manager'` on the project itself but `null` on every Phase/
// Activity underneath it, collapsing the UI to view-only despite the
// backend actually allowing the write. `isAdmin` is opt-in (defaults
// false) so every other caller of these two functions is unaffected.
async function getEffectiveActivityRole(userId, activityId, isAdmin = false) {
  if (isAdmin) return { role: 'Manager', level: 'admin', projectId: null, phaseId: null };
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .input('userId',     sql.UniqueIdentifier, userId)
    .query(`
      SELECT ph.phase_id AS phaseId, ph.project_id AS projectId,
             am.role AS activityRole, pm2.role AS phaseRole, pm.role AS projectRole
      FROM pm_activities a
      INNER JOIN pm_phases   ph  ON ph.phase_id   = a.phase_id
      LEFT  JOIN pm_activity_members am ON am.activity_id = a.activity_id AND am.user_id = @userId
      LEFT  JOIN pm_phase_members    pm2 ON pm2.phase_id   = ph.phase_id   AND pm2.user_id = @userId
      LEFT  JOIN pm_members          pm  ON pm.project_id  = ph.project_id AND pm.user_id  = @userId
      WHERE a.activity_id = @activityId
    `);
  const row = result.recordset[0];
  if (!row) return { role: null, level: null, projectId: null, phaseId: null };
  if (row.activityRole) return { role: row.activityRole, level: 'activity', projectId: row.projectId, phaseId: row.phaseId };
  if (row.phaseRole)    return { role: row.phaseRole,    level: 'phase',    projectId: row.projectId, phaseId: row.phaseId };
  if (row.projectRole)  return { role: row.projectRole,  level: 'project',  projectId: row.projectId, phaseId: row.phaseId };
  return { role: null, level: null, projectId: row.projectId, phaseId: row.phaseId };
}

/**
 * Same idea, one level up — Phase → Project.
 */
async function getEffectivePhaseRole(userId, phaseId, isAdmin = false) {
  if (isAdmin) return { role: 'Manager', level: 'admin', projectId: null };
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .input('userId',  sql.UniqueIdentifier, userId)
    .query(`
      SELECT ph.project_id AS projectId, pm2.role AS phaseRole, pm.role AS projectRole
      FROM pm_phases ph
      LEFT JOIN pm_phase_members pm2 ON pm2.phase_id = ph.phase_id AND pm2.user_id = @userId
      LEFT JOIN pm_members       pm  ON pm.project_id = ph.project_id AND pm.user_id = @userId
      WHERE ph.phase_id = @phaseId
    `);
  const row = result.recordset[0];
  if (!row) return { role: null, level: null, projectId: null };
  if (row.phaseRole)   return { role: row.phaseRole,   level: 'phase',   projectId: row.projectId };
  if (row.projectRole) return { role: row.projectRole, level: 'project', projectId: row.projectId };
  return { role: null, level: null, projectId: row.projectId };
}

/** Users holding an explicit 'Manager' row on the activity (empty array if none). */
async function getActivityManagerIds(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT user_id AS userId FROM pm_activity_members WHERE activity_id=@activityId AND role='Manager'`);
  return result.recordset.map(r => String(r.userId));
}

/**
 * Activity Managers if any are explicitly set, else falls back to the
 * legacy single owner_id column, else empty. Used anywhere we need "who
 * do we treat as this activity's manager(s) right now" (e.g. chat sync).
 */
async function resolveActivityManagerIds(activityId) {
  const explicit = await getActivityManagerIds(activityId);
  if (explicit.length) return explicit;
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT owner_id AS ownerId FROM pm_activities WHERE activity_id=@activityId AND is_deleted=0`);
  const ownerId = result.recordset[0]?.ownerId;
  return ownerId ? [String(ownerId)] : [];
}

/** All users currently in pm_activity_members for this activity, any role. */
async function getAllActivityMemberIds(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT user_id AS userId FROM pm_activity_members WHERE activity_id=@activityId`);
  return result.recordset.map(r => String(r.userId));
}

/** Project Managers for the project a given activity belongs to. */
async function getProjectManagerIdsForActivity(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT pm.user_id AS userId
      FROM pm_activities a
      INNER JOIN pm_phases ph ON ph.phase_id = a.phase_id
      INNER JOIN pm_members pm ON pm.project_id = ph.project_id AND pm.role = 'Manager'
      WHERE a.activity_id = @activityId
    `);
  return result.recordset.map(r => String(r.userId));
}

/** Phase Managers for the phase a given activity belongs to. */
async function getPhaseManagerIdsForActivity(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT pm2.user_id AS userId
      FROM pm_activities a
      INNER JOIN pm_phases ph ON ph.phase_id = a.phase_id
      INNER JOIN pm_phase_members pm2 ON pm2.phase_id = ph.phase_id AND pm2.role = 'Manager'
      WHERE a.activity_id = @activityId
    `);
  return result.recordset.map(r => String(r.userId));
}

/**
 * Every Manager with authority over a task via its parent activity: the
 * activity's own explicit Manager(s), the Phase's Manager(s), and the
 * project's Manager(s) — always unioned together, not a fallback chain.
 * Per the role hierarchy a Phase/Project Manager already has full
 * authority over everything underneath them (see requireEntityRole), so
 * they belong in a task's chat regardless of whether that task's Activity
 * happens to have its own explicit Manager set.
 */
async function resolveTaskManagerIds(activityId) {
  const [activityManagers, phaseManagers, projectManagers] = await Promise.all([
    getActivityManagerIds(activityId),
    getPhaseManagerIdsForActivity(activityId),
    getProjectManagerIdsForActivity(activityId),
  ]);
  return [...new Set([...activityManagers, ...phaseManagers, ...projectManagers])];
}

/**
 * The full set of people who currently belong in this activity's chat:
 * every explicit activity member (any role). This is deliberately broader
 * than resolveActivityManagerIds — a thread should reflect the whole
 * roster, not just its Manager(s).
 *
 * Falls back to Activity Manager(s)/owner, then to the project's
 * Manager(s), so a thread can ALWAYS be seeded with at least one person —
 * a brand-new Activity with no members yet still gets a real, open-able
 * (if momentarily one-person) chat rather than failing to create one.
 */
async function resolveActivityThreadSeedIds(activityId) {
  // Phase Managers and Project Managers are ALWAYS included, cumulatively —
  // not a fallback that only kicks in when the activity has no members of
  // its own. They hold authority over this activity by hierarchy (same
  // reasoning as resolveTaskManagerIds above) regardless of whether they
  // happen to also appear in pm_activity_members.
  // Bug that was here previously: project managers were only a last-resort
  // fallback and got skipped the moment a single pm_activity_members row
  // existed, causing project Managers (including the project owner) to fail
  // assertConversationParticipant and see "Failed to load" when opening any
  // activity chat they weren't explicitly listed in. Phase Managers had the
  // exact same gap and were never included at all until now.
  const [members, phaseManagers, projectManagers] = await Promise.all([
    getAllActivityMemberIds(activityId),
    getPhaseManagerIdsForActivity(activityId),
    getProjectManagerIdsForActivity(activityId),
  ]);
  const seed = new Set([...members, ...phaseManagers, ...projectManagers]);
  if (seed.size) return [...seed];
  // Final fallback only when literally nobody qualifies yet (edge case
  // during initial setup, before the project even has a Manager): use the
  // activity-level manager / owner_id column.
  return resolveActivityManagerIds(activityId);
}

module.exports = {
  RANK, rank,
  getEffectiveActivityRole,
  getEffectivePhaseRole,
  getActivityManagerIds,
  resolveActivityManagerIds,
  getAllActivityMemberIds,
  getProjectManagerIdsForActivity,
  getPhaseManagerIdsForActivity,
  resolveTaskManagerIds,
  resolveActivityThreadSeedIds,
};