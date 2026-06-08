/**
 * Progress computed on fetch — never stored (PRD §5.4)
 * Task Done=100, else 0. Activity=avg tasks. Phase=avg activities. Project=avg phases.
 */
const { getPool } = require('../../../config/db');

async function getProjectProgress(projectId) {
  const { rows } = await getPool().query(
    `SELECT ROUND(AVG(phase_progress)) AS progress FROM (
       SELECT ph.phase_id,
         COALESCE((
           SELECT AVG(CASE WHEN t.status='Done' THEN 100.0 ELSE 0 END)
           FROM pm_tasks t JOIN pm_activities a ON a.activity_id=t.activity_id
           WHERE a.phase_id=ph.phase_id AND NOT t.is_deleted AND NOT a.is_deleted
         ), 0) AS phase_progress
       FROM pm_phases ph WHERE ph.project_id=$1 AND NOT ph.is_deleted
     ) sub`, [projectId]
  );
  return parseInt(rows[0]?.progress || 0, 10);
}

async function getPhaseProgress(phaseId) {
  const { rows } = await getPool().query(
    `SELECT ROUND(AVG(CASE WHEN t.status='Done' THEN 100.0 ELSE 0 END)) AS progress
     FROM pm_tasks t JOIN pm_activities a ON a.activity_id=t.activity_id
     WHERE a.phase_id=$1 AND NOT t.is_deleted AND NOT a.is_deleted`, [phaseId]
  );
  return parseInt(rows[0]?.progress || 0, 10);
}

async function getActivityProgress(activityId) {
  const { rows } = await getPool().query(
    `SELECT ROUND(AVG(CASE WHEN status='Done' THEN 100.0 ELSE 0 END)) AS progress
     FROM pm_tasks WHERE activity_id=$1 AND NOT is_deleted`, [activityId]
  );
  return parseInt(rows[0]?.progress || 0, 10);
}

module.exports = { getProjectProgress, getPhaseProgress, getActivityProgress };