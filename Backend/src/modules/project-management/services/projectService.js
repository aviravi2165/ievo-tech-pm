'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { getProjectProgress } = require('./progressService');

async function listProjects(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT p.project_id AS projectId, p.name, p.description, p.status,
             p.planned_start AS plannedStart, p.planned_end AS plannedEnd,
             p.created_at AS createdAt, pm.role AS myRole,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS ownerName,
             CASE WHEN p.planned_end < CAST(GETDATE() AS DATE) AND p.status NOT IN ('Completed','Cancelled')
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isOverdue,
             (SELECT COUNT(*) FROM pm_phases ph WHERE ph.project_id=p.project_id AND ph.is_deleted=0) AS phaseCount,
             (SELECT COUNT(*) FROM pm_members WHERE project_id=p.project_id) AS memberCount
      FROM pm_projects p
      INNER JOIN pm_members pm ON pm.project_id=p.project_id AND pm.user_id=@userId
      LEFT JOIN auth_users u ON u.user_id=p.owner_id
      WHERE p.is_deleted=0 ORDER BY p.modified_at DESC
    `);
  return result.recordset;
}

async function getProject(projectId, userId) {
  const pool = await getPool();
  const projResult = await pool.request()
    .input('projectId', sql.Int,              projectId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      SELECT p.project_id AS projectId, p.name, p.description, p.status,
             p.planned_start AS plannedStart, p.planned_end AS plannedEnd,
             p.dept_id AS deptId, p.created_at AS createdAt, p.modified_at AS modifiedAt,
             pm.role AS myRole,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS ownerName,
             CASE WHEN p.planned_end < CAST(GETDATE() AS DATE) AND p.status NOT IN ('Completed','Cancelled')
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isOverdue
      FROM pm_projects p
      INNER JOIN pm_members pm ON pm.project_id=p.project_id AND pm.user_id=@userId
      LEFT JOIN auth_users u ON u.user_id=p.owner_id
      WHERE p.project_id=@projectId AND p.is_deleted=0
    `);
  const proj = projResult.recordset[0];
  if (!proj) { const e = new Error('Project not found or access denied'); e.statusCode = 404; throw e; }

  const membersResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT m.user_id AS userId, m.role, m.added_at AS addedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name, u.email
      FROM pm_members m LEFT JOIN auth_users u ON u.user_id=m.user_id
      WHERE m.project_id=@projectId ORDER BY m.role, u.first_name
    `);
  const progress = await getProjectProgress(projectId);
  return { ...proj, members: membersResult.recordset, progress };
}

async function createProject(userId, body) {
  const { name, description, plannedStart, plannedEnd, deptId } = body;
  if (!name?.trim()) { const e = new Error('Project name is required'); e.statusCode = 400; throw e; }

  let project;
  await withTransaction(async (req) => {
    const result = await req()
      .input('name',         sql.NVarChar(200),     name.trim())
      .input('description',  sql.NVarChar(sql.MAX), description || null)
      .input('plannedStart', sql.Date,              plannedStart || null)
      .input('plannedEnd',   sql.Date,              plannedEnd || null)
      .input('deptId',       sql.Int,               deptId || null)
      .input('userId',       sql.UniqueIdentifier,  userId)
      .query(`
        INSERT INTO pm_projects (name,description,planned_start,planned_end,dept_id,owner_id,created_by)
        OUTPUT INSERTED.project_id AS projectId, INSERTED.name, INSERTED.status
        VALUES (@name,@description,@plannedStart,@plannedEnd,@deptId,@userId,@userId)
      `);
    project = result.recordset[0];
    await req()
      .input('projectId', sql.Int,              project.projectId)
      .input('userId',    sql.UniqueIdentifier, userId)
      .query(`INSERT INTO pm_members (project_id,user_id,role) VALUES (@projectId,@userId,'Manager')`);
  });

  await audit.log({ entityType:'project', entityId:project.projectId, projectId:project.projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
  return project;
}

const PROJECT_FIELD_TYPES = {
  name:          sql.NVarChar(200),
  description:   sql.NVarChar(sql.MAX),
  status:        sql.NVarChar(30),
  planned_start: sql.Date,
  planned_end:   sql.Date,
  dept_id:       sql.Int,
};

async function updateProject(projectId, userId, body) {
  const fields = {};
  if (body.name         !== undefined) fields.name          = body.name.trim();
  if (body.description  !== undefined) fields.description   = body.description;
  if (body.status       !== undefined) fields.status        = body.status;
  if (body.plannedStart !== undefined) fields.planned_start = body.plannedStart;
  if (body.plannedEnd   !== undefined) fields.planned_end   = body.plannedEnd;
  if (body.deptId       !== undefined) fields.dept_id       = body.deptId;
  const keys = Object.keys(fields);
  if (!keys.length) return {};

  const pool = await getPool();
  const req  = pool.request().input('projectId', sql.Int, projectId);
  const set  = keys.map((k, i) => {
    const ph = `f${i}`;
    req.input(ph, PROJECT_FIELD_TYPES[k], fields[k]);
    return `${k}=@${ph}`;
  }).join(', ');
  await req.query(`UPDATE pm_projects SET ${set}, modified_at=SYSDATETIMEOFFSET() WHERE project_id=@projectId`);

  for (const key of keys) {
    await audit.log({ entityType:'project', entityId:projectId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  }
  return { projectId, ...fields };
}

async function deleteProject(projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`UPDATE pm_projects SET is_deleted=1, modified_at=SYSDATETIMEOFFSET() WHERE project_id=@projectId`);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId, action:'deleted' });
}

async function getMembers(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT m.user_id AS userId, m.role, m.added_at AS addedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name, u.email
      FROM pm_members m LEFT JOIN auth_users u ON u.user_id=m.user_id
      WHERE m.project_id=@projectId ORDER BY m.role, u.first_name
    `);
  return result.recordset;
}

async function addMember(projectId, targetUserId, role, actorUserId) {
  const pool = await getPool();
  await pool.request()
    .input('projectId',     sql.Int,              projectId)
    .input('targetUserId',  sql.UniqueIdentifier, targetUserId)
    .input('role',          sql.NVarChar(20),     role)
    .query(`
      IF EXISTS (SELECT 1 FROM pm_members WHERE project_id=@projectId AND user_id=@targetUserId)
        UPDATE pm_members SET role=@role WHERE project_id=@projectId AND user_id=@targetUserId
      ELSE
        INSERT INTO pm_members (project_id,user_id,role) VALUES (@projectId,@targetUserId,@role)
    `);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_added', fieldChanged:'role', newValue:role });
}

async function updateMemberRole(projectId, targetUserId, role, actorUserId) {
  const pool = await getPool();
  // Safety: if downgrading someone, ensure at least one other Manager remains
  if (role !== 'Manager') {
    const managersResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`SELECT user_id FROM pm_members WHERE project_id=@projectId AND role='Manager'`);
    const remainingManagers = managersResult.recordset.filter(m => String(m.user_id) !== String(targetUserId));
    if (remainingManagers.length === 0) {
      const e = new Error('Cannot demote: this is the only Manager. Assign another Manager first.');
      e.statusCode = 400; throw e;
    }
  }
  const updateResult = await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .input('role',         sql.NVarChar(20),     role)
    .query(`UPDATE pm_members SET role=@role WHERE project_id=@projectId AND user_id=@targetUserId`);
  if (!updateResult.rowsAffected[0]) { const e = new Error('Member not found'); e.statusCode = 404; throw e; }
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_role_changed', fieldChanged:'role', newValue:role });
}

async function removeMember(projectId, targetUserId, actorUserId) {
  const pool = await getPool();
  // Safety: prevent removing the last Manager
  const memberResult = await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`SELECT role FROM pm_members WHERE project_id=@projectId AND user_id=@targetUserId`);
  if (memberResult.recordset[0]?.role === 'Manager') {
    const managersResult = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`SELECT user_id FROM pm_members WHERE project_id=@projectId AND role='Manager'`);
    if (managersResult.recordset.length <= 1) {
      const e = new Error('Cannot remove: this is the only Manager. Assign another Manager first.');
      e.statusCode = 400; throw e;
    }
  }
  await pool.request()
    .input('projectId',    sql.Int,              projectId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_members WHERE project_id=@projectId AND user_id=@targetUserId`);
  await audit.log({ entityType:'project', entityId:projectId, projectId, userId:actorUserId, action:'member_removed' });
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject, getMembers, addMember, updateMemberRole, removeMember };
