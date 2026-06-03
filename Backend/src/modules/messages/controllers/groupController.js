const groupService = require('../services/groupService');

function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    error: err.message,
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
    const groupName = (req.body.groupName || '').trim();
    if (!groupName) {
      return res.status(400).json({ error: 'groupName is required' });
    }
    const group = await groupService.createGroup(req.user.userId, groupName);
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
    const members = await groupService.addMembers(
      groupId,
      req.user.userId,
      userIds
    );
    return res.json(members);
  } catch (err) {
    return handleError(res, err);
  }
}

async function removeMember(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    const memberUserId = parseInt(req.params.userId, 10);
    if (Number.isNaN(groupId) || Number.isNaN(memberUserId)) {
      return res.status(400).json({ error: 'Invalid id' });
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

async function remove(req, res) {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (Number.isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group id' });
    }
    await groupService.softDeleteGroup(groupId, req.user.userId);
    return res.json({ success: true });
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
  remove,
};
