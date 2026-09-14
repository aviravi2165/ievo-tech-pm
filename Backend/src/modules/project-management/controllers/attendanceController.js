'use strict';

const svc = require('../services/attendanceService');

const todayStr = () => new Date().toISOString().slice(0, 10);

const getForDate = async (req, res, next) => {
  try { res.json(await svc.getForDate(req.pmProjectId, req.query.date || todayStr())); }
  catch (e) { next(e); }
};

const checkIn = async (req, res, next) => {
  try { res.json(await svc.checkIn(req.pmProjectId, req.user.userId, req.body.status, req.body.note)); }
  catch (e) { next(e); }
};

// Manager/admin only (route-gated) — set any member's status for any date.
const setStatus = async (req, res, next) => {
  try {
    const { date, status, note } = req.body;
    res.json(await svc.setStatus(req.pmProjectId, req.params.uid, date, status, note, req.user.userId));
  } catch (e) { next(e); }
};

const getMonthSummary = async (req, res, next) => {
  try { res.json(await svc.getMonthSummary(req.pmProjectId, req.query.month || todayStr().slice(0, 7))); }
  catch (e) { next(e); }
};

module.exports = { getForDate, checkIn, setStatus, getMonthSummary };
