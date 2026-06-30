'use strict';

/**
 * Progress computed on fetch — never stored (PRD §5.4)
 * Task Done=100, else 0. Activity=avg tasks. Phase=avg activities. Project=avg phases.
 */
const { getPool, sql } = require('../../../config/db');

async function getProjectProgress(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT ROUND(AVG(phase_progress), 0) AS progress FROM (
        SELECT ph.phase_id,
          COALESCE((
            SELECT AVG(CASE WHEN t.status='Done' THEN 100.0 ELSE 0 END)
            FROM pm_tasks t INNER JOIN pm_activities a ON a.activity_id=t.activity_id
            WHERE a.phase_id=ph.phase_id AND t.is_deleted=0 AND a.is_deleted=0
          ), 0) AS phase_progress
        FROM pm_phases ph WHERE ph.project_id=@projectId AND ph.is_deleted=0
      ) sub
    `);
  return parseInt(result.recordset[0]?.progress || 0, 10);
}

async function getPhaseProgress(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`
      SELECT ROUND(AVG(CASE WHEN t.status='Done' THEN 100.0 ELSE 0 END), 0) AS progress
      FROM pm_tasks t INNER JOIN pm_activities a ON a.activity_id=t.activity_id
      WHERE a.phase_id=@phaseId AND t.is_deleted=0 AND a.is_deleted=0
    `);
  return parseInt(result.recordset[0]?.progress || 0, 10);
}

async function getActivityProgress(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT ROUND(AVG(CASE WHEN status='Done' THEN 100.0 ELSE 0 END), 0) AS progress
      FROM pm_tasks WHERE activity_id=@activityId AND is_deleted=0
    `);
  return parseInt(result.recordset[0]?.progress || 0, 10);
}

module.exports = { getProjectProgress, getPhaseProgress, getActivityProgress };
