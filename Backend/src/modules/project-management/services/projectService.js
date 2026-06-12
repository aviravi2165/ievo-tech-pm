const { getPool } = require('../../../config/db');
const audit = require('./auditService');
const { getProjectProgress } = require('./progressService');

async function listProjects(userId) {
  const { rows } = await getPool().query(
    `SELECT p.project_id AS "projectId", p.name, p.description, p.status,
            p.planned_start AS "plannedStart", p.planned_end AS "plannedEnd",
            p.created_at AS "createdAt", pm.role AS "myRole",
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''),u.email) AS "ownerName",
            (p.planned_end < CURRENT_DATE AND p.status NOT IN ('Completed','Cancelled')) AS "isOverdue",
            (SELECT COUNT(*) FROM pm_phases ph WHERE ph.project_id=p.project_id AND NOT ph.is_deleted) AS "phaseCount",
            (SELECT COUNT(*) FROM pm_members WHERE project_id=p.project_id) AS "memberCount"
     FROM pm_projects p
     JOIN pm_members pm ON pm.project_id=p.project_id AND pm.user_id=$1
     LEFT JOIN auth_users u ON u.user_id=p.owner_id
     WHERE NOT p.is_deleted ORDER BY p.modified_at DESC`,
    [userId]
  );
  return rows;
}

async function getProject(projectId, userId) {
  const pool = getPool();
  const { rows: proj } = await pool.query(
    `SELECT p.project_id AS "projectId", p.name, p.description, p.status,
            p.planned_start AS "plannedStart", p.planned_end AS "plannedEnd",
            p.dept_id AS "deptId", p.created_at AS "createdAt", p.modified_at AS "modifiedAt",
            pm.role AS "myRole",
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''),u.email) AS "ownerName",
            (p.planned_end < CURRENT_DATE AND p.status NOT IN ('Completed','Cancelled')) AS "isOverdue"
     FROM pm_projects p
     JOIN pm_members pm ON pm.project_id=p.project_id AND pm.user_id=$2
     LEFT JOIN auth_users u ON u.user_id=p.owner_id
     WHERE p.project_id=$1 AND NOT p.is_deleted`,
    [projectId, userId]
  );
  if (!proj[0]) { const e = new Error('Project not found or access denied'); e.statusCode = 404; throw e; }

  const { rows: members } = await pool.query(
    `SELECT m.user_id AS "userId", m.role, m.added_at AS "addedAt",
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''),u.email) AS "name", u.email
     FROM pm_members m LEFT JOIN auth_users u ON u.user_id=m.user_id
     WHERE m.project_id=$1 ORDER BY m.role, u.first_name`,
    [projectId]
  );
  const progress = await getProjectProgress(projectId);
  return { ...proj[0], members, progress };
}

async function createProject(userId, body) {
  const { name, description, plannedStart, plannedEnd, deptId } = body;
  if (!name?.trim()) { const e = new Error('Project name is required'); e.statusCode = 400; throw e; }
  const pool = getPool(); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO pm_projects (name,description,planned_start,planned_end,dept_id,owner_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING project_id AS "projectId", name, status`,
      [name.trim(), description||null, plannedStart||null, plannedEnd||null, deptId||null, userId]
    );
    const p = rows[0];
    await client.query(`INSERT INTO pm_members (project_id,user_id,role) VALUES ($1,$2,'Manager')`, [p.projectId, userId]);
    await client.query('COMMIT');
    await audit.log({ entityType:'project', entityId:p.projectId, projectId:p.projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
    return p;
  } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function updateProject(projectId, userId, body) {
  const pool = getPool();
  const fields = {};
  if (body.name         !== undefined) fields.name          = body.name.trim();
  if (body.description  !== undefined) fields.description   = body.description;
  if (body.status       !== undefined) fields.status        = body.status;
  if (body.plannedStart !== undefined) fields.planned_start = body.plannedStart;
  if (body.plannedEnd   !== undefined) fields.planned_end   = body.plannedEnd;
  if (body.deptId       !== undefined) fields.dept_id       = body.deptId;
  const keys = Object.keys(fields);
  if (!keys.length) return {};
  const set = keys.map((k,i) => `${k}=$${i+2}`).join(', ');
  await pool.query(`UPDATE pm_projects SET ${set}, modified_at=NOW() WHERE project_id=$1`, [projectId,...keys.map(k=>fields[k])]);
  for (const key of keys) {
    await audit.log({ entityType:'project', entityId:projectId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  }
  return { projectId, ...fields };
}

async function deleteProject(projectId, userId) {
  await getPool().query(`UPDATE pm_projects SET is_deleted=TRUE,modified_at=NOW() WHERE project_id=$1`, [projectId]);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId, action:'deleted' });
}

async function getMembers(projectId) {
  const { rows } = await getPool().query(
    `SELECT m.user_id AS "userId", m.role, m.added_at AS "addedAt",
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''),u.email) AS "name", u.email
     FROM pm_members m LEFT JOIN auth_users u ON u.user_id=m.user_id
     WHERE m.project_id=$1 ORDER BY m.role, u.first_name`, [projectId]
  );
  return rows;
}

async function addMember(projectId, targetUserId, role, actorUserId) {
  await getPool().query(
    `INSERT INTO pm_members (project_id,user_id,role) VALUES ($1,$2,$3)
     ON CONFLICT (project_id,user_id) DO UPDATE SET role=$3`,
    [projectId, targetUserId, role]
  );
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_added', fieldChanged:'role', newValue:role });
}

async function updateMemberRole(projectId, targetUserId, role, actorUserId) {
  const pool = getPool();
  // Safety: if downgrading someone, ensure at least one other Manager remains
  if (role !== 'Manager') {
    const { rows: managers } = await pool.query(
      `SELECT user_id FROM pm_members WHERE project_id=$1 AND role='Manager'`,
      [projectId]
    );
    const remainingManagers = managers.filter(m => String(m.user_id) !== String(targetUserId));
    if (remainingManagers.length === 0) {
      const e = new Error('Cannot demote: this is the only Manager. Assign another Manager first.');
      e.statusCode = 400; throw e;
    }
  }
  const { rowCount } = await pool.query(
    `UPDATE pm_members SET role=$3 WHERE project_id=$1 AND user_id=$2`, [projectId, targetUserId, role]
  );
  if (!rowCount) { const e = new Error('Member not found'); e.statusCode=404; throw e; }
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_role_changed', fieldChanged:'role', newValue:role });
}

async function removeMember(projectId, targetUserId, actorUserId) {
  const pool = getPool();
  // Safety: prevent removing the last Manager
  const { rows: m } = await pool.query(`SELECT role FROM pm_members WHERE project_id=$1 AND user_id=$2`, [projectId, targetUserId]);
  if (m[0]?.role === 'Manager') {
    const { rows: managers } = await pool.query(`SELECT user_id FROM pm_members WHERE project_id=$1 AND role='Manager'`, [projectId]);
    if (managers.length <= 1) {
      const e = new Error('Cannot remove: this is the only Manager. Assign another Manager first.');
      e.statusCode = 400; throw e;
    }
  }
  await pool.query(`DELETE FROM pm_members WHERE project_id=$1 AND user_id=$2`, [projectId, targetUserId]);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_removed' });
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject, getMembers, addMember, updateMemberRole, removeMember };