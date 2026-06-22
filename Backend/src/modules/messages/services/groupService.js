<<<<<<< HEAD
const { getMssqlPool: _getPool } = require('../../../config/dbHelper');
let _pool;
async function getPool() { if (!_pool) _pool = await _getPool(); return _pool; }
=======
const { getPool } = require('../../../config/db');
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * True if userId is the group's original creator, a promoted co-admin
 * (comm_group_members.is_co_admin), OR the org-wide super admin
 * (auth_users.user_type === 'admin'). All three get identical power to
 * add/remove participants, disable, disable & delete, and (creator/super
 * admin only — see assertCanManageAdmins) promote/demote co-admins.
 */
async function isGroupAdminOrSuperAdmin(groupId, userId) {
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows } = await pool.query(
    `SELECT
       (g.created_by = $2::uuid)         AS "isCreator",
       COALESCE(gm.is_co_admin, FALSE)   AS "isCoAdmin",
       (u.user_type = 'admin')           AS "isSuperAdmin"
     FROM comm_groups g
     INNER JOIN auth_users u ON u.user_id = $2::uuid
     LEFT JOIN comm_group_members gm
       ON gm.group_id = g.group_id AND gm.user_id = $2::uuid
     WHERE g.group_id = $1`,
    [groupId, userId]
  );
  if (!rows[0]) return false;
  return rows[0].isCreator || rows[0].isCoAdmin || rows[0].isSuperAdmin;
}

async function assertGroupAdmin(groupId, userId) {
  const allowed = await isGroupAdminOrSuperAdmin(groupId, userId);
  if (!allowed) {
    const err = new Error('Only the group admin can do this');
    err.code = 'GROUP_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Only the original creator OR the org super admin can promote/demote
 * co-admins — a co-admin cannot mint other co-admins (and definitely
 * cannot demote the creator). This keeps the admin hierarchy from being
 * trivially escalated by someone who was only just promoted themselves.
 */
async function assertCanManageAdmins(groupId, userId) {
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows } = await pool.query(
    `SELECT
       (g.created_by = $2::uuid) AS "isCreator",
       (u.user_type = 'admin')   AS "isSuperAdmin"
     FROM comm_groups g
     INNER JOIN auth_users u ON u.user_id = $2::uuid
     WHERE g.group_id = $1`,
    [groupId, userId]
  );
  if (!rows[0] || !(rows[0].isCreator || rows[0].isSuperAdmin)) {
    const err = new Error('Only the group creator or a super admin can change admin roles');
    err.code = 'GROUP_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }
}

async function assertGroupMember(groupId, userId) {
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows } = await pool.query(
    `SELECT g.group_id FROM comm_groups g
     WHERE g.group_id = $1
       AND (
         g.created_by = $2::uuid
         OR EXISTS (
           SELECT 1 FROM comm_group_members gm
           WHERE gm.group_id = g.group_id AND gm.user_id = $2::uuid
         )
         OR EXISTS (
           SELECT 1 FROM auth_users u
           WHERE u.user_id = $2::uuid AND u.user_type = 'admin'
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

/**
 * Regular users: groups they created or are a member of, minus any they've
 * personally hidden (comm_group_hidden) — hiding is per-user and only
 * possible once a group is disabled. isAdmin now reflects creator OR
 * promoted co-admin status.
 *
 * Super admin: every group in the system, full stop — this is their
 * control surface for "just in case the group admin leaves the company."
 * Hiding does not apply to the super admin view.
 */
async function listGroupsForUser(userId) {
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648

  const { rows: meRows } = await pool.query(
    `SELECT user_type AS "userType" FROM auth_users WHERE user_id = $1::uuid`,
    [userId]
  );
  const isSuperAdmin = meRows[0]?.userType === 'admin';

  if (isSuperAdmin) {
    const { rows } = await pool.query(
      `SELECT
         g.group_id     AS "groupId",
         g.group_name   AS "groupName",
         g.created_at   AS "createdAt",
         g.created_by   AS "createdBy",
         g.is_active    AS "isActive",
         g.is_disabled  AS "isDisabled",
         FALSE          AS "isAdmin",      -- not the creator/co-admin
         TRUE           AS "isSuperAdmin", -- but has full control anyway
         FALSE          AS "isMember",     -- not a participant of the chat
         (
           SELECT COUNT(*)::int FROM comm_group_members gm2
           WHERE gm2.group_id = g.group_id
         ) AS "memberCount"
       FROM comm_groups g
       WHERE g.is_active = TRUE
       ORDER BY g.is_disabled ASC, g.created_at ASC`
    );
    return rows;
  }

  const { rows } = await pool.query(
    `SELECT
       g.group_id    AS "groupId",
       g.group_name  AS "groupName",
       g.created_at  AS "createdAt",
       g.created_by  AS "createdBy",
       g.is_active   AS "isActive",
       g.is_disabled AS "isDisabled",
       (g.created_by = $1::uuid OR COALESCE(gm.is_co_admin, FALSE)) AS "isAdmin",
       (g.created_by = $1::uuid) AS "isCreator",
       FALSE AS "isSuperAdmin",
       (gm.user_id IS NOT NULL) AS "isMember",
       (
         SELECT COUNT(*)::int
         FROM comm_group_members gm2
         WHERE gm2.group_id = g.group_id
       ) AS "memberCount"
     FROM comm_groups g
     LEFT JOIN comm_group_members gm
       ON gm.group_id = g.group_id AND gm.user_id = $1::uuid
     LEFT JOIN comm_group_hidden gh
       ON gh.group_id = g.group_id AND gh.user_id = $1::uuid
     WHERE g.is_active = TRUE
       AND gh.user_id IS NULL
       AND (g.created_by = $1::uuid OR gm.user_id IS NOT NULL)
     ORDER BY g.is_disabled ASC, g.created_at ASC`,
    [userId]
  );
  return rows;
}

// ── Create ────────────────────────────────────────────────────────────────────

async function createGroup(userId, groupName) {
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO comm_groups (group_name, created_by)
       VALUES ($1, $2::uuid)
       RETURNING group_id AS "groupId", group_name AS "groupName",
                 created_by AS "createdBy", created_at AS "createdAt"`,
      [groupName, userId]
    );
    const group = rows[0];

    await client.query(
      `INSERT INTO comm_group_members (group_id, user_id) VALUES ($1, $2::uuid)
       ON CONFLICT DO NOTHING`,
      [group.groupId, userId]
    );

    await client.query('COMMIT');
    return {
      ...group,
      isAdmin: true,
      isCreator: true,
      isSuperAdmin: false,
      isMember: true,
      isActive: true,
      isDisabled: false,
      memberCount: 1,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Members (view only for non-admins) ─────────────────────────────────────────

async function getGroupMembers(groupId, userId) {
  await assertGroupMember(groupId, userId);

<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows } = await pool.query(
    `SELECT
       u.user_id    AS "userId",
       u.email,
       u.first_name AS "firstName",
       u.last_name  AS "lastName",
       (g.created_by = u.user_id)        AS "isCreator",
       COALESCE(gm.is_co_admin, FALSE)   AS "isCoAdmin",
       (g.created_by = u.user_id OR COALESCE(gm.is_co_admin, FALSE)) AS "isAdmin"
     FROM comm_group_members gm
     INNER JOIN comm_groups g ON g.group_id = gm.group_id
     INNER JOIN auth_users u ON u.user_id = gm.user_id
     WHERE gm.group_id = $1
       AND u.is_active = TRUE
     ORDER BY (g.created_by = u.user_id) DESC, COALESCE(gm.is_co_admin, FALSE) DESC, u.last_name, u.first_name`,
    [groupId]
  );
  return rows;
}

async function getMemberUserIdsForGroups(groupIds = []) {
  if (!groupIds.length) return [];
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
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

// ── Add members — admin (creator/co-admin) OR super admin only ─────────────────

async function addMembers(groupId, actorUserId, userIds) {
  await assertGroupAdmin(groupId, actorUserId);

<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows: groupRows } = await pool.query(
    `SELECT is_disabled FROM comm_groups WHERE group_id = $1`, [groupId]
  );
  if (groupRows[0]?.is_disabled) {
    const err = new Error('This group is disabled. Re-enable it before adding members.');
    err.statusCode = 400;
    throw err;
  }

  // Prevent adding super-admin accounts as group members/participants
  const targetIds = [...new Set((userIds || []).map(String))].filter(Boolean);
  const { rows: targetRows } = await pool.query(
    `SELECT user_id FROM auth_users WHERE user_id = ANY($1::uuid[]) AND user_type = 'admin'`,
    [targetIds]
  );
  if (targetRows.length) {
    const err = new Error('Cannot add super-admin accounts as group members');
    err.statusCode = 400;
    throw err;
  }

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
      await client.query(
        `INSERT INTO comm_participants (conversation_id, user_id, participant_type)
         SELECT c.conversation_id, $2::uuid, 'to'
         FROM comm_conversations c
         WHERE c.group_id = $1 AND c.is_deleted = FALSE
         ON CONFLICT (conversation_id, user_id)
         DO UPDATE SET
           is_deleted = FALSE,
           is_archived = FALSE,
           archived_at = NULL,
           left_at = NULL,
           participant_type = 'to'`,
        [groupId, memberId]
      );
      // Re-adding someone un-hides the group for them, in case they had
      // previously removed a disabled version of it from their own tabs.
      await client.query(
        `DELETE FROM comm_group_hidden WHERE group_id = $1 AND user_id = $2::uuid`,
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

// ── Remove member — admin (creator/co-admin) OR super admin only ───────────────

async function removeMember(groupId, actorUserId, memberUserId) {
  await assertGroupAdmin(groupId, actorUserId);

<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows: groupRows } = await pool.query(
    `SELECT created_by, is_disabled FROM comm_groups WHERE group_id = $1`, [groupId]
  );
  if (!groupRows[0]) {
    const err = new Error('Group not found'); err.statusCode = 404; throw err;
  }
  if (String(groupRows[0].created_by) === String(memberUserId)) {
    const err = new Error('The group creator cannot be removed. Disable or delete the group instead.');
    err.statusCode = 400;
    throw err;
  }
  if (groupRows[0].is_disabled) {
    const err = new Error('This group is disabled. Re-enable it before removing members.');
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  let rowCount = 0;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `DELETE FROM comm_group_members
       WHERE group_id = $1 AND user_id = $2::uuid`,
      [groupId, memberUserId]
    );
    rowCount = result.rowCount;
    await client.query(
      `UPDATE comm_participants p
       SET left_at = COALESCE(left_at, NOW()), is_archived = FALSE
       FROM comm_conversations c
       WHERE p.conversation_id = c.conversation_id
         AND c.group_id = $1
         AND p.user_id = $2::uuid
         AND p.is_deleted = FALSE`,
      [groupId, memberUserId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return rowCount > 0;
}

// ── NEW: Promote / demote co-admin ──────────────────────────────────────────────

/**
 * setMemberAdminStatus — promotes or demotes a group participant's
 * co-admin status. Only the original creator or the org super admin may
 * call this (assertCanManageAdmins) — a co-admin cannot promote others or
 * demote anyone, preventing trivial privilege escalation. The creator
 * itself can never be demoted via this path (they aren't stored in
 * comm_group_members.is_co_admin at all — they're always admin by virtue
 * of comm_groups.created_by).
 */
async function setMemberAdminStatus(groupId, actorUserId, targetUserId, makeAdmin) {
  await assertCanManageAdmins(groupId, actorUserId);

<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows: groupRows } = await pool.query(
    `SELECT created_by, is_disabled FROM comm_groups WHERE group_id = $1`, [groupId]
  );
  if (!groupRows[0]) {
    const err = new Error('Group not found'); err.statusCode = 404; throw err;
  }
  if (String(groupRows[0].created_by) === String(targetUserId)) {
    const err = new Error('The group creator is always an admin and cannot be changed.');
    err.statusCode = 400;
    throw err;
  }
  if (groupRows[0].is_disabled) {
    const err = new Error('This group is disabled. Re-enable it before changing admin roles.');
    err.statusCode = 400;
    throw err;
  }

  const { rowCount } = await pool.query(
    `UPDATE comm_group_members
     SET is_co_admin = $3
     WHERE group_id = $1 AND user_id = $2::uuid`,
    [groupId, targetUserId, Boolean(makeAdmin)]
  );
  if (!rowCount) {
    const err = new Error('That user is not a member of this group.');
    err.statusCode = 404;
    throw err;
  }
  return getGroupMembers(groupId, actorUserId);
}

// ── Disable group (chat frozen, history stays visible to all) ─────────────────

/**
 * Admin (creator/co-admin) or super admin only. Freezes the group: no
 * one — not even an admin — can send further messages, but every
 * participant keeps full read access to everything said before the
 * freeze. The group still appears in everyone's tabs exactly as before;
 * only the "Delete" option becomes available to the admin/super admin
 * once disabled, and "remove from my tabs" becomes available to
 * participants.
 */
async function disableGroup(groupId, actorUserId) {
  await assertGroupAdmin(groupId, actorUserId);
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  await pool.query(
    `UPDATE comm_groups
     SET is_disabled = TRUE, disabled_at = NOW(), disabled_by = $2::uuid
     WHERE group_id = $1`,
    [groupId, actorUserId]
  );
  return true;
}

/** Re-enable a disabled group — admin (creator/co-admin) or super admin only. */
async function enableGroup(groupId, actorUserId) {
  await assertGroupAdmin(groupId, actorUserId);
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  await pool.query(
    `UPDATE comm_groups
     SET is_disabled = FALSE, disabled_at = NULL, disabled_by = NULL
     WHERE group_id = $1`,
    [groupId]
  );
  return true;
}

/**
 * Disable & Delete — admin (creator/co-admin) or super admin only, and
 * only once the group is already disabled (the UI enforces this by only
 * showing "Delete" after "Disable"). This removes the group from the
 * admin's own Inbox/Sent/Groups tabs (comm_group_hidden), exactly like a
 * participant hiding it — it does NOT delete the group for other
 * participants, who keep seeing it (read-only) until they each choose to
 * remove it from their own tabs too.
 */
async function deleteGroupForActor(groupId, actorUserId) {
  await assertGroupAdmin(groupId, actorUserId);

<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows } = await pool.query(
    `SELECT is_disabled FROM comm_groups WHERE group_id = $1`, [groupId]
  );
  if (!rows[0]) {
    const err = new Error('Group not found'); err.statusCode = 404; throw err;
  }
  if (!rows[0].is_disabled) {
    const err = new Error('Disable the group before deleting it.');
    err.statusCode = 400;
    throw err;
  }

  await pool.query(
    `INSERT INTO comm_group_hidden (group_id, user_id)
     VALUES ($1, $2::uuid)
     ON CONFLICT DO NOTHING`,
    [groupId, actorUserId]
  );
  return true;
}

/**
 * Participant-only "remove from my tabs" — available ONLY once the group
 * has been disabled by its admin. This hides the group from the calling
 * user's own Inbox/Sent/Groups views; it has no effect on any other
 * participant, and does not touch comm_group_members or the group itself.
 */
async function hideDisabledGroupForUser(groupId, userId) {
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows } = await pool.query(
    `SELECT is_disabled FROM comm_groups WHERE group_id = $1`, [groupId]
  );
  if (!rows[0]) {
    const err = new Error('Group not found'); err.statusCode = 404; throw err;
  }
  if (!rows[0].is_disabled) {
    const err = new Error('You can only remove a group from your tabs after it has been disabled.');
    err.statusCode = 400;
    throw err;
  }
  await assertGroupMember(groupId, userId);
  await pool.query(
    `INSERT INTO comm_group_hidden (group_id, user_id)
     VALUES ($1, $2::uuid)
     ON CONFLICT DO NOTHING`,
    [groupId, userId]
  );
  return true;
}

// ── Get latest conversation for a group ────────────────────────────────────────

async function getLatestGroupConversation(groupId, userId) {
<<<<<<< HEAD
  const pool = await getPool();
=======
  const pool = getPool();
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  const { rows } = await pool.query(
    `SELECT
       c.conversation_id   AS "conversationId",
       c.subject,
       c.allow_reply       AS "allowReply",
       c.last_message_at   AS "lastMessageAt",
       c.created_at        AS "createdAt",
       g.group_name        AS "groupName",
       g.is_disabled       AS "isGroupDisabled",
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
};