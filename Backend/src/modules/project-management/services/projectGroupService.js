'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');

// ── Grouping (folder-style: a project belongs to at most one group) ───────────
//
// Groups are shared org-wide — everyone sees every group. Membership is the
// single group_id column on pm_projects (NULL = ungrouped), so assigning a
// project to a group automatically removes it from any previous one.
//
// Permission model:
//   - Anyone can READ the group list.
//   - Assigning/removing a project to/from a group requires the caller to be
//     a Manager of THAT project (or an admin) — you can only group projects
//     you manage.
//   - Renaming/deleting a group is limited to the group's creator or an admin.

async function isProjectManager(userId, projectId, isAdmin) {
  if (isAdmin) return true;
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT role FROM pm_members WHERE project_id=@projectId AND user_id=@userId`);
  return result.recordset[0]?.role === 'Manager';
}

// Every group, with how many (non-deleted) projects it holds. Shared list —
// no per-user filtering here (the project LIST endpoint still scopes which
// projects a given user actually sees; this is just the catalogue of groups).
async function listGroups() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT g.group_id AS groupId, g.name, g.created_by AS createdBy,
           (SELECT COUNT(*) FROM pm_projects p WHERE p.group_id = g.group_id AND p.is_deleted = 0) AS projectCount
    FROM pm_project_groups g
    ORDER BY g.name
  `);
  return result.recordset;
}

async function createGroup(userId, isAdmin, body) {
  const { name, projectIds = [] } = body;
  if (!name?.trim()) { const e = new Error('Group name is required'); e.statusCode = 400; throw e; }
  if (name.trim().length > 120) { const e = new Error('Group name must be 120 characters or fewer'); e.statusCode = 400; throw e; }

  const ids = [...new Set(projectIds.map(Number).filter(Boolean))];

  // Manager (or admin) on every project being grouped — checked up front so
  // the whole create fails cleanly rather than half-applying.
  for (const pid of ids) {
    if (!(await isProjectManager(userId, pid, isAdmin))) {
      const e = new Error('You can only group projects you manage.'); e.statusCode = 403; throw e;
    }
  }

  let group;
  await withTransaction(async (req) => {
    const result = await req()
      .input('name', sql.NVarChar(120), name.trim())
      .input('createdBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO pm_project_groups (name, created_by)
        OUTPUT INSERTED.group_id AS groupId, INSERTED.name, INSERTED.created_by AS createdBy
        VALUES (@name, @createdBy)
      `);
    group = result.recordset[0];

    for (const pid of ids) {
      await req()
        .input('groupId', sql.Int, group.groupId)
        .input('projectId', sql.Int, pid)
        .query(`UPDATE pm_projects SET group_id=@groupId, modified_at=SYSDATETIMEOFFSET() WHERE project_id=@projectId`);
    }
  });

  return { ...group, projectCount: ids.length };
}

async function renameGroup(groupId, userId, isAdmin, name) {
  if (!name?.trim()) { const e = new Error('Group name is required'); e.statusCode = 400; throw e; }
  if (name.trim().length > 120) { const e = new Error('Group name must be 120 characters or fewer'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  const cur = await pool.request().input('groupId', sql.Int, groupId)
    .query(`SELECT created_by AS createdBy FROM pm_project_groups WHERE group_id=@groupId`);
  const row = cur.recordset[0];
  if (!row) { const e = new Error('Group not found'); e.statusCode = 404; throw e; }
  if (!isAdmin && String(row.createdBy) !== String(userId)) {
    const e = new Error('Only the group creator or an admin can rename this group.'); e.statusCode = 403; throw e;
  }
  await pool.request()
    .input('groupId', sql.Int, groupId)
    .input('name', sql.NVarChar(120), name.trim())
    .query(`UPDATE pm_project_groups SET name=@name WHERE group_id=@groupId`);
  return { groupId, name: name.trim() };
}

async function deleteGroup(groupId, userId, isAdmin) {
  const pool = await getPool();
  const cur = await pool.request().input('groupId', sql.Int, groupId)
    .query(`SELECT created_by AS createdBy FROM pm_project_groups WHERE group_id=@groupId`);
  const row = cur.recordset[0];
  if (!row) { const e = new Error('Group not found'); e.statusCode = 404; throw e; }
  if (!isAdmin && String(row.createdBy) !== String(userId)) {
    const e = new Error('Only the group creator or an admin can delete this group.'); e.statusCode = 403; throw e;
  }
  // Null out membership first (no FK cascade — see schema comment), then drop
  // the group row. The projects themselves are untouched, just ungrouped.
  await withTransaction(async (req) => {
    await req().input('groupId', sql.Int, groupId)
      .query(`UPDATE pm_projects SET group_id=NULL, modified_at=SYSDATETIMEOFFSET() WHERE group_id=@groupId`);
    await req().input('groupId', sql.Int, groupId)
      .query(`DELETE FROM pm_project_groups WHERE group_id=@groupId`);
  });
  return { ok: true };
}

// Assign a project to a group, or remove it (groupId = null). Manager-or-admin
// on that project. A non-null groupId must reference a real group.
async function setProjectGroup(projectId, groupId, userId, isAdmin) {
  if (!(await isProjectManager(userId, projectId, isAdmin))) {
    const e = new Error('You can only group projects you manage.'); e.statusCode = 403; throw e;
  }
  const pool = await getPool();
  if (groupId != null) {
    const g = await pool.request().input('groupId', sql.Int, groupId)
      .query(`SELECT 1 AS ok FROM pm_project_groups WHERE group_id=@groupId`);
    if (!g.recordset.length) { const e = new Error('Group not found'); e.statusCode = 404; throw e; }
  }
  await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('groupId', sql.Int, groupId ?? null)
    .query(`UPDATE pm_projects SET group_id=@groupId, modified_at=SYSDATETIMEOFFSET() WHERE project_id=@projectId`);
  return { projectId, groupId: groupId ?? null };
}

module.exports = { listGroups, createGroup, renameGroup, deleteGroup, setProjectGroup };
