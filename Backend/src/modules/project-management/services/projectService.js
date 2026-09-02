'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { deriveProjectStatus, getProjectStats } = require('./progressService');
const { getProjectDelayDays, getOverdueDays } = require('./delayService');
const { isInactive } = require('./dependencyService');
const pmChatService = require('./pmChatService');

// resolveTaskManagerIds/resolveActivityThreadSeedIds (roleService.js)
// cumulatively include Project Managers alongside Activity/Phase Managers —
// so a project-level Manager change needs every activity/task thread across
// the WHOLE project resynced, same as activityService.js already does for
// Activity-level changes and phaseMemberService.js for Phase-level. This
// was previously entirely missing: making someone a Project Manager never
// gave them access to any activity/task chat in that project, and removing
// one never revoked it, until an unrelated event happened to touch that
// specific activity/task later.
async function resyncProjectActivityThreads(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT a.activity_id AS activityId
      FROM pm_activities a
      INNER JOIN pm_phases ph ON ph.phase_id = a.phase_id
      WHERE ph.project_id = @projectId AND a.is_deleted = 0 AND ph.is_deleted = 0
    `);
  await Promise.all(result.recordset.map(a => pmChatService.onActivityManagersChanged(a.activityId)));
}

// opts.page/opts.pageSize are OPT-IN — omitting them keeps the original
// unbounded-array return shape, since Dashboard/AdminDashboard both call
// this with no options to compute aggregate stats (overdue/blocked counts
// etc.) across the user's ENTIRE project set, not just one page of it.
// Only the Project List page passes page/pageSize, and only then does this
// return the {items, total} paginated shape instead of a flat array.
async function listProjects(userId, isAdmin = false, opts = {}) {
  const { page, pageSize, search } = opts;
  const paginated = Number.isInteger(page) && Number.isInteger(pageSize);

  const pool = await getPool();
  const req = pool.request().input('userId', sql.UniqueIdentifier, userId);
  // Admins see every project (oversight view, mirrors the messaging
  // module's super-admin "all groups" behavior) — LEFT JOIN instead of
  // INNER JOIN so projects with no pm_members row for this admin still
  // show up; myRole is NULL for those (frontend treats isSuperAdmin as
  // implicit Manager-level access, it doesn't rely on myRole for admins).
  const joinClause = isAdmin
    ? 'LEFT JOIN pm_members pm ON pm.project_id=p.project_id AND pm.user_id=@userId'
    : 'INNER JOIN pm_members pm ON pm.project_id=p.project_id AND pm.user_id=@userId';

  let searchClause = '';
  if (search?.trim()) {
    req.input('search', sql.NVarChar(200), `%${search.trim()}%`);
    searchClause = 'AND p.name LIKE @search';
  }

  let paginationClause = '';
  if (paginated) {
    req.input('offset', sql.Int, Math.max(0, page - 1) * pageSize);
    req.input('pageSize', sql.Int, pageSize);
    paginationClause = 'OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY';
  }

  const result = await req.query(`
      SELECT p.project_id AS projectId, p.name, p.description, p.status,
             p.planned_start AS plannedStart, p.planned_end AS plannedEnd,
             p.created_at AS createdAt, pm.role AS myRole, p.is_active AS isActive,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS ownerName,
             -- Raw "past its own planned_end" only — status exclusion
             -- applied in JS below against the DERIVED status (see the
             -- matching comment in activityService.getActivitiesForPhase).
             -- 'Cancelled' is the one value deriveProjectStatus never
             -- overwrites, so p.status NOT IN ('Cancelled') here would have
             -- been safe on its own, but 'Completed' is exactly as
             -- transient as Phase/Activity's — never reliably written back
             -- to this column — so it needed the same fix.
             CASE WHEN p.planned_end < CAST(GETDATE() AS DATE)
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS plannedEndPassed,
             (SELECT COUNT(*) FROM pm_phases ph WHERE ph.project_id=p.project_id AND ph.is_deleted=0) AS phaseCount,
             (SELECT COUNT(*) FROM pm_members WHERE project_id=p.project_id) AS memberCount
             ${paginated ? ', COUNT(*) OVER() AS totalCount' : ''}
      FROM pm_projects p
      ${joinClause}
      LEFT JOIN auth_users u ON u.user_id=p.owner_id
      WHERE p.is_deleted=0 ${searchClause}
      ORDER BY p.is_active DESC, p.modified_at DESC
      ${paginationClause}
    `);
  const rows = result.recordset;
  const total = paginated ? (rows[0]?.totalCount ?? 0) : rows.length;
  rows.forEach(r => { delete r.totalCount; });
  // Admins always get full manage access regardless of any explicit
  // (lower) pm_members role they might separately hold.
  if (isAdmin) rows.forEach(r => { r.isSuperAdmin = true; r.myRole = 'Manager'; });
  // Progress here used to be a separate, hand-rolled flat-pool SQL query
  // (every grandchild task pooled directly, unweighted by phase/activity
  // count) — a different, less correct number than the Detail page's
  // getProjectProgress (which properly averages each level's own already-
  // computed progress). Reusing the same shared function keeps List and
  // Detail pages showing the same number for the same project, and lets
  // status derivation below use a progress figure that's actually right.
  //
  // PERF: this used to be a sequential `for...await` loop — one project's
  // progress/active-work check waited for the previous project's to fully
  // finish, and each of those was itself a whole recursive phase→activity
  // fan-out (see progressService.js). For a list of P projects that's P
  // full recursive chains run back-to-back, which is what made this
  // endpoint measurably the slowest thing in the PM module (~1.5s with a
  // few dozen projects, and it only gets worse as more are created).
  // Promise.all-ing across projects runs all of those chains concurrently
  // instead — same queries, same math, just not serialized. Paginating the
  // SQL fetch itself (above) is what actually bounds this loop's size now —
  // a page of 25 always does 25 concurrent chains, not however many
  // projects exist in total.
  //
  // PERF, round 2: progress/hasActiveWork/hasTasks/phaseCount used to be 4
  // SEPARATE calls, each independently re-walking the same phase→activity→
  // task tree from scratch. getProjectStats does it all in one traversal —
  // see its comment in progressService.js.
  await Promise.all(rows.map(async (p) => {
    const stats = await getProjectStats(p.projectId);
    p.progress = stats.progress;
    p.status = deriveProjectStatus(p.progress, p.status, stats.hasActiveWork);
    // Gated on actually having a task somewhere underneath it — see the
    // matching comment in activityService.getActivitiesForPhase. emptyState
    // is NOT date-gated, unlike isOverdue — see phaseService's own comment.
    p.isOverdue = Boolean(p.plannedEndPassed) && p.status !== 'Completed' && p.status !== 'Closed' && stats.hasTasks;
    p.overdueDays = p.isOverdue ? getOverdueDays(p.plannedEnd) : 0;
    p.emptyState = stats.phaseCount === 0 ? 'noPhases' : (stats.hasTasks ? null : 'noTasks');
    delete p.plannedEndPassed;
  }));
  return paginated ? { items: rows, total, page, pageSize } : rows;
}

async function getProject(projectId, userId, isAdmin = false) {
  const pool = await getPool();
  const req = pool.request().input('projectId', sql.Int, projectId).input('userId', sql.UniqueIdentifier, userId);
  const joinClause = isAdmin
    ? 'LEFT JOIN pm_members pm ON pm.project_id=p.project_id AND pm.user_id=@userId'
    : 'INNER JOIN pm_members pm ON pm.project_id=p.project_id AND pm.user_id=@userId';
  const projResult = await req.query(`
      SELECT p.project_id AS projectId, p.name, p.description, p.status,
             p.planned_start AS plannedStart, p.planned_end AS plannedEnd,
             p.dept_id AS deptId, p.created_at AS createdAt, p.modified_at AS modifiedAt,
             pm.role AS myRole, p.is_active AS isActive,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS ownerName,
             -- Raw "past its own planned_end" only — status exclusion
             -- applied in JS below, once proj.status is the DERIVED value
             -- (see getProjects above for why).
             CASE WHEN p.planned_end < CAST(GETDATE() AS DATE)
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS plannedEndPassed
      FROM pm_projects p
      ${joinClause}
      LEFT JOIN auth_users u ON u.user_id=p.owner_id
      WHERE p.project_id=@projectId AND p.is_deleted=0
    `);
  const proj = projResult.recordset[0];
  if (!proj) { const e = new Error('Project not found or access denied'); e.statusCode = 404; throw e; }
  if (isAdmin) { proj.isSuperAdmin = true; proj.myRole = 'Manager'; }

  const membersResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT m.user_id AS userId, m.role, m.added_at AS addedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name, u.email
      FROM pm_members m LEFT JOIN auth_users u ON u.user_id=m.user_id
      WHERE m.project_id=@projectId ORDER BY m.role, u.first_name
    `);
  // getProjectStats collapses progress/hasActiveWork/hasTasks/phaseCount
  // into one traversal — see listProjects's identical PERF note above.
  const stats = await getProjectStats(projectId);
  const progress = stats.progress;
  proj.status = deriveProjectStatus(progress, proj.status, stats.hasActiveWork);
  proj.isOverdue = Boolean(proj.plannedEndPassed) && proj.status !== 'Completed' && proj.status !== 'Closed' && stats.hasTasks;
  proj.overdueDays = proj.isOverdue ? getOverdueDays(proj.plannedEnd) : 0;
  proj.emptyState = stats.phaseCount === 0 ? 'noPhases' : (stats.hasTasks ? null : 'noTasks');
  delete proj.plannedEndPassed;
  const delayDays = (proj.status === 'Completed' || proj.status === 'Closed')
    ? 0
    : await getProjectDelayDays(projectId, proj.plannedEnd);
  return { ...proj, members: membersResult.recordset, progress, delayDays };
}

async function createProject(userId, body) {
  const { name, description, plannedStart, plannedEnd, deptId } = body;
  if (!name?.trim()) { const e = new Error('Project name is required'); e.statusCode = 400; throw e; }
  if (name.trim().length > 200) { const e = new Error('Project name must be 200 characters or fewer'); e.statusCode = 400; throw e; }
  if (plannedStart && plannedEnd && new Date(plannedEnd) < new Date(plannedStart)) {
    const e = new Error("Project end date can't be before its start date."); e.statusCode = 400; throw e;
  }

  let project;
  await withTransaction(async (req) => {
    const result = await req()
      .input('name',         sql.NVarChar(200),     name.trim())
      .input('description',  sql.NVarChar(sql.MAX), description || null)
      .input('plannedStart', sql.Date,              plannedStart || null)
      .input('plannedEnd',   sql.Date,              plannedEnd || null)
      .input('deptId',       sql.Int,               deptId || null)
      .input('userId',       sql.UniqueIdentifier,  userId)
      .query(`
        INSERT INTO pm_projects (name,description,planned_start,planned_end,dept_id,owner_id,created_by)
        OUTPUT INSERTED.project_id AS projectId, INSERTED.name, INSERTED.status
        VALUES (@name,@description,@plannedStart,@plannedEnd,@deptId,@userId,@userId)
      `);
    project = result.recordset[0];
    await req()
      .input('projectId', sql.Int,              project.projectId)
      .input('userId',    sql.UniqueIdentifier, userId)
      .query(`INSERT INTO pm_members (project_id,user_id,role) VALUES (@projectId,@userId,'Manager')`);
  });

  await audit.log({ entityType:'project', entityId:project.projectId, projectId:project.projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
  return project;
}

const PROJECT_FIELD_TYPES = {
  name:          sql.NVarChar(200),
  description:   sql.NVarChar(sql.MAX),
  status:        sql.NVarChar(30),
  planned_start: sql.Date,
  planned_end:   sql.Date,
  dept_id:       sql.Int,
};

async function updateProject(projectId, userId, body) {
  if (await isInactive('project', projectId)) {
    const e = new Error('This Project is inactive — reactivate it before making changes.');
    e.statusCode = 409; throw e;
  }
  if (body.name !== undefined) {
    if (!body.name.trim()) { const e = new Error('Project name is required'); e.statusCode = 400; throw e; }
    if (body.name.trim().length > 200) { const e = new Error('Project name must be 200 characters or fewer'); e.statusCode = 400; throw e; }
  }
  // Only the manually-settable statuses can be written here. 'Completed' is
  // automatic (deriveProjectStatus returns it at 100% progress), so it's not
  // an accepted manual value — a Manager sets Active / Hold / Closed, and
  // Completed shows on its own when the work is done.
  if (body.status !== undefined && !['Active', 'Hold', 'Closed'].includes(body.status)) {
    const e = new Error('Project status must be Active, Hold, or Closed.'); e.statusCode = 400; throw e;
  }
  if (body.plannedStart !== undefined || body.plannedEnd !== undefined) {
    const pool0 = await getPool();
    const cur = await pool0.request().input('projectId', sql.Int, projectId)
      .query(`SELECT planned_start AS plannedStart, planned_end AS plannedEnd FROM pm_projects WHERE project_id=@projectId`);
    const row0 = cur.recordset[0] || {};
    const effStart = body.plannedStart !== undefined ? body.plannedStart : row0.plannedStart;
    const effEnd   = body.plannedEnd   !== undefined ? body.plannedEnd   : row0.plannedEnd;
    if (effStart && effEnd && new Date(effEnd) < new Date(effStart)) {
      const e = new Error("Project end date can't be before its start date."); e.statusCode = 400; throw e;
    }
  }
  const fields = {};
  if (body.name         !== undefined) fields.name          = body.name.trim();
  if (body.description  !== undefined) fields.description   = body.description;
  if (body.status       !== undefined) fields.status        = body.status;
  if (body.plannedStart !== undefined) fields.planned_start = body.plannedStart;
  if (body.plannedEnd   !== undefined) fields.planned_end   = body.plannedEnd;
  if (body.deptId       !== undefined) fields.dept_id       = body.deptId;
  const keys = Object.keys(fields);
  if (!keys.length) return {};

  const pool = await getPool();
  const req  = pool.request().input('projectId', sql.Int, projectId);
  const set  = keys.map((k, i) => {
    const ph = `f${i}`;
    req.input(ph, PROJECT_FIELD_TYPES[k], fields[k]);
    return `${k}=@${ph}`;
  }).join(', ');
  await req.query(`UPDATE pm_projects SET ${set}, modified_at=SYSDATETIMEOFFSET() WHERE project_id=@projectId`);

  for (const key of keys) {
    await audit.log({ entityType:'project', entityId:projectId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  }
  return { projectId, ...fields };
}

// Delete only when empty (no phases) — otherwise deactivate, preserving
// data underneath instead of orphaning it from view.
async function deleteProject(projectId, userId) {
  const pool = await getPool();
  const childResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_phases WHERE project_id=@projectId AND is_deleted=0`);

  if (childResult.recordset[0].cnt > 0) {
    await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`UPDATE pm_projects SET is_active=0, modified_at=SYSDATETIMEOFFSET() WHERE project_id=@projectId`);
    await audit.log({ entityType:'project', entityId:projectId, projectId, userId, action:'deactivated' });
    await pmChatService.setActivityThreadsDisabledForProject(projectId, true);
    return { action: 'deactivated' };
  }

  await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`UPDATE pm_projects SET is_deleted=1, modified_at=SYSDATETIMEOFFSET() WHERE project_id=@projectId`);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId, action:'deleted' });
  return { action: 'deleted' };
}

async function reactivateProject(projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`UPDATE pm_projects SET is_active=1, modified_at=SYSDATETIMEOFFSET() WHERE project_id=@projectId`);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId, action:'reactivated' });
  // Bring every Activity chat group under this Project back out of the
  // reply-only state deleteProject's deactivate branch put them in — this
  // is the only level where a chat group can have been auto-disabled by a
  // deactivation the Activity/Phase's own is_active row never recorded, so
  // it's also the only level that needs to walk back down to undo it.
  await pmChatService.setActivityThreadsDisabledForProject(projectId, false);
}

// ── Flat member list (used by project header + progress sidebar) ──────────────

async function getMembers(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT m.user_id AS userId, m.role, m.added_at AS addedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name, u.email
      FROM pm_members m LEFT JOIN auth_users u ON u.user_id=m.user_id
      WHERE m.project_id=@projectId ORDER BY m.role, u.first_name
    `);
  return result.recordset;
}

// ── Hierarchical member view (Members tab) ────────────────────────────────────
//
// Returns every unique member with their project-level role, then for each
// member the list of phases they participate in — WITH their actual Phase
// role if one is explicitly set — and within each phase, the activities
// they belong to, WITH their actual Activity role.
//
// A phase/activity role of null means "no explicit row there — access is
// inherited from the level above" (see roleService.getEffective*Role for
// how that inheritance resolves at request time). This is deliberately
// surfaced as null rather than pre-computed/inherited here, so the Members
// tab can show e.g. "Employee (inherited from Project)" distinctly from an
// explicit per-level assignment.
//
// Shape:
// [
//   {
//     userId, name, email, projectRole,
//     phases: [
//       {
//         phaseId, phaseName, phaseRole,   // phaseRole: 'Manager'|'Employee'|'Viewer'|null
//         activities: [{ activityId, activityName, activityRole }]
//       }
//     ]
//   }
// ]

async function getProjectMembersHierarchy(projectId) {
  const pool = await getPool();

  // 1. All project-level members
  const membersResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT m.user_id AS userId, m.role AS projectRole,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
             u.email
      FROM pm_members m
      INNER JOIN auth_users u ON u.user_id = m.user_id
      WHERE m.project_id = @projectId
      ORDER BY m.role, u.first_name
    `);

  // 2. All activity memberships for this project (includes phase context + role)
  const activityMembersResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT am.user_id AS userId,
             am.role AS activityRole,
             a.activity_id AS activityId,
             a.name AS activityName,
             ph.phase_id AS phaseId,
             ph.name AS phaseName
      FROM pm_activity_members am
      INNER JOIN pm_activities a  ON a.activity_id = am.activity_id  AND a.is_deleted = 0
      INNER JOIN pm_phases     ph ON ph.phase_id   = a.phase_id      AND ph.is_deleted = 0
      WHERE ph.project_id = @projectId
      ORDER BY ph.display_order, a.display_order
    `);

  // 3. Explicit phase-level memberships (pm_phase_members) — for users who
  //    hold a Phase role directly (e.g. Phase Manager) whether or not they
  //    also happen to be in one of that phase's activities.
  const phaseMembersResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT pm2.user_id AS userId,
             pm2.role AS phaseRole,
             ph.phase_id AS phaseId,
             ph.name AS phaseName
      FROM pm_phase_members pm2
      INNER JOIN pm_phases ph ON ph.phase_id = pm2.phase_id AND ph.is_deleted = 0
      WHERE ph.project_id = @projectId
      ORDER BY ph.display_order
    `);

  // Build the hierarchy in memory
  const membersMap = new Map();
  for (const m of membersResult.recordset) {
    membersMap.set(String(m.userId), {
      userId:      m.userId,
      name:        m.name,
      email:       m.email,
      projectRole: m.projectRole,
      phasesMap:   new Map(), // phaseId → { phaseId, phaseName, phaseRole, activitiesMap }
    });
  }

  // Merge explicit phase memberships
  for (const pm of phaseMembersResult.recordset) {
    const uid = String(pm.userId);
    if (!membersMap.has(uid)) continue; // phase member not in project members (edge case)
    const member = membersMap.get(uid);
    if (!member.phasesMap.has(pm.phaseId)) {
      member.phasesMap.set(pm.phaseId, { phaseId: pm.phaseId, phaseName: pm.phaseName, phaseRole: pm.phaseRole, activitiesMap: new Map() });
    } else {
      member.phasesMap.get(pm.phaseId).phaseRole = pm.phaseRole;
    }
  }

  // Merge activity memberships
  for (const am of activityMembersResult.recordset) {
    const uid = String(am.userId);
    // Auto-add to top-level members list if somehow not yet in pm_members
    if (!membersMap.has(uid)) {
      membersMap.set(uid, { userId: am.userId, name: '', email: '', projectRole: 'Member', phasesMap: new Map() });
    }
    const member = membersMap.get(uid);
    if (!member.phasesMap.has(am.phaseId)) {
      member.phasesMap.set(am.phaseId, { phaseId: am.phaseId, phaseName: am.phaseName, phaseRole: null, activitiesMap: new Map() });
    }
    const phase = member.phasesMap.get(am.phaseId);
    phase.activitiesMap.set(am.activityId, { activityId: am.activityId, activityName: am.activityName, activityRole: am.activityRole });
  }

  // Serialise
  return [...membersMap.values()].map(m => ({
    userId:      m.userId,
    name:        m.name,
    email:       m.email,
    projectRole: m.projectRole,
    phases: [...m.phasesMap.values()].map(ph => ({
      phaseId:    ph.phaseId,
      phaseName:  ph.phaseName,
      phaseRole:  ph.phaseRole ?? null,
      activities: [...ph.activitiesMap.values()],
    })),
  }));
}

async function addMember(projectId, targetUserId, role, actorUserId) {
  if (await isInactive('project', projectId)) {
    const e = new Error('This Project is inactive — reactivate it before making changes.');
    e.statusCode = 409; throw e;
  }
  const pool = await getPool();
  await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .input('role',         sql.NVarChar(20),     role)
    .query(`
      IF EXISTS (SELECT 1 FROM pm_members WHERE project_id=@projectId AND user_id=@targetUserId)
        UPDATE pm_members SET role=@role WHERE project_id=@projectId AND user_id=@targetUserId
      ELSE
        INSERT INTO pm_members (project_id,user_id,role) VALUES (@projectId,@targetUserId,@role)
    `);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_added', fieldChanged:'role', newValue:role });
  await resyncProjectActivityThreads(projectId);
}

async function updateMemberRole(projectId, targetUserId, role, actorUserId) {
  if (await isInactive('project', projectId)) {
    const e = new Error('This Project is inactive — reactivate it before making changes.');
    e.statusCode = 409; throw e;
  }
  const pool = await getPool();
  if (role !== 'Manager') {
    const managersResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`SELECT user_id FROM pm_members WHERE project_id=@projectId AND role='Manager'`);
    const remainingManagers = managersResult.recordset.filter(m => String(m.user_id) !== String(targetUserId));
    if (remainingManagers.length === 0) {
      const e = new Error('Cannot demote: this is the only Manager. Assign another Manager first.');
      e.statusCode = 400; throw e;
    }
  }
  const updateResult = await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .input('role',         sql.NVarChar(20),     role)
    .query(`UPDATE pm_members SET role=@role WHERE project_id=@projectId AND user_id=@targetUserId`);
  if (!updateResult.rowsAffected[0]) { const e = new Error('Member not found'); e.statusCode = 404; throw e; }
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_role_changed', fieldChanged:'role', newValue:role });
  await resyncProjectActivityThreads(projectId);
}

async function removeMember(projectId, targetUserId, actorUserId) {
  // A Manager could otherwise remove themselves via this same endpoint they
  // use to remove others — leaving the project managerless with no path
  // back in except an admin re-adding them from outside PM entirely.
  // Self-removal is an admin-only action (done elsewhere), not something
  // exposed on the regular member-management UI.
  if (String(targetUserId) === String(actorUserId)) {
    const e = new Error('You cannot remove yourself from a project — ask an admin or another Manager.');
    e.statusCode = 403; throw e;
  }
  if (await isInactive('project', projectId)) {
    const e = new Error('This Project is inactive — reactivate it before making changes.');
    e.statusCode = 409; throw e;
  }
  const pool = await getPool();
  const memberResult = await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`SELECT role FROM pm_members WHERE project_id=@projectId AND user_id=@targetUserId`);
  if (memberResult.recordset[0]?.role === 'Manager') {
    const managersResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`SELECT user_id FROM pm_members WHERE project_id=@projectId AND role='Manager'`);
    if (managersResult.recordset.length <= 1) {
      const e = new Error('Cannot remove: this is the only Manager. Assign another Manager first.');
      e.statusCode = 400; throw e;
    }
  }
  // Cascade, deepest first: task assignments, then Activity-level and
  // Phase-level overrides they held anywhere in this project. Without this
  // a project removal leaves stale rows behind at every level below it —
  // besides the access-leak this session flagged (removed member keeps
  // working already-assigned tasks), a stale Activity/Phase Manager row
  // would silently reactivate if they're ever re-added to the project at
  // a lower role, handing back access nobody explicitly re-granted.
  await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE r FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks      t  ON t.task_id      = r.task_id
      INNER JOIN pm_activities a  ON a.activity_id  = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id    = a.phase_id
      WHERE ph.project_id=@projectId AND r.assignee_id=@targetUserId
    `);
  await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE ta FROM pm_task_assignees ta
      INNER JOIN pm_tasks      t  ON t.task_id      = ta.task_id
      INNER JOIN pm_activities a  ON a.activity_id  = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id    = a.phase_id
      WHERE ph.project_id=@projectId AND ta.user_id=@targetUserId
    `);
  await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE am FROM pm_activity_members am
      INNER JOIN pm_activities a  ON a.activity_id = am.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id   = a.phase_id
      WHERE ph.project_id=@projectId AND am.user_id=@targetUserId
    `);
  await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`
      DELETE pm2 FROM pm_phase_members pm2
      INNER JOIN pm_phases ph ON ph.phase_id = pm2.phase_id
      WHERE ph.project_id=@projectId AND pm2.user_id=@targetUserId
    `);

  await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_members WHERE project_id=@projectId AND user_id=@targetUserId`);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_removed' });
  await resyncProjectActivityThreads(projectId);
}

module.exports = {
  listProjects, getProject, createProject, updateProject, deleteProject, reactivateProject,
  getMembers, getProjectMembersHierarchy, addMember, updateMemberRole, removeMember,
};