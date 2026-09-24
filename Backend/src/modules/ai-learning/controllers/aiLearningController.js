'use strict';

const svc = require('../services/aiLearningService');

const isAdmin = (req) => req.user.userType === 'admin';

// One round trip: which view should the frontend render (single chat vs
// manager list+conversation), plus the viewer's own thread either way —
// an admin/manager still has their OWN journal available if they ever want
// to log something themselves, even though opening the module lands them
// on the employee list per the spec.
const getContext = async (req, res, next) => {
  try {
    const [viewerContext, myThread] = await Promise.all([
      svc.getViewerContext(req.user.userId, isAdmin(req)),
      svc.getMyThread(req.user.userId),
    ]);
    res.json({ ...viewerContext, myThread });
  } catch (e) { next(e); }
};

const listEmployees = async (req, res, next) => {
  try { res.json(await svc.listAuthorizedEmployees(req.user.userId, isAdmin(req), req.query.search)); }
  catch (e) { next(e); }
};

const getEmployeeThread = async (req, res, next) => {
  try { res.json(await svc.getEmployeeThread(req.params.employeeId, req.user.userId, isAdmin(req))); }
  catch (e) { next(e); }
};

module.exports = { getContext, listEmployees, getEmployeeThread };
