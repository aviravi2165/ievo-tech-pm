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

module.exports = { log, getProjectAudit };
