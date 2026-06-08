const { getPool } = require('../../../config/db');

async function log({ entityType, entityId, projectId, userId, action, fieldChanged, oldValue, newValue }) {
  try {
    await getPool().query(
      `INSERT INTO pm_audit_log (entity_type,entity_id,project_id,user_id,action,field_changed,old_value,new_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entityType, entityId, projectId ?? null, userId ?? null, action,
       fieldChanged ?? null,
       oldValue  != null ? String(oldValue)  : null,
       newValue  != null ? String(newValue)  : null]
    );
  } catch (err) { console.error('[pm:audit]', err.message); }
}

async function getProjectAudit(projectId) {
  const { rows } = await getPool().query(
    `SELECT a.id, a.entity_type AS "entityType", a.entity_id AS "entityId",
            a.action, a.field_changed AS "fieldChanged",
            a.old_value AS "oldValue", a.new_value AS "newValue",
            a.changed_at AS "changedAt",
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS "userName"
     FROM pm_audit_log a
     LEFT JOIN auth_users u ON u.user_id = a.user_id
     WHERE a.project_id = $1
     ORDER BY a.changed_at DESC LIMIT 500`,
    [projectId]
  );
  return rows;
}

module.exports = { log, getProjectAudit };