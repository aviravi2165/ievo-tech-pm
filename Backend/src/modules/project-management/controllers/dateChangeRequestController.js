'use strict';

const svc = require('../services/dateChangeRequestService');

const isAdmin = (req) => req.user.userType === 'admin';

const create = async (req, res, next) => {
  try {
    const { projectId, entityType, entityId, field, newValue, reason, approverId } = req.body;
    const request = await svc.createRequest({
      projectId, entityType, entityId, field, newValue, reason, approverId,
      requestedBy: req.user.userId,
    });
    res.status(201).json(request);
  } catch (e) { next(e); }
};

const listPending = async (req, res, next) => {
  try { res.json(await svc.listForApprover(req.user.userId, req.query.projectId ? Number(req.query.projectId) : null)); }
  catch (e) { next(e); }
};

const listMine = async (req, res, next) => {
  try { res.json(await svc.listMine(req.user.userId, req.query.projectId ? Number(req.query.projectId) : null)); }
  catch (e) { next(e); }
};

const approve = async (req, res, next) => {
  try { res.json(await svc.decide(req.params.id, req.user.userId, isAdmin(req), 'approve', req.body?.note)); }
  catch (e) { next(e); }
};

const reject = async (req, res, next) => {
  try { res.json(await svc.decide(req.params.id, req.user.userId, isAdmin(req), 'reject', req.body?.note)); }
  catch (e) { next(e); }
};

const cancelRequest = async (req, res, next) => {
  try { res.json(await svc.cancel(req.params.id, req.user.userId)); }
  catch (e) { next(e); }
};

module.exports = { create, listPending, listMine, approve, reject, cancel: cancelRequest };
