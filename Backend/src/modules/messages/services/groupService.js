'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if userId is the group's creator, a promoted co-admin, or the
 * org-wide super admin (auth_users.user_type = 'admin').
 */
async function isGroupAdminOrSuperAdmin(groupId, userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('groupId', sql.Int,              groupId)
    .input('userId',  sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        CASE WHEN g.created_by = @userId THEN 1 ELSE 0 END       AS isCreator,
        COALESCE(gm.is_co_admin, 0)                               AS isCoAdmin,
        CASE WHEN u.user_type = 'admin' THEN 1 ELSE 0 END         AS isSuperAdmin
      FROM comm_groups g
      INNER JOIN auth_users u ON u.user_id = @userId
      LEFT  JOIN comm_group_members gm
        ON gm.group_id = g.group_id AND gm.user_id = @userId
      WHERE g.group_id = @groupId
    `);
  const r = result.recordset[0];
  if (!r) return false;
  return r.isCreator || r.isCoAdmin || r.isSuperAdmin;
}

async function assertGroupAdmin(groupId, userId) {
  const allowed = await isGroupAdminOrSuperAdmin(groupId, userId);
  if (!allowed) {
    const err = new Error('Only the group admin can do this');
    err.code = 'GROUP_FORBIDDEN'; err.statusCode = 403; throw err;
  }
}

/**
 * Only the original creator or the org super admin can promote/demote
 * co-admins — a co-admin cannot mint other co-admins.
 */
async function assertCanManageAdmins(groupId, userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('groupId', sql.Int,              groupId)
    .input('userId',  sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        CASE WHEN g.created_by = @userId THEN 1 ELSE 0 END AS isCreator,
        CASE WHEN u.user_type = 'admin'  THEN 1 ELSE 0 END AS isSuperAdmin
      FROM comm_groups g
      INNER JOIN auth_users u ON u.user_id = @userId
      WHERE g.group_id = @groupId
    `);
  const r = result.recordset[0];
  if (!r || !(r.isCreator || r.isSuperAdmin)) {
    const err = new Error('Only the group creator or a super admin can change admin roles');
    err.code = 'GROUP_FORBIDDEN'; err.statusCode = 403; throw err;
  }
}

async function assertGroupMember(groupId, userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('groupId', sql.Int,              groupId)
    .input('userId',  sql.UniqueIdentifier, userId)
    .query(`
      SELECT g.group_id
      FROM comm_groups g
      WHERE g.group_id = @groupId
        AND (
          g.created_by = @userId
          OR EXISTS (
            SELECT 1 FROM comm_group_members gm
            WHERE gm.group_id = g.group_id AND gm.user_id = @userId
          )
          OR EXISTS (
            SELECT 1 FROM auth_users u
            WHERE u.user_id = @userId AND u.user_type = 'admin'
          )
        )
    `);
  if (!result.recordset[0]) {
    const err = new Error('Group not found or access denied');
    err.code = 'GROUP_FORBIDDEN'; err.statusCode = 403; throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────────────────────

async function listGroupsForUser(userId) {
  const pool = await getPool();

  const meResult = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT user_type AS userType FROM auth_users WHERE user_id = @userId`);

  const isSuperAdmin = meResult.recordset[0]?.userType === 'admin';

  if (isSuperAdmin) {
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          g.group_id                               AS groupId,
          g.group_name                             AS groupName,
          g.description                            AS description,
          g.created_at                             AS createdAt,
          g.created_by                             AS createdBy,
          g.is_active                              AS isActive,
          g.is_disabled                            AS isDisabled,
          CAST(0 AS BIT)                           AS isAdmin,
          CAST(1 AS BIT)                           AS isSuperAdmin,
          CAST(0 AS BIT)                           AS isMember,
          (
            SELECT CAST(COUNT(*) AS INT)
            FROM comm_group_members gm2
            WHERE gm2.group_id = g.group_id
          ) AS memberCount
        FROM comm_groups g
        WHERE g.is_active = 1
        ORDER BY g.is_disabled ASC, g.created_at ASC
      `);
    return result.recordset;
  }

  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        g.group_id    AS groupId,
        g.group_name  AS groupName,
        g.description AS description,
        g.created_at  AS createdAt,
        g.created_by  AS createdBy,
        g.is_active   AS isActive,
        g.is_disabled AS isDisabled,
        CASE WHEN g.created_by = @userId OR COALESCE(gm.is_co_admin, 0) = 1
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isAdmin,
        CASE WHEN g.created_by = @userId
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isCreator,
        CAST(0 AS BIT)                                    AS isSuperAdmin,
        CASE WHEN gm.user_id IS NOT NULL
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isMember,
        (
          SELECT CAST(COUNT(*) AS INT)
          FROM comm_group_members gm2
          WHERE gm2.group_id = g.group_id
        ) AS memberCount
      FROM comm_groups g
      LEFT JOIN comm_group_members gm
        ON gm.group_id = g.group_id AND gm.user_id = @userId
      LEFT JOIN comm_group_hidden gh
        ON gh.group_id = g.group_id AND gh.user_id = @userId
      WHERE g.is_active = 1
        AND gh.user_id IS NULL
        AND (g.created_by = @userId OR gm.user_id IS NOT NULL)
      ORDER BY g.is_disabled ASC, g.created_at ASC
    `);
  return result.recordset;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

async function createGroup(userId, groupName, description) {
  return withTransaction(async (req) => {
    // INSERT…OUTPUT replaces INSERT…RETURNING
    const groupResult = await req()
      .input('groupName',   sql.NVarChar, groupName)
      .input('userId',      sql.UniqueIdentifier, userId)
      .input('description', sql.NVarChar, description || null)
      .query(`
        INSERT INTO comm_groups (group_name, description, created_by)
        OUTPUT INSERTED.group_id  AS groupId,
               INSERTED.group_name AS groupName,
               INSERTED.description AS description,
               INSERTED.created_by AS createdBy,
               INSERTED.created_at AS createdAt
        VALUES (@groupName, @description, @userId)
      `);
    const group = groupResult.recordset[0];

    // Add creator as first member (idempotent)
    await req()
      .input('groupId', sql.Int,              group.groupId)
      .input('userId',  sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM comm_group_members
          WHERE group_id = @groupId AND user_id = @userId
        )
          INSERT INTO comm_group_members (group_id, user_id) VALUES (@groupId, @userId)
      `);

    return {
      ...group,
      isAdmin:      true,
      isCreator:    true,
      isSuperAdmin: false,
      isMember:     true,
      isActive:     true,
      isDisabled:   false,
      memberCount:  1,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Members
// ─────────────────────────────────────────────────────────────────────────────

async function getGroupMembers(groupId, userId) {
  await assertGroupMember(groupId, userId);

  const pool = await getPool();
  const result = await pool.request()
    .input('groupId', sql.Int, groupId)
    .query(`
      SELECT
        u.user_id    AS userId,
        u.email,
        u.first_name AS firstName,
        u.last_name  AS lastName,
        CASE WHEN g.created_by = u.user_id THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isCreator,
        COALESCE(gm.is_co_admin, 0)                                                     AS isCoAdmin,
        CASE WHEN g.created_by = u.user_id OR COALESCE(gm.is_co_admin, 0) = 1
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isAdmin
      FROM comm_group_members gm
      INNER JOIN comm_groups    g ON g.group_id = gm.group_id
      INNER JOIN auth_users     u ON u.user_id  = gm.user_id
      WHERE gm.group_id = @groupId AND u.is_active = 1
      ORDER BY
        CASE WHEN g.created_by = u.user_id THEN 0 ELSE 1 END,
        COALESCE(gm.is_co_admin, 0) DESC,
        u.last_name, u.first_name
    `);
  return result.recordset;
}

async function getMemberUserIdsForGroups(groupIds = []) {
  if (!groupIds.length) return [];
  const pool = await getPool();
  const req  = pool.request();

  // Expand array into individual named params — MSSQL does not support array params
  const placeholders = groupIds.map((id, i) => {
    req.input(`gid${i}`, sql.Int, id);
    return `@gid${i}`;
  });

  const result = await req.query(`
    SELECT DISTINCT gm.user_id
    FROM comm_group_members gm
    INNER JOIN comm_groups g ON g.group_id = gm.group_id
    WHERE gm.group_id IN (${placeholders.join(',')})
      AND g.is_active = 1
  `);
  return result.recordset.map(r => r.user_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Add members — admin (creator/co-admin) or super admin only
// ─────────────────────────────────────────────────────────────────────────────

async function addMembers(groupId, actorUserId, userIds) {
  await assertGroupAdmin(groupId, actorUserId);

  const pool = await getPool();

  // Guard: group must not be disabled
  const groupCheck = await pool.request()
    .input('groupId', sql.Int, groupId)
    .query(`SELECT is_disabled FROM comm_groups WHERE group_id = @groupId`);
  if (groupCheck.recordset[0]?.is_disabled) {
    const err = new Error('This group is disabled. Re-enable it before adding members.');
    err.statusCode = 400; throw err;
  }

  // Guard: cannot add super-admin accounts as members
  if (userIds.length) {
    const req = pool.request();
    const ph  = userIds.map((id, i) => { req.input(`uid${i}`, sql.UniqueIdentifier, id); return `@uid${i}`; });
    const adminCheck = await req.query(
      `SELECT user_id FROM auth_users WHERE user_id IN (${ph.join(',')}) AND user_type = 'admin'`
    );
    if (adminCheck.recordset.length) {
      const err = new Error('Cannot add super-admin accounts as group members');
      err.statusCode = 400; throw err;
    }
  }

  await withTransaction(async (req) => {
    for (const memberId of userIds) {
      // Add to group (idempotent)
      await req()
        .input('groupId',  sql.Int,              groupId)
        .input('memberId', sql.UniqueIdentifier, memberId)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM comm_group_members
            WHERE group_id = @groupId AND user_id = @memberId
          )
            INSERT INTO comm_group_members (group_id, user_id) VALUES (@groupId, @memberId)
        `);

      // Upsert participant rows for every existing group conversation
      await req()
        .input('groupId',  sql.Int,              groupId)
        .input('memberId', sql.UniqueIdentifier, memberId)
        .query(`
          MERGE comm_participants AS target
          USING (
            SELECT c.conversation_id, @memberId AS user_id, 'to' AS participant_type
            FROM comm_conversations c
            WHERE c.group_id = @groupId AND c.is_deleted = 0
          ) AS source
          ON (target.conversation_id = source.conversation_id AND target.user_id = source.user_id)
          WHEN MATCHED THEN UPDATE SET
            is_deleted       = 0,
            is_archived      = 0,
            archived_at      = NULL,
            left_at          = NULL,
            participant_type = 'to'
          WHEN NOT MATCHED THEN INSERT (conversation_id, user_id, participant_type)
            VALUES (source.conversation_id, source.user_id, source.participant_type);
        `);

      // Un-hide group for re-added member
      await req()
        .input('groupId',  sql.Int,              groupId)
        .input('memberId', sql.UniqueIdentifier, memberId)
        .query(`
          DELETE FROM comm_group_hidden WHERE group_id = @groupId AND user_id = @memberId
        `);
    }
  });

  // Read the refreshed member list with a separate pool request, AFTER the
  // transaction above has committed. Calling this from inside the open
  // transaction (a different connection) can block on the rows it just
  // wrote under MSSQL's default locking, unlike Postgres' MVCC — so we
  // wait for commit first.
  return getGroupMembers(groupId, actorUserId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Remove member — admin or super admin only
// ─────────────────────────────────────────────────────────────────────────────

async function removeMember(groupId, actorUserId, memberUserId) {
  await assertGroupAdmin(groupId, actorUserId);

  const pool = await getPool();
  const groupRes = await pool.request()
    .input('groupId', sql.Int, groupId)
    .query(`SELECT created_by, is_disabled FROM comm_groups WHERE group_id = @groupId`);

  if (!groupRes.recordset[0]) {
    const err = new Error('Group not found'); err.statusCode = 404; throw err;
  }
  const { created_by, is_disabled } = groupRes.recordset[0];
  if (String(created_by) === String(memberUserId)) {
    const err = new Error('The group creator cannot be removed. Disable or delete the group instead.');
    err.statusCode = 400; throw err;
  }
  if (is_disabled) {
    const err = new Error('This group is disabled. Re-enable it before removing members.');
    err.statusCode = 400; throw err;
  }

  return withTransaction(async (req) => {
    const del = await req()
      .input('groupId',      sql.Int,              groupId)
      .input('memberUserId', sql.UniqueIdentifier, memberUserId)
      .query(`DELETE FROM comm_group_members WHERE group_id = @groupId AND user_id = @memberUserId`);

    await req()
      .input('groupId',      sql.Int,              groupId)
      .input('memberUserId', sql.UniqueIdentifier, memberUserId)
      .query(`
        UPDATE p SET left_at = COALESCE(p.left_at, SYSDATETIMEOFFSET()), is_archived = 0
        FROM comm_participants p
        INNER JOIN comm_conversations c ON c.conversation_id = p.conversation_id
        WHERE c.group_id = @groupId
          AND p.user_id  = @memberUserId
          AND p.is_deleted = 0
      `);

    return del.rowsAffected[0] > 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Promote / demote co-admin
// ─────────────────────────────────────────────────────────────────────────────

async function setMemberAdminStatus(groupId, actorUserId, targetUserId, makeAdmin) {
  await assertCanManageAdmins(groupId, actorUserId);

  const pool = await getPool();
  const groupRes = await pool.request()
    .input('groupId', sql.Int, groupId)
    .query(`SELECT created_by, is_disabled FROM comm_groups WHERE group_id = @groupId`);

  if (!groupRes.recordset[0]) {
    const err = new Error('Group not found'); err.statusCode = 404; throw err;
  }
  const { created_by, is_disabled } = groupRes.recordset[0];
  if (String(created_by) === String(targetUserId)) {
    const err = new Error('The group creator is always an admin and cannot be changed.');
    err.statusCode = 400; throw err;
  }
  if (is_disabled) {
    const err = new Error('This group is disabled. Re-enable it before changing admin roles.');
    err.statusCode = 400; throw err;
  }

  const upd = await pool.request()
    .input('groupId',      sql.Int,              groupId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .input('makeAdmin',    sql.Bit,              makeAdmin ? 1 : 0)
    .query(`
      UPDATE comm_group_members
      SET is_co_admin = @makeAdmin
      WHERE group_id = @groupId AND user_id = @targetUserId
    `);

  if (!upd.rowsAffected[0]) {
    const err = new Error('That user is not a member of this group.'); err.statusCode = 404; throw err;
  }
  return getGroupMembers(groupId, actorUserId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Disable / Enable / Delete / Hide
// ─────────────────────────────────────────────────────────────────────────────

async function disableGroup(groupId, actorUserId) {
  await assertGroupAdmin(groupId, actorUserId);
  const pool = await getPool();
  await pool.request()
    .input('groupId', sql.Int,              groupId)
    .input('actor',   sql.UniqueIdentifier, actorUserId)
    .query(`
      UPDATE comm_groups
      SET is_disabled = 1, disabled_at = SYSDATETIMEOFFSET(), disabled_by = @actor
      WHERE group_id = @groupId
    `);
  return true;
}

async function enableGroup(groupId, actorUserId) {
  await assertGroupAdmin(groupId, actorUserId);
  const pool = await getPool();
  await pool.request()
    .input('groupId', sql.Int, groupId)
    .query(`
      UPDATE comm_groups
      SET is_disabled = 0, disabled_at = NULL, disabled_by = NULL
      WHERE group_id = @groupId
    `);
  return true;
}

async function deleteGroupForActor(groupId, actorUserId) {
  await assertGroupAdmin(groupId, actorUserId);
  const pool = await getPool();

  const res = await pool.request()
    .input('groupId', sql.Int, groupId)
    .query(`SELECT is_disabled FROM comm_groups WHERE group_id = @groupId`);

  if (!res.recordset[0]) {
    const err = new Error('Group not found'); err.statusCode = 404; throw err;
  }
  if (!res.recordset[0].is_disabled) {
    const err = new Error('Disable the group before deleting it.'); err.statusCode = 400; throw err;
  }

  await pool.request()
    .input('groupId', sql.Int,              groupId)
    .input('actor',   sql.UniqueIdentifier, actorUserId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM comm_group_hidden WHERE group_id = @groupId AND user_id = @actor)
        INSERT INTO comm_group_hidden (group_id, user_id) VALUES (@groupId, @actor)
    `);
  return true;
}

async function hideDisabledGroupForUser(groupId, userId) {
  const pool = await getPool();
  const res  = await pool.request()
    .input('groupId', sql.Int, groupId)
    .query(`SELECT is_disabled FROM comm_groups WHERE group_id = @groupId`);

  if (!res.recordset[0]) {
    const err = new Error('Group not found'); err.statusCode = 404; throw err;
  }
  if (!res.recordset[0].is_disabled) {
    const err = new Error('You can only remove a group from your tabs after it has been disabled.');
    err.statusCode = 400; throw err;
  }

  await assertGroupMember(groupId, userId);

  await pool.request()
    .input('groupId', sql.Int,              groupId)
    .input('userId',  sql.UniqueIdentifier, userId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM comm_group_hidden WHERE group_id = @groupId AND user_id = @userId)
        INSERT INTO comm_group_hidden (group_id, user_id) VALUES (@groupId, @userId)
    `);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Latest group conversation (for opening a group chat)
// ─────────────────────────────────────────────────────────────────────────────

async function getLatestGroupConversation(groupId, userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('groupId', sql.Int,              groupId)
    .input('userId',  sql.UniqueIdentifier, userId)
    .query(`
      SELECT TOP 1
        c.conversation_id AS conversationId,
        c.subject,
        c.allow_reply     AS allowReply,
        c.last_message_at AS lastMessageAt,
        c.created_at      AS createdAt,
        g.group_name      AS groupName,
        g.is_disabled     AS isGroupDisabled,
        (
          SELECT CAST(COUNT(*) AS INT)
          FROM comm_messages um
          WHERE um.conversation_id = c.conversation_id
            AND um.is_deleted = 0
            AND um.sender_id <> @userId
            AND NOT EXISTS (
              SELECT 1 FROM comm_read_receipts rr
              WHERE rr.message_id = um.message_id AND rr.user_id = @userId
            )
        ) AS unreadCount
      FROM comm_conversations c
      INNER JOIN comm_groups g ON g.group_id = c.group_id
      WHERE c.group_id = @groupId AND c.is_deleted = 0
      ORDER BY c.last_message_at DESC
    `);
  // FIX: previously this required an INNER JOIN against comm_participants,
  // meaning a real group member could get a 404 here ("chat exists but
  // won't open") if their participant row was never backfilled for this
  // conversation — e.g. they were added to the group around the same time
  // the first message was sent, or by an older version of addMembers().
  // Group MEMBERSHIP (already verified by the caller's assertGroupMember)
  // is the actual authority for group threads — see replyToConversation's
  // assertActiveGroupMember check, which never required comm_participants
  // either. So: don't gate finding the conversation on that row's
  // existence — but DO self-heal it here so the later getThread() call
  // (which genuinely needs a participant row via assertConversationParticipant)
  // succeeds too, instead of just moving the same failure one step later.
  const conv = result.recordset[0];
  if (conv) {
    await pool.request()
      .input('convId', sql.Int,              conv.conversationId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        IF EXISTS (SELECT 1 FROM comm_participants WHERE conversation_id = @convId AND user_id = @userId)
          UPDATE comm_participants
          SET is_deleted = 0
          WHERE conversation_id = @convId AND user_id = @userId
        ELSE
          INSERT INTO comm_participants (conversation_id, user_id, participant_type)
          VALUES (@convId, @userId, 'to')
      `);
  }
  return conv || null;
}

// Creates an empty group conversation (no first message needed).
// Used when a user opens a group chat that has no prior conversation.
async function ensureGroupConversation(groupId, userId) {
  return withTransaction(async (req) => {
    // Re-check if one was created concurrently
    const existing = await req()
      .input('groupId', sql.Int, groupId)
      .query(`
        SELECT TOP 1 conversation_id AS conversationId
        FROM comm_conversations
        WHERE group_id = @groupId AND is_deleted = 0
        ORDER BY last_message_at DESC
      `);
    if (existing.recordset[0]) {
      const convId = existing.recordset[0].conversationId;
      // Ensure caller is a participant
      await req()
        .input('convId', sql.Int, convId)
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          IF EXISTS (SELECT 1 FROM comm_participants WHERE conversation_id = @convId AND user_id = @userId)
            UPDATE comm_participants SET is_deleted = 0 WHERE conversation_id = @convId AND user_id = @userId
          ELSE
            INSERT INTO comm_participants (conversation_id, user_id, participant_type) VALUES (@convId, @userId, 'to')
        `);
      return { conversationId: convId };
    }

    // Get group info
    const grpRes = await req()
      .input('groupId', sql.Int, groupId)
      .query(`SELECT group_name FROM comm_groups WHERE group_id = @groupId`);
    const groupName = grpRes.recordset[0]?.group_name || 'Group Chat';

    // Create the conversation
    const convRes = await req()
      .input('subject',  sql.NVarChar, groupName)
      .input('userId',   sql.UniqueIdentifier, userId)
      .input('groupId',  sql.Int, groupId)
      .query(`
        INSERT INTO comm_conversations (subject, created_by, allow_reply, conv_type, group_id)
        OUTPUT INSERTED.conversation_id AS conversationId
        VALUES (@subject, @userId, 1, 'group_thread', @groupId)
      `);
    const conversationId = convRes.recordset[0].conversationId;

    // Add all group members as participants
    const memberIds = await getMemberUserIdsForGroups([groupId]);
    const allIds = [...new Set([...memberIds, userId].map(String))];
    for (const memberId of allIds) {
      await req()
        .input('convId',   sql.Int,              conversationId)
        .input('memberId', sql.UniqueIdentifier,  memberId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM comm_participants WHERE conversation_id = @convId AND user_id = @memberId)
            INSERT INTO comm_participants (conversation_id, user_id, participant_type) VALUES (@convId, @memberId, 'to')
        `);
    }

    return { conversationId, subject: groupName, groupName, convType: 'group_thread' };
  });
}

module.exports = {
  listGroupsForUser,
  createGroup,
  getGroupMembers,
  getMemberUserIdsForGroups,
  addMembers,
  removeMember,
  setMemberAdminStatus,
  disableGroup,
  enableGroup,
  deleteGroupForActor,
  hideDisabledGroupForUser,
  assertGroupMember,
  assertGroupAdmin,
  assertCanManageAdmins,
  isGroupAdminOrSuperAdmin,
  getLatestGroupConversation,
  ensureGroupConversation,
};