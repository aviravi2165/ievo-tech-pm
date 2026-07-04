'use strict';

const { getPool, sql } = require('../../../config/db');
const audit = require('./auditService');

const PHASE_MEMBER_ROLES = ['Manager', 'Employee', 'Viewer'];

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
}

async function removePhaseMember(phaseId, targetUserId, actorUserId, projectId) {
  const pool = await getPool();
  await pool.request()
    .input('phaseId', sql.Int,              phaseId)
    .input('userId',  sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_phase_members WHERE phase_id=@phaseId AND user_id=@userId`);
  await audit.log({ entityType:'phase', entityId:phaseId, projectId, userId:actorUserId, action:'member_removed', oldValue:targetUserId });
}

module.exports = { PHASE_MEMBER_ROLES, getPhaseMembers, addOrUpdatePhaseMember, removePhaseMember };