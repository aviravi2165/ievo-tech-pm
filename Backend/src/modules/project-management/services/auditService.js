'use strict';

const { getPool, sql } = require('../../../config/db');

async function log({ entityType, entityId, projectId, userId, action, fieldChanged, oldValue, newValue }) {
  try {
    const pool = await getPool();
    await pool.request()
      .input('entityType',   sql.NVarChar(20),     entityType)
      .input('entityId',     sql.Int,              entityId)
      .input('projectId',    sql.Int,              projectId ?? null)
      .input('userId',       sql.UniqueIdentifier, userId ?? null)
      .input('action',       sql.NVarChar(60),     action)
      .input('fieldChanged', sql.NVarChar(100),    fieldChanged ?? null)
      .input('oldValue',     sql.NVarChar(sql.MAX),oldValue != null ? String(oldValue) : null)
      .input('newValue',     sql.NVarChar(sql.MAX),newValue != null ? String(newValue) : null)
      .query(`
        INSERT INTO pm_audit_log (entity_type,entity_id,project_id,user_id,action,field_changed,old_value,new_value)
        VALUES (@entityType,@entityId,@projectId,@userId,@action,@fieldChanged,@oldValue,@newValue)
      `);
  } catch (err) { console.error('[pm:audit]', err.message); }
}

async function getProjectAudit(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT TOP (500)
             a.id, a.entity_type AS entityType, a.entity_id AS entityId,
             a.action, a.field_changed AS fieldChanged,
             a.old_value AS oldValue, a.new_value AS newValue,
             a.changed_at AS changedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS userName
      FROM pm_audit_log a
      LEFT JOIN auth_users u ON u.user_id = a.user_id
      WHERE a.project_id = @projectId
      ORDER BY a.changed_at DESC
    `);
  return result.recordset;
}

module.exports = { log, getProjectAudit, getMyRecentAudit };

async function getMyRecentAudit(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT TOP (60)
        a.id,
        a.entity_type   AS entityType,
        a.entity_id     AS entityId,
        a.project_id    AS projectId,
        a.action,
        a.field_changed AS fieldChanged,
        a.old_value     AS oldValue,
        a.new_value     AS newValue,
        a.changed_at    AS createdAt,
        pr.name         AS projectName,
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email, 'System') AS actorName
      FROM pm_audit_log a
      INNER JOIN pm_projects pr ON pr.project_id = a.project_id
      LEFT  JOIN auth_users  u  ON u.user_id = a.user_id
      WHERE a.project_id IN (
        -- Projects where this user is a direct project member
        SELECT pm.project_id FROM pm_members pm WHERE pm.user_id = @userId
        UNION
        -- Projects where this user is an activity member
        SELECT ph.project_id
        FROM pm_activity_members am
        INNER JOIN pm_activities ac ON ac.activity_id = am.activity_id
        INNER JOIN pm_phases     ph ON ph.phase_id     = ac.phase_id
        WHERE am.user_id = @userId
        UNION
        -- Projects where this user has accepted task assignments
        SELECT ph2.project_id
        FROM pm_task_assignees ta
        INNER JOIN pm_tasks      t2  ON t2.task_id      = ta.task_id
        INNER JOIN pm_activities ac2 ON ac2.activity_id = t2.activity_id
        INNER JOIN pm_phases     ph2 ON ph2.phase_id     = ac2.phase_id
        WHERE ta.user_id = @userId
      )
      ORDER BY a.changed_at DESC
    `);
  return result.recordset;
}