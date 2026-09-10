'use strict';

const svc = require('../services/reportService');
const isAdmin = (req) => req.user.userType === 'admin';

// The report conversation to open + its members + whether the caller can manage.
const getReport = async (req, res, next) => {
  try { res.json(await svc.getReportForUser(req.params.id, req.user.userId, isAdmin(req))); }
  catch (e) { next(e); }
};

const listMembers = async (req, res, next) => {
  try {
    if (!(await svc.canAccessReport(req.user.userId, req.params.id, isAdmin(req)))) {
      const e = new Error('You do not have access to this project report.'); e.statusCode = 403; throw e;
    }
    res.json(await svc.listReportMembers(req.params.id));
  } catch (e) { next(e); }
};

// Member management — admin only (route-gated).
const addMember    = async (req, res, next) => { try { res.json(await svc.addReportMember(req.params.id, req.body.userId, req.user.userId)); } catch (e) { next(e); } };
const removeMember = async (req, res, next) => { try { res.json(await svc.removeReportMember(req.params.id, req.params.uid, req.user.userId)); } catch (e) { next(e); } };

// DPR — every project report the caller can see (admin = all; else their own).
const listDpr = async (req, res, next) => { try { res.json(await svc.listAccessibleReports(req.user.userId, isAdmin(req))); } catch (e) { next(e); } };

module.exports = { getReport, listMembers, addMember, removeMember, listDpr };
