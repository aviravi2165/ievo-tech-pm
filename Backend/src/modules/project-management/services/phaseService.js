'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded } = require('./dependencyService');
const { getPhaseProgress } = require('./progressService');
const { broadcastStatusChanged, broadcastUnblocked } = require('../socket/socketHandler');

function parseIdList(val) {
  if (!val) return [];
  return String(val).split(',').filter(Boolean).map(Number);
}

async function getPhasesForProject(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT ph.phase_id AS phaseId, ph.project_id AS projectId,
             ph.name, ph.description, ph.display_order AS displayOrder,
             ph.planned_start AS plannedStart, ph.planned_end AS plannedEnd,
             ph.status, ph.status_override AS statusOverride, ph.created_at AS createdAt,
             CASE WHEN ph.planned_end < CAST(GETDATE() AS DATE) AND ph.status <> 'Completed'
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isOverdue,
             (
               SELECT STRING_AGG(CAST(depends_on_phase_id AS VARCHAR(20)), ',')
               FROM pm_phase_deps WHERE phase_id = ph.phase_id
             ) AS dependsOn
      FROM pm_phases ph WHERE ph.project_id=@projectId AND ph.is_deleted=0
      ORDER BY ph.display_order
    `);
  const rows = result.recordset.map(r => ({ ...r, dependsOn: parseIdList(r.dependsOn) }));
  for (const ph of rows) ph.progress = await getPhaseProgress(ph.phaseId);
  return rows;
}

async function createPhase(projectId, userId, body) {
  const { name, description, plannedStart, plannedEnd, displayOrder } = body;
  if (!name?.trim()) { const e = new Error('Phase name required'); e.statusCode = 400; throw e; }

  const pool = await getPool();

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

async function updatePhaseStatus(phaseId, projectId, userId, newStatus) {
  const pool = await getPool();
  const cur = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT status FROM pm_phases WHERE phase_id=@phaseId AND is_deleted=0`);
  if (!cur.recordset[0]) { const e = new Error('Phase not found'); e.statusCode = 404; throw e; }
  const oldStatus = cur.recordset[0].status;

  let unblockedIds = [];
  await withTransaction(async (req) => {
    await req()
      .input('status',  sql.NVarChar(30), newStatus)
      .input('phaseId', sql.Int,          phaseId)
      .query(`UPDATE pm_phases SET status=@status, status_override=1 WHERE phase_id=@phaseId`);
    unblockedIds = newStatus === 'Completed' ? await resolveUnblocked(req, 'phase', phaseId) : [];
  });

  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'status_changed', fieldChanged:'status', oldValue:oldStatus, newValue:newStatus });
  broadcastStatusChanged(projectId, { entityType:'phase', entityId:phaseId, status:newStatus });
  if (unblockedIds.length) broadcastUnblocked(projectId, { entityType:'phase', unblockedIds });
  return { phaseId, status:newStatus, unblockedPhaseIds:unblockedIds };
}

async function deletePhase(phaseId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`UPDATE pm_phases SET is_deleted=1 WHERE phase_id=@phaseId`);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId, action:'deleted' });
}

async function addPhaseDep(phaseId, dependsOnId, projectId, userId) {
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

module.exports = { getPhasesForProject, createPhase, updatePhase, updatePhaseStatus, deletePhase, addPhaseDep, removePhaseDep, reorderPhase };
