
const { getPool } = require('../../../config/db');

// ── Guards ────────────────────────────────────────────────────────────────────

async function assertGroupAdmin(groupId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT group_id FROM comm_groups
     WHERE group_id = $1
       AND is_active = TRUE
       AND created_by = $2::uuid`,
    [groupId, userId]
  );
  if (!rows[0]) {
    const err = new Error('Group not found or access denied');
    err.code = 'GROUP_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }
}

async function assertGroupMember(groupId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT g.group_id FROM comm_groups g
     WHERE g.group_id = $1
       AND g.is_active = TRUE
       AND (
         g.created_by = $2::uuid
         OR EXISTS (
           SELECT 1 FROM comm_group_members gm
           WHERE gm.group_id = g.group_id AND gm.user_id = $2::uuid
         )
       )`,
    [groupId, userId]
  );
  if (!rows[0]) {
    const err = new Error('Group not found or access denied');
    err.code = 'GROUP_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

async function listGroupsForUser(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT
       g.group_id    AS "groupId",
       g.group_name  AS "groupName",
       g.created_at  AS "createdAt",
       (
         SELECT COUNT(*)::int
         FROM comm_group_members gm2
         WHERE gm2.group_id = g.group_id
       ) AS "memberCount"
     FROM comm_groups g
     LEFT JOIN comm_group_members gm
       ON gm.group_id = g.group_id AND gm.user_id = $1::uuid
     WHERE g.is_active = TRUE
       AND (g.created_by = $1::uuid OR gm.user_id IS NOT NULL)
     ORDER BY g.group_name ASC`,
    [userId]
  );
  return rows;
}

// ── Create ────────────────────────────────────────────────────────────────────

async function createGroup(userId, groupName) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO comm_groups (group_name, created_by)
       VALUES ($1, $2::uuid)
       RETURNING group_id AS "groupId", group_name AS "groupName", created_at AS "createdAt"`,
      [groupName, userId]
    );
    const group = rows[0];

    await client.query(
      `INSERT INTO comm_group_members (group_id, user_id) VALUES ($1, $2::uuid)
       ON CONFLICT DO NOTHING`,
      [group.groupId, userId]
    );

    await client.query('COMMIT');
    return { ...group, memberCount: 1 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Members ───────────────────────────────────────────────────────────────────

async function getGroupMembers(groupId, userId) {
  await assertGroupMember(groupId, userId);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       u.user_id    AS "userId",
       u.email,
       u.first_name AS "firstName",
       u.last_name  AS "lastName"
     FROM comm_group_members gm
     INNER JOIN auth_users u ON u.user_id = gm.user_id
     WHERE gm.group_id = $1
       AND u.is_active = TRUE
     ORDER BY u.last_name, u.first_name`,
    [groupId]
  );
  return rows;
}

async function getMemberUserIdsForGroups(groupIds = []) {
  if (!groupIds.length) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT gm.user_id
     FROM comm_group_members gm
     INNER JOIN comm_groups g ON g.group_id = gm.group_id
     WHERE gm.group_id = ANY($1::int[])
       AND g.is_active = TRUE`,
    [groupIds]
  );
  return rows.map(r => r.user_id);
}

// ── Add members ───────────────────────────────────────────────────────────────

async function addMembers(groupId, actorUserId, userIds) {
  await assertGroupAdmin(groupId, actorUserId);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const memberId of userIds) {
      await client.query(
        `INSERT INTO comm_group_members (group_id, user_id)
         VALUES ($1, $2::uuid)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [groupId, memberId]
      );
    }
    await client.query('COMMIT');
    return getGroupMembers(groupId, actorUserId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Remove member ─────────────────────────────────────────────────────────────

async function removeMember(groupId, actorUserId, memberUserId) {
  await assertGroupAdmin(groupId, actorUserId);

  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM comm_group_members
     WHERE group_id = $1 AND user_id = $2::uuid`,
    [groupId, memberUserId]
  );
  return rowCount > 0;
}

// ── Soft delete group ─────────────────────────────────────────────────────────

async function softDeleteGroup(groupId, userId) {
  await assertGroupAdmin(groupId, userId);

  const pool = getPool();
  await pool.query(
    `UPDATE comm_groups SET is_active = FALSE WHERE group_id = $1`,
    [groupId]
  );
  return true;
}

// ── NEW: Get latest conversation for a group ──────────────────────────────────

/**
 * Returns the most recent conversation that is linked to groupId AND in which
 * the requesting userId is a participant.
 *
 * The Groups panel calls this when a user clicks a group card so they are taken
 * directly into the existing inbox thread instead of having to find it manually.
 *
 * Returns:
 *   {
 *     conversationId, subject, allowReply, lastMessageAt, createdAt,
 *     unreadCount, groupName
 *   }
 *   or null if no conversation exists yet.
 */
async function getLatestGroupConversation(groupId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       c.conversation_id   AS "conversationId",
       c.subject,
       c.allow_reply       AS "allowReply",
       c.last_message_at   AS "lastMessageAt",
       c.created_at        AS "createdAt",
       g.group_name        AS "groupName",
       (
         SELECT COUNT(*)::int
         FROM comm_messages um
         WHERE um.conversation_id = c.conversation_id
           AND um.is_deleted = FALSE
           AND um.sender_id <> $2::uuid
           AND NOT EXISTS (
             SELECT 1 FROM comm_read_receipts rr
             WHERE rr.message_id = um.message_id AND rr.user_id = $2::uuid
           )
       ) AS "unreadCount"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $2::uuid
       AND p.is_deleted = FALSE
     INNER JOIN comm_groups g ON g.group_id = c.group_id
     WHERE c.group_id = $1
       AND c.is_deleted = FALSE
     ORDER BY c.last_message_at DESC
     LIMIT 1`,
    [groupId, userId]
  );
  return rows[0] || null;
}

module.exports = {
  listGroupsForUser,
  createGroup,
  getGroupMembers,
  getMemberUserIdsForGroups,
  addMembers,
  removeMember,
  softDeleteGroup,
  assertGroupMember,
  getLatestGroupConversation,
};