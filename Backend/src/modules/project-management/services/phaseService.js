const { getPool } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded } = require('./dependencyService');
const { getPhaseProgress } = require('./progressService');
const { broadcastStatusChanged, broadcastUnblocked } = require('../socket/socketHandler');

async function getPhasesForProject(projectId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ph.phase_id AS "phaseId", ph.project_id AS "projectId",
            ph.name, ph.description, ph.display_order AS "displayOrder",
            ph.planned_start AS "plannedStart", ph.planned_end AS "plannedEnd",
            ph.status, ph.status_override AS "statusOverride", ph.created_at AS "createdAt",
            (ph.planned_end < CURRENT_DATE AND ph.status <> 'Completed') AS "isOverdue",
            COALESCE((SELECT JSON_AGG(depends_on_phase_id) FROM pm_phase_deps WHERE phase_id=ph.phase_id),'[]') AS "dependsOn"
     FROM pm_phases ph WHERE ph.project_id=$1 AND NOT ph.is_deleted ORDER BY ph.display_order`,
    [projectId]
  );
  for (const ph of rows) ph.progress = await getPhaseProgress(ph.phaseId);
  return rows;
}

async function createPhase(projectId, userId, body) {
  const { name, description, plannedStart, plannedEnd, displayOrder } = body;
  if (!name?.trim()) { const e = new Error('Phase name required'); e.statusCode=400; throw e; }
  // Assign display_order = next integer in sequence (1-based)
  const { rows: orderRow } = await getPool().query(
    `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM pm_phases WHERE project_id=$1 AND NOT is_deleted`,
    [projectId]
  );
  const nextOrder = displayOrder ?? orderRow[0].next_order;

  const { rows } = await getPool().query(
    `INSERT INTO pm_phases (project_id,name,description,planned_start,planned_end,display_order)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING phase_id AS "phaseId", name, status, display_order AS "displayOrder"`,
    [projectId, name.trim(), description||null, plannedStart||null, plannedEnd||null, nextOrder]
  );
  await audit.log({ entityType:'phase', entityId:rows[0].phaseId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
  return rows[0];
}

async function updatePhase(phaseId, projectId, userId, body) {
  const fields = {};
  if (body.name         !== undefined) fields.name          = body.name.trim();
  if (body.description  !== undefined) fields.description   = body.description;
  if (body.plannedStart !== undefined) fields.planned_start = body.plannedStart;
  if (body.plannedEnd   !== undefined) fields.planned_end   = body.plannedEnd;
  if (body.displayOrder !== undefined) fields.display_order = body.displayOrder;
  const keys = Object.keys(fields);
  if (!keys.length) return {};
  const set = keys.map((k,i)=>`${k}=$${i+2}`).join(', ');
  await getPool().query(`UPDATE pm_phases SET ${set} WHERE phase_id=$1`, [phaseId,...keys.map(k=>fields[k])]);
  for (const key of keys) await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  return { phaseId, ...fields };
}

async function updatePhaseStatus(phaseId, projectId, userId, newStatus) {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT status FROM pm_phases WHERE phase_id=$1 AND NOT is_deleted`, [phaseId]);
  if (!rows[0]) { const e = new Error('Phase not found'); e.statusCode=404; throw e; }
  const oldStatus = rows[0].status;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE pm_phases SET status=$1,status_override=TRUE WHERE phase_id=$2`, [newStatus, phaseId]);
    const unblockedIds = newStatus === 'Completed' ? await resolveUnblocked(client, 'phase', phaseId) : [];
    await client.query('COMMIT');
    await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'status_changed', fieldChanged:'status', oldValue:oldStatus, newValue:newStatus });
    broadcastStatusChanged(projectId, { entityType:'phase', entityId:phaseId, status:newStatus });
    if (unblockedIds.length) broadcastUnblocked(projectId, { entityType:'phase', unblockedIds });
    return { phaseId, status:newStatus, unblockedPhaseIds:unblockedIds };
  } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function deletePhase(phaseId, projectId, userId) {
  await getPool().query(`UPDATE pm_phases SET is_deleted=TRUE WHERE phase_id=$1`, [phaseId]);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'deleted' });
}

async function addPhaseDep(phaseId, dependsOnId, projectId, userId) {
  await getPool().query(`INSERT INTO pm_phase_deps (phase_id,depends_on_phase_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [phaseId, dependsOnId]);
  await blockIfNeeded(getPool(), 'phase', phaseId, dependsOnId);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'dependency_added', newValue:dependsOnId });
}

async function removePhaseDep(phaseId, dependsOnId, projectId, userId) {
  await getPool().query(`DELETE FROM pm_phase_deps WHERE phase_id=$1 AND depends_on_phase_id=$2`, [phaseId, dependsOnId]);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'dependency_removed', oldValue:dependsOnId });
}

async function reorderPhase(projectId, phaseId, direction) {
  const pool = getPool();
  // Get all phases sorted by display_order
  const { rows: phases } = await pool.query(
    `SELECT phase_id, display_order FROM pm_phases
     WHERE project_id=$1 AND NOT is_deleted ORDER BY display_order, phase_id`,
    [projectId]
  );

  const idx = phases.findIndex(p => p.phase_id === parseInt(phaseId, 10));
  if (idx === -1) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= phases.length) return;

  const current = phases[idx];
  const swap    = phases[swapIdx];

  // Swap display_order values
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE pm_phases SET display_order=$1 WHERE phase_id=$2`, [swap.display_order, current.phase_id]);
    await client.query(`UPDATE pm_phases SET display_order=$1 WHERE phase_id=$2`, [current.display_order, swap.phase_id]);
    await client.query('COMMIT');
  } catch(err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

module.exports = { getPhasesForProject, createPhase, updatePhase, updatePhaseStatus, deletePhase, addPhaseDep, removePhaseDep, reorderPhase };