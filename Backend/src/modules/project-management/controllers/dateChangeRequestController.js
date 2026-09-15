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

// Every request ever addressed to the caller (any status) — the "who
// requested this, and why" log a designated approver needs. Self-scoped
// (req.user.userId), so no extra access check needed here.
const listHistory = async (req, res, next) => {
  try { res.json(await svc.listHistoryForApprover(req.user.userId)); }
  catch (e) { next(e); }
};

// The fixed approver list a requester picks from (admins ∪ pm_date_approvers).
// Any authenticated user can read this — it's who's-in-the-list, not the
// management screen (that's listApprovers/addApprover/removeApprover below).
const listEligibleApprovers = async (req, res, next) => {
  try { res.json(await svc.listEligibleApprovers()); }
  catch (e) { next(e); }
};

// ── Approver management — admin-only (route-gated) ──────────────────────────
const listApprovers = async (req, res, next) => {
  try { res.json(await svc.listApprovers()); }
  catch (e) { next(e); }
};
const addApprover = async (req, res, next) => {
  try { res.json(await svc.addApprover(req.body.userId, req.user.userId)); }
  catch (e) { next(e); }
};
const removeApprover = async (req, res, next) => {
  try { res.json(await svc.removeApprover(req.params.userId)); }
  catch (e) { next(e); }
};

module.exports = {
  create, listPending, listMine, listHistory, approve, reject, cancel: cancelRequest,
  listEligibleApprovers, listApprovers, addApprover, removeApprover,
};
