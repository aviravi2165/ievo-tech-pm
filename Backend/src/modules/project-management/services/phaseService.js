'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { blockIfNeeded, isInactive } = require('./dependencyService');
const { getPhaseProgress, deriveStatus, getPhaseHasActiveWork } = require('./progressService');
const { getPhaseDelayDays, getOverdueDays } = require('./delayService');
const { getEffectivePhaseRole } = require('./roleService');
const pmChatService = require('./pmChatService');

function parseIdList(val) {
  if (!val) return [];
  return String(val).split(',').filter(Boolean).map(Number);
}

// userId is the REQUESTING user — used to compute their effective role on
// each phase (explicit phase-level row, else inherited from their project
// role; see roleService). Without this, the frontend had no way to know a
// Phase Manager should get full management controls for that phase even
// when they're only a plain Member at the project level — it was gating
// every "can I edit this phase" check on the flat project-level role only.
async function getPhasesForProject(projectId, userId, isAdmin = false) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT ph.phase_id AS phaseId, ph.project_id AS projectId,
             ph.name, ph.description, ph.display_order AS displayOrder,
             ph.planned_start AS plannedStart, ph.planned_end AS plannedEnd,
             ph.status, ph.status_override AS statusOverride, ph.created_at AS createdAt,
             ph.is_active AS ownIsActive, parentProj.is_active AS parentProjectActive,
             -- Raw "past its own planned_end" only — status exclusion
             -- applied in JS below against the DERIVED status; see the
             -- matching comment in activityService.getActivitiesForPhase
             -- for why gating this on the raw ph.status column was wrong.
             CASE WHEN ph.planned_end < CAST(GETDATE() AS DATE)
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS plannedEndPassed,
             (
               SELECT STRING_AGG(CAST(depends_on_phase_id AS VARCHAR(20)), ',')
               FROM pm_phase_deps WHERE phase_id = ph.phase_id
             ) AS dependsOn,
             -- Phase member count + Manager names, same fields
             -- activityService already exposes — used so the Assignee
             -- column has something real to show for a Phase row instead
             -- of sitting blank with no explanation of what it even means.
             (
               SELECT COUNT(*) FROM pm_phase_members WHERE phase_id = ph.phase_id
             ) AS memberCount,
             (
               SELECT STRING_AGG(COALESCE(NULLIF(TRIM(CONCAT(mu.first_name,' ',mu.last_name)),''), mu.email), ', ')
               FROM pm_phase_members mgr
               INNER JOIN auth_users mu ON mu.user_id = mgr.user_id
               WHERE mgr.phase_id = ph.phase_id AND mgr.role = 'Manager'
             ) AS managerNames
      FROM pm_phases ph
      INNER JOIN pm_projects parentProj ON parentProj.project_id = ph.project_id
      WHERE ph.project_id=@projectId AND ph.is_deleted=0
      ORDER BY ph.is_active DESC, ph.display_order
    `);
  const rows = result.recordset.map(r => ({ ...r, dependsOn: parseIdList(r.dependsOn) }));
  for (const ph of rows) {
    ph.progress = await getPhaseProgress(ph.phaseId);
    // If phase reached 100% but DB still says Blocked (stale from a dep that
    // was added before its predecessor was done), clear it now so deriveStatus
    // can return Completed correctly.
    if (ph.progress >= 100 && ph.status === 'Blocked') {
      await pool.request()
        .input('phaseId', sql.Int, ph.phaseId)
        .query(`UPDATE pm_phases SET status = 'To Do' WHERE phase_id = @phaseId AND status = 'Blocked'`);
      ph.status = 'To Do'; // will become Completed via deriveStatus below
    }
    ph.status = deriveStatus(ph.progress, ph.status, await getPhaseHasActiveWork(ph.phaseId));
    ph.isOverdue = Boolean(ph.plannedEndPassed) && ph.status !== 'Completed';
    ph.overdueDays = ph.isOverdue ? getOverdueDays(ph.plannedEnd) : 0;
    delete ph.plannedEndPassed;
    ph.delayDays = ph.status === 'Completed' ? 0 : await getPhaseDelayDays(ph.phaseId, ph.plannedEnd);
    // Cascade: a Phase under an inactive Project reads as inactive too.
    ph.isActive = ph.ownIsActive !== false && ph.parentProjectActive !== false;
    delete ph.ownIsActive; delete ph.parentProjectActive;
    ph.myRole = userId ? (await getEffectivePhaseRole(userId, ph.phaseId, isAdmin)).role : null;
    // Real status-history tracking for Timeline segmented bars — see
    // auditService.recordStatusIfChanged's comment for why this lives here
    // (on every read) rather than only on direct write actions.
    audit.recordStatusIfChanged('phase', ph.phaseId, ph.projectId, ph.status).catch(() => {});
  }
  return rows;
}

async function createPhase(projectId, userId, body) {
  const { name, description, plannedStart, plannedEnd, displayOrder } = body;
  if (!name?.trim()) { const e = new Error('Phase name required'); e.statusCode = 400; throw e; }
  if (name.trim().length > 200) { const e = new Error('Phase name must be 200 characters or fewer'); e.statusCode = 400; throw e; }

  if (await isInactive('project', projectId)) {
    const e = new Error('This Project is inactive — reactivate it before adding phases.');
    e.statusCode = 409; throw e;
  }

  if (plannedStart && plannedEnd && new Date(plannedEnd) < new Date(plannedStart)) {
    const e = new Error("Phase end date can't be before its start date."); e.statusCode = 400; throw e;
  }

  const pool = await getPool();

  // A Phase can't be planned to start before its own Project — but it CAN
  // be planned (or run) past the Project's planned_end: that's a real
  // schedule delay, not an invalid input, and it's exactly what
  // delayService.getProjectDelayDays surfaces (it compares each Phase's
  // planned_end against the Project's own and bubbles up the overrun as
  // delayDays) rather than something to reject at write time.
  if (plannedStart) {
    const projResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`SELECT planned_start AS plannedStart FROM pm_projects WHERE project_id=@projectId`);
    const projectStart = projResult.recordset[0]?.plannedStart;
    if (projectStart && new Date(plannedStart) < new Date(projectStart)) {
      const e = new Error("Phase start date can't be before its Project's planned start date.");
      e.statusCode = 400; throw e;
    }
  }

  // Assign display_order = next integer in sequence (1-based)
  const orderResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM pm_phases WHERE project_id=@projectId AND is_deleted=0`);
  const nextOrder = displayOrder ?? orderResult.recordset[0].next_order;

  const result = await pool.request()
    .input('projectId',    sql.Int,               projectId)
    .input('name',         sql.NVarChar(200),     name.trim())
    .input('description',  sql.NVarChar(sql.MAX), description || null)
    .input('plannedStart', sql.Date,              plannedStart || null)
    .input('plannedEnd',   sql.Date,              plannedEnd || null)
    .input('displayOrder', sql.Int,               nextOrder)
    .query(`
      INSERT INTO pm_phases (project_id,name,description,planned_start,planned_end,display_order)
      OUTPUT INSERTED.phase_id AS phaseId, INSERTED.name, INSERTED.status, INSERTED.display_order AS displayOrder
      VALUES (@projectId,@name,@description,@plannedStart,@plannedEnd,@displayOrder)
    `);
  const row = result.recordset[0];
  await audit.log({ entityType:'phase', entityId:row.phaseId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
  return row;
}

const PHASE_FIELD_TYPES = {
  name:          sql.NVarChar(200),
  description:   sql.NVarChar(sql.MAX),
  planned_start: sql.Date,
  planned_end:   sql.Date,
  display_order: sql.Int,
};

async function updatePhase(phaseId, projectId, userId, body) {
  if (await isInactive('phase', phaseId) || await isInactive('project', projectId)) {
    const e = new Error('This Phase is inactive — reactivate it before making changes.');
    e.statusCode = 409; throw e;
  }
  if (body.plannedStart !== undefined && body.plannedStart) {
    const pool0 = await getPool();
    const projResult = await pool0.request()
      .input('projectId', sql.Int, projectId)
      .query(`SELECT planned_start AS plannedStart FROM pm_projects WHERE project_id=@projectId`);
    const projectStart = projResult.recordset[0]?.plannedStart;
    if (projectStart && new Date(body.plannedStart) < new Date(projectStart)) {
      const e = new Error("Phase start date can't be before its Project's planned start date.");
      e.statusCode = 400; throw e;
    }
  }
  if (body.name !== undefined) {
    if (!body.name.trim()) { const e = new Error('Phase name required'); e.statusCode = 400; throw e; }
    if (body.name.trim().length > 200) { const e = new Error('Phase name must be 200 characters or fewer'); e.statusCode = 400; throw e; }
  }
  if (body.plannedStart !== undefined || body.plannedEnd !== undefined) {
    const pool1 = await getPool();
    const cur = await pool1.request().input('phaseId', sql.Int, phaseId)
      .query(`SELECT planned_start AS plannedStart, planned_end AS plannedEnd FROM pm_phases WHERE phase_id=@phaseId`);
    const row0 = cur.recordset[0] || {};
    const effStart = body.plannedStart !== undefined ? body.plannedStart : row0.plannedStart;
    const effEnd   = body.plannedEnd   !== undefined ? body.plannedEnd   : row0.plannedEnd;
    if (effStart && effEnd && new Date(effEnd) < new Date(effStart)) {
      const e = new Error("Phase end date can't be before its start date."); e.statusCode = 400; throw e;
    }
  }
  const fields = {};
  if (body.name         !== undefined) fields.name          = body.name.trim();
  if (body.description  !== undefined) fields.description   = body.description;
  if (body.plannedStart !== undefined) fields.planned_start = body.plannedStart;
  if (body.plannedEnd   !== undefined) fields.planned_end   = body.plannedEnd;
  if (body.displayOrder !== undefined) fields.display_order = body.displayOrder;
  const keys = Object.keys(fields);
  if (!keys.length) return {};

  const pool = await getPool();
  const req  = pool.request().input('phaseId', sql.Int, phaseId);
  const set  = keys.map((k, i) => {
    const ph = `f${i}`;
    req.input(ph, PHASE_FIELD_TYPES[k], fields[k]);
    return `${k}=@${ph}`;
  }).join(', ');
  await req.query(`UPDATE pm_phases SET ${set} WHERE phase_id=@phaseId`);

  for (const key of keys) await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  return { phaseId, ...fields };
}

// Delete only when empty (no activities) — otherwise deactivate, preserving
// data underneath instead of orphaning it from view.
async function deletePhase(phaseId, projectId, userId) {
  const pool = await getPool();
  const childResult = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);

  if (childResult.recordset[0].cnt > 0) {
    await pool.request()
      .input('phaseId', sql.Int, phaseId)
      .query(`UPDATE pm_phases SET is_active=0 WHERE phase_id=@phaseId`);
    await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'deactivated' });
    await pmChatService.setActivityThreadsDisabledForPhase(phaseId, true);
    return { action: 'deactivated' };
  }

  await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`UPDATE pm_phases SET is_deleted=1 WHERE phase_id=@phaseId`);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'deleted' });
  return { action: 'deleted' };
}

async function reactivatePhase(phaseId, projectId, userId) {
  const pool = await getPool();

  // Same gap as activityService.reactivateActivity: the Reactivate button
  // reads as available whenever the Phase's CASCADED isActive is false,
  // which also fires when only the Project is inactive and this Phase's
  // own row was never touched — flipping pm_phases.is_active=1 then is a
  // silent no-op. Point the user at the Project instead of letting the
  // click appear to do nothing.
  if (!(await isInactive('phase', phaseId)) && await isInactive('project', projectId)) {
    const e = new Error("This Phase is inactive because its Project is inactive — reactivate the Project instead.");
    e.statusCode = 409; throw e;
  }

  await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`UPDATE pm_phases SET is_active=1 WHERE phase_id=@phaseId`);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'reactivated' });
  await pmChatService.setActivityThreadsDisabledForPhase(phaseId, false);
}

// Permanent removal — only reachable once the Phase is already deactivated
// (same two-step convention as the messages module's thread hard-delete:
// disable first, delete second) AND already empty of live Activities.
// Deliberately does NOT cascade is_deleted=1 down through children in one
// shot the way an earlier draft of this function did — that raw approach
// bypasses resolveUnblocked (dependencyService.js), which is exactly the
// bug deleteTask's own comment above warns about: an entity's row going to
// is_deleted=1 without resolveUnblocked running first leaves anything that
// depended on it permanently stuck Blocked, since resolveUnblocked's own
// query requires is_deleted=0 to even see the dependency. Requiring the
// Phase to already be empty means each descendant went through its OWN
// hardDeleteActivity/hardDeleteTask call first, which already ran the
// correct unblock sequence at that level — nothing here needs to redo it.
async function hardDeletePhase(phaseId, projectId, userId) {
  const pool = await getPool();
  const phaseResult = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`
      SELECT ph.is_active AS ownActive, pr.is_active AS projectActive
      FROM pm_phases ph
      INNER JOIN pm_projects pr ON pr.project_id = ph.project_id
      WHERE ph.phase_id=@phaseId AND ph.is_deleted=0
    `);
  const phase = phaseResult.recordset[0];
  if (!phase) { const e = new Error('Phase not found'); e.statusCode = 404; throw e; }
  // Same cascaded-vs-own mismatch as taskService.hardDeleteTask — a Phase
  // reading Inactive in the list because its Project is inactive, even
  // though the Phase's own row was never explicitly deactivated, should
  // satisfy this guard too.
  const isActive = phase.ownActive !== false && phase.projectActive !== false;
  if (isActive) {
    const e = new Error('Deactivate this Phase before permanently deleting it.');
    e.statusCode = 409; throw e;
  }

  const childResult = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);
  if (childResult.recordset[0].cnt > 0) {
    const e = new Error('Permanently delete every Activity under this Phase first.');
    e.statusCode = 409; throw e;
  }

  await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`UPDATE pm_phases SET is_deleted=1 WHERE phase_id=@phaseId`);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'hard_deleted' });
}

async function addPhaseDep(phaseId, dependsOnId, projectId, userId) {
  // Dependencies are same-level only: a phase may only depend on another
  // phase within its own Project (mirrors what the UI's dropdown already
  // offers, enforced here so the API can't be used to link across Projects).
  const pool = await getPool();
  const scopeResult = await pool.request()
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`SELECT project_id AS depProjectId FROM pm_phases WHERE phase_id=@dependsOnId`);
  const depProjectId = scopeResult.recordset[0]?.depProjectId;
  if (!depProjectId) { const e = new Error('Dependency phase not found'); e.statusCode = 404; throw e; }
  if (String(depProjectId) !== String(projectId)) {
    const e = new Error('Phases can only depend on other phases within the same project'); e.statusCode = 400; throw e;
  }

  await withTransaction(async (req) => {
    await req()
      .input('phaseId',     sql.Int, phaseId)
      .input('dependsOnId', sql.Int, dependsOnId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_phase_deps WHERE phase_id=@phaseId AND depends_on_phase_id=@dependsOnId)
          INSERT INTO pm_phase_deps (phase_id,depends_on_phase_id) VALUES (@phaseId,@dependsOnId)
      `);
    await blockIfNeeded(req, 'phase', phaseId, dependsOnId);
  });
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'dependency_added', newValue:dependsOnId });
}

async function removePhaseDep(phaseId, dependsOnId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('phaseId',     sql.Int, phaseId)
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`DELETE FROM pm_phase_deps WHERE phase_id=@phaseId AND depends_on_phase_id=@dependsOnId`);

  // Re-evaluate: if no remaining unresolved deps, unblock the phase
  await withTransaction(async (req) => {
    const unresolved = await req()
      .input('phaseId', sql.Int, phaseId)
      .query(`
        SELECT 1 AS x FROM pm_phase_deps d
        INNER JOIN pm_phases e ON e.phase_id = d.depends_on_phase_id
        WHERE d.phase_id = @phaseId AND e.status <> 'Completed' AND e.is_deleted = 0
      `);
    if (!unresolved.recordset.length) {
      await req()
        .input('phaseId', sql.Int, phaseId)
        .query(`UPDATE pm_phases SET status = 'To Do' WHERE phase_id = @phaseId AND status = 'Blocked'`);
    }
  });

  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'dependency_removed', oldValue:dependsOnId });
}

async function reorderPhase(projectId, phaseId, direction) {
  const pool = await getPool();
  const phasesResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT phase_id, display_order FROM pm_phases WHERE project_id=@projectId AND is_deleted=0 ORDER BY display_order, phase_id`);
  const phases = phasesResult.recordset;

  const idx = phases.findIndex(p => p.phase_id === parseInt(phaseId, 10));
  if (idx === -1) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= phases.length) return;

  const current = phases[idx];
  const swap    = phases[swapIdx];

  await withTransaction(async (req) => {
    await req()
      .input('displayOrder', sql.Int, swap.display_order)
      .input('phaseId',      sql.Int, current.phase_id)
      .query(`UPDATE pm_phases SET display_order=@displayOrder WHERE phase_id=@phaseId`);
    await req()
      .input('displayOrder', sql.Int, current.display_order)
      .input('phaseId',      sql.Int, swap.phase_id)
      .query(`UPDATE pm_phases SET display_order=@displayOrder WHERE phase_id=@phaseId`);
  });
}

// ── Status history — Timeline segmented bars ────────────────────────────────
async function getPhaseStatusHistory(phaseId) {
  return audit.getStatusHistory('phase', phaseId);
}

module.exports = { getPhasesForProject, createPhase, updatePhase, deletePhase, reactivatePhase, hardDeletePhase, addPhaseDep, removePhaseDep, reorderPhase, getPhaseStatusHistory };