'use strict';

const { getPool, sql } = require('../../../config/db');

// ── List ────────────────────────────────────────────────────────────────────
// Any authenticated user — org groups are visible to everyone by design,
// unlike comm_groups (which only show to members/creator/super admin).
async function listOrgGroups() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`
      SELECT
        g.org_group_id AS orgGroupId,
        g.name,
        g.description,
        g.created_at   AS createdAt,
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS createdByName,
        (SELECT CAST(COUNT(*) AS INT) FROM org_group_members m WHERE m.org_group_id = g.org_group_id) AS memberCount
      FROM org_groups g
      LEFT JOIN auth_users u ON u.user_id = g.created_by
      WHERE g.is_active = 1
      ORDER BY g.name
    `);
  return result.recordset;
}

// ── Members ───────────────────────────────────────────────────────────────────
// Any authenticated user — needed so the New Message composer can expand a
// selected team into its member users for anyone, not just admins.
async function getOrgGroupMembers(orgGroupId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('orgGroupId', sql.Int, orgGroupId)
    .query(`
      SELECT u.user_id AS userId, u.email, u.first_name AS firstName, u.last_name AS lastName
      FROM org_group_members m
      INNER JOIN auth_users u ON u.user_id = m.user_id
      WHERE m.org_group_id = @orgGroupId AND u.is_active = 1
      ORDER BY u.first_name, u.last_name
    `);
  return result.recordset;
}

// ── Create / update / delete — admin only (enforced in the route) ────────────
async function createOrgGroup(name, description, userId, memberIds = []) {
  if (!name?.trim()) { const e = new Error('Team name is required'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  // Team names must be unique among ACTIVE teams (case-insensitive) — the
  // "team name should be unique" requirement. A soft-deleted (is_active=0)
  // team never blocks reuse of its name. This is an app-level check, not a DB
  // unique index, because existing data may already hold duplicates that a
  // constraint couldn't be added over.
  const dupe = await pool.request()
    .input('name', sql.VarChar(150), name.trim())
    .query(`SELECT TOP 1 org_group_id FROM org_groups WHERE is_active = 1 AND LOWER(name) = LOWER(@name)`);
  if (dupe.recordset.length) {
    const e = new Error(`A team named "${name.trim()}" already exists. Pick a different name.`);
    e.statusCode = 409; throw e;
  }
  const result = await pool.request()
    .input('name',        sql.VarChar(150),      name.trim())
    .input('description', sql.NVarChar(500),     description || null)
    .input('userId',      sql.UniqueIdentifier,  userId)
    .query(`
      INSERT INTO org_groups (name, description, created_by)
      OUTPUT INSERTED.org_group_id AS orgGroupId
      VALUES (@name, @description, @userId)
    `);
  const orgGroupId = result.recordset[0].orgGroupId;

  const uniqueMemberIds = [...new Set((memberIds || []).map(String))];
  for (const uid of uniqueMemberIds) {
    await pool.request()
      .input('orgGroupId', sql.Int,              orgGroupId)
      .input('userId',     sql.UniqueIdentifier, uid)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM org_group_members WHERE org_group_id=@orgGroupId AND user_id=@userId)
          INSERT INTO org_group_members (org_group_id, user_id) VALUES (@orgGroupId, @userId)
      `);
  }
  return { orgGroupId, name: name.trim(), description: description || null, memberCount: uniqueMemberIds.length };
}

async function updateOrgGroup(orgGroupId, data) {
  const fields = {};
  if (data.name !== undefined) {
    if (!data.name?.trim()) { const e = new Error('Team name is required'); e.statusCode = 400; throw e; }
    fields.name = data.name.trim();
  }
  if (data.description !== undefined) fields.description = data.description || null;
  const keys = Object.keys(fields);
  if (!keys.length) return { orgGroupId };

  const pool = await getPool();
  // Same uniqueness rule as create — but exclude this team itself so saving
  // an unchanged name (or only editing the description) doesn't false-trip.
  if (fields.name !== undefined) {
    const dupe = await pool.request()
      .input('name', sql.VarChar(150), fields.name)
      .input('orgGroupId', sql.Int, orgGroupId)
      .query(`SELECT TOP 1 org_group_id FROM org_groups
              WHERE is_active = 1 AND org_group_id <> @orgGroupId AND LOWER(name) = LOWER(@name)`);
    if (dupe.recordset.length) {
      const e = new Error(`A team named "${fields.name}" already exists. Pick a different name.`);
      e.statusCode = 409; throw e;
    }
  }
  const req  = pool.request().input('orgGroupId', sql.Int, orgGroupId);
  const types = { name: sql.VarChar(150), description: sql.NVarChar(500) };
  const set = keys.map((k, i) => { const ph = `f${i}`; req.input(ph, types[k], fields[k]); return `${k}=@${ph}`; }).join(', ');
  await req.query(`UPDATE org_groups SET ${set} WHERE org_group_id=@orgGroupId`);
  return { orgGroupId, ...fields };
}

// No chat/messages tied to an org group (unlike comm_groups), so there's no
// "disable before delete" safety dance needed — just deactivate directly.
async function deleteOrgGroup(orgGroupId) {
  const pool = await getPool();
  await pool.request()
    .input('orgGroupId', sql.Int, orgGroupId)
    .query(`UPDATE org_groups SET is_active=0 WHERE org_group_id=@orgGroupId`);
}

async function addOrgGroupMembers(orgGroupId, userIds = []) {
  const pool = await getPool();
  const uniqueIds = [...new Set((userIds || []).map(String))];
  for (const uid of uniqueIds) {
    await pool.request()
      .input('orgGroupId', sql.Int,              orgGroupId)
      .input('userId',     sql.UniqueIdentifier, uid)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM org_group_members WHERE org_group_id=@orgGroupId AND user_id=@userId)
          INSERT INTO org_group_members (org_group_id, user_id) VALUES (@orgGroupId, @userId)
      `);
  }
  return getOrgGroupMembers(orgGroupId);
}

async function removeOrgGroupMember(orgGroupId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('orgGroupId', sql.Int,              orgGroupId)
    .input('userId',     sql.UniqueIdentifier, userId)
    .query(`DELETE FROM org_group_members WHERE org_group_id=@orgGroupId AND user_id=@userId`);
}

module.exports = {
  listOrgGroups,
  getOrgGroupMembers,
  createOrgGroup,
  updateOrgGroup,
  deleteOrgGroup,
  addOrgGroupMembers,
  removeOrgGroupMember,
};
