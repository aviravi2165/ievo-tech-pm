const groupService = require('../services/groupService');

function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    error:   err.message,
    message: err.message,
  });
}

async function list(req, res) {
  try {
    const groups = await groupService.listGroupsForUser(req.user.userId);
    return res.json(groups);
  } catch (err) {
    return handleError(res, err);
  }
}

async function create(req, res) {
  try {
    const groupName    = (req.body.groupName    || '').trim();
    const description  = (req.body.description  || '').trim() || null;
    if (!groupName) {
      return res.status(400).json({ error: 'groupName is required' });
    }
    const group = await groupService.createGroup(req.user.userId, groupName, description);
    return res.status(201).json(group);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getMembers(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    const members = await groupService.getGroupMembers(groupId, req.user.userId);
    return res.json(members);
  } catch (err) {
    return handleError(res, err);
  }
}

async function addMembers(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
    if (userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }
    const members = await groupService.addMembers(groupId, req.user.userId, userIds);
    return res.json(members);
  } catch (err) {
    return handleError(res, err);
  }
}

async function removeMember(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }

    // userId is a UUID string — do NOT parseInt() it.
    const memberUserId = req.params.userId;
    if (!memberUserId || typeof memberUserId !== 'string' || !memberUserId.trim()) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const removed = await groupService.removeMember(
      groupId,
      req.user.userId,
      memberUserId
    );

    if (!removed) {
      return res.status(404).json({ error: 'Member not found' });
    }
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * NEW: PATCH /api/groups/:groupId/disable
 * Admin (creator) or super admin only. Freezes the chat — no further
 * messages from anyone — while keeping history visible to all.
 */
/**
 * NEW: PATCH /api/groups/:groupId/members/:userId/admin
 * Body: { makeAdmin: boolean }
 * Only the group's original creator or the org super admin may call
 * this — promotes or demotes a participant's co-admin status. The
 * creator itself can never be the target (they're always admin).
 */
async function setAdmin(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    const targetUserId = req.params.userId;
    if (!targetUserId || typeof targetUserId !== 'string' || !targetUserId.trim()) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const makeAdmin = Boolean(req.body.makeAdmin);
    const members = await groupService.setMemberAdminStatus(
      groupId, req.user.userId, targetUserId, makeAdmin
    );
    return res.json(members);
  } catch (err) {
    return handleError(res, err);
  }
}

async function disable(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    await groupService.disableGroup(groupId, req.user.userId);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * NEW: PATCH /api/groups/:groupId/enable
 * Admin (creator) or super admin only. Reverses disable().
 */
async function enable(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    await groupService.enableGroup(groupId, req.user.userId);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * CHANGED: DELETE /api/groups/:groupId
 * Admin (creator) or super admin only, and only once the group is
 * already disabled. Removes the group from the caller's own tabs —
 * other participants are unaffected and keep seeing it (read-only)
 * until they each remove it themselves via /hide.
 */
async function remove(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    await groupService.deleteGroupForActor(groupId, req.user.userId);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * NEW: POST /api/groups/:groupId/hide
 * Any participant — only once the group has been disabled by its admin.
 * Removes the group from the caller's own Inbox/Sent/Groups tabs only.
 */
async function hide(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    await groupService.hideDisabledGroupForUser(groupId, req.user.userId);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getGroupConversation(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    await groupService.assertGroupMember(groupId, req.user.userId);
    const conv = await groupService.getLatestGroupConversation(groupId, req.user.userId);
    if (!conv) {
      return res.status(404).json({ error: 'No conversation found for this group' });
    }
    return res.json(conv);
  } catch (err) {
    return handleError(res, err);
  }
}

async function createGroupConversation(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    await groupService.assertGroupMember(groupId, req.user.userId);
    // Return existing conversation if one exists, otherwise create one
    let conv = await groupService.getLatestGroupConversation(groupId, req.user.userId);
    if (!conv) {
      conv = await groupService.ensureGroupConversation(groupId, req.user.userId);
    }
    return res.json(conv);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  list,
  create,
  getMembers,
  addMembers,
  removeMember,
  setAdmin,
  disable,
  enable,
  remove,
  hide,
  getGroupConversation,
  createGroupConversation,
};