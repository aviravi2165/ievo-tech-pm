const { sql, getPool } = require('../../../config/db');

async function assertGroupAdmin(groupId, userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('groupId', sql.Int, groupId)
    .input('userId', sql.Int, userId)
    .query(`
      SELECT TOP 1 g.groupId
      FROM dbo.groups g
      WHERE g.groupId = @groupId
        AND g.isActive = 1
        AND g.createdByUserId = @userId;
    `);

  if (!result.recordset[0]) {
    const err = new Error('Group not found or access denied');
    err.code = 'GROUP_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }
}

async function assertGroupMember(groupId, userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('groupId', sql.Int, groupId)
    .input('userId', sql.Int, userId)
    .query(`
      SELECT TOP 1 g.groupId
      FROM dbo.groups g
      WHERE g.groupId = @groupId
        AND g.isActive = 1
        AND (
          g.createdByUserId = @userId
          OR EXISTS (
            SELECT 1
            FROM dbo.group_members gm
            WHERE gm.groupId = g.groupId
              AND gm.userId = @userId
              AND gm.isActive = 1
          )
        );
    `);

  if (!result.recordset[0]) {
    const err = new Error('Group not found or access denied');
    err.code = 'GROUP_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Lists active groups the user created or belongs to.
 */
async function listGroupsForUser(userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT DISTINCT
        g.groupId,
        g.groupName,
        g.createdAt,
        (
          SELECT COUNT(*)
          FROM dbo.group_members gm
          WHERE gm.groupId = g.groupId
            AND gm.isActive = 1
        ) AS memberCount
      FROM dbo.groups g
      LEFT JOIN dbo.group_members gm
        ON gm.groupId = g.groupId
        AND gm.userId = @userId
        AND gm.isActive = 1
      WHERE g.isActive = 1
        AND (g.createdByUserId = @userId OR gm.groupMemberId IS NOT NULL)
      ORDER BY g.groupName ASC;
    `);

  return result.recordset;
}

/**
 * Creates a group and adds the creator as a member.
 */
async function createGroup(userId, groupName) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const insertGroup = await new sql.Request(transaction)
      .input('groupName', sql.NVarChar(200), groupName)
      .input('createdByUserId', sql.Int, userId)
      .query(`
        INSERT INTO dbo.groups (groupName, createdByUserId)
        OUTPUT INSERTED.groupId, INSERTED.groupName, INSERTED.createdAt
        VALUES (@groupName, @createdByUserId);
      `);

    const group = insertGroup.recordset[0];

    await new sql.Request(transaction)
      .input('groupId', sql.Int, group.groupId)
      .input('userId', sql.Int, userId)
      .query(`
        INSERT INTO dbo.group_members (groupId, userId)
        VALUES (@groupId, @userId);
      `);

    await transaction.commit();
    return group;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getGroupMembers(groupId, userId) {
  await assertGroupMember(groupId, userId);

  const pool = await getPool();
  const result = await pool
    .request()
    .input('groupId', sql.Int, groupId)
    .query(`
      SELECT
        u.userId,
        u.email,
        u.firstName,
        u.lastName
      FROM dbo.group_members gm
      INNER JOIN dbo.users u ON u.userId = gm.userId
      WHERE gm.groupId = @groupId
        AND gm.isActive = 1
        AND u.isActive = 1
      ORDER BY u.lastName, u.firstName;
    `);

  return result.recordset;
}

/**
 * Expands group IDs to distinct member user IDs (active groups/members only).
 */
async function getMemberUserIdsForGroups(groupIds) {
  const userIds = new Set();
  if (!groupIds || groupIds.length === 0) {
    return [];
  }

  const pool = await getPool();
  for (const groupId of groupIds) {
    const result = await pool
      .request()
      .input('groupId', sql.Int, groupId)
      .query(`
        SELECT gm.userId
        FROM dbo.group_members gm
        INNER JOIN dbo.groups g ON g.groupId = gm.groupId
        WHERE gm.groupId = @groupId
          AND gm.isActive = 1
          AND g.isActive = 1;
      `);

    result.recordset.forEach((row) => userIds.add(row.userId));
  }

  return [...userIds];
}

async function addMembers(groupId, actorUserId, userIds) {
  await assertGroupAdmin(groupId, actorUserId);

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (const memberUserId of userIds) {
      await new sql.Request(transaction)
        .input('groupId', sql.Int, groupId)
        .input('userId', sql.Int, memberUserId)
        .query(`
          IF EXISTS (
            SELECT 1 FROM dbo.group_members
            WHERE groupId = @groupId AND userId = @userId
          )
          BEGIN
            UPDATE dbo.group_members
            SET isActive = 1, joinedAt = SYSUTCDATETIME()
            WHERE groupId = @groupId AND userId = @userId;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.group_members (groupId, userId)
            VALUES (@groupId, @userId);
          END
        `);
    }

    await transaction.commit();
    return getGroupMembers(groupId, actorUserId);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function removeMember(groupId, actorUserId, memberUserId) {
  await assertGroupAdmin(groupId, actorUserId);

  const pool = await getPool();
  const result = await pool
    .request()
    .input('groupId', sql.Int, groupId)
    .input('userId', sql.Int, memberUserId)
    .query(`
      UPDATE dbo.group_members
      SET isActive = 0
      WHERE groupId = @groupId
        AND userId = @userId
        AND isActive = 1;

      SELECT @@ROWCOUNT AS affected;
    `);

  return (result.recordset[0]?.affected ?? 0) > 0;
}

async function softDeleteGroup(groupId, userId) {
  await assertGroupAdmin(groupId, userId);

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input('groupId', sql.Int, groupId)
      .query(`
        UPDATE dbo.groups
        SET isActive = 0
        WHERE groupId = @groupId AND isActive = 1;

        UPDATE dbo.group_members
        SET isActive = 0
        WHERE groupId = @groupId AND isActive = 1;
      `);

    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  listGroupsForUser,
  createGroup,
  getGroupMembers,
  getMemberUserIdsForGroups,
  addMembers,
  removeMember,
  softDeleteGroup,
};
