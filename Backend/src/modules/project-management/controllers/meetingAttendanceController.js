'use strict';

const svc = require('../services/meetingAttendanceService');

// Note: no separate isAdmin() check needed here — requireRole (routes file)
// already elevates admins to req.projectRole = 'Manager' for every project,
// same bypass the rest of this module uses.
const listMeetings = async (req, res, next) => {
  try {
    const { search, dateFrom, dateTo } = req.query;
    res.json(await svc.listMeetings(req.pmProjectId, req.projectRole, { search, dateFrom, dateTo }));
  } catch (e) { next(e); }
};

// Manager only (route-gated).
const createMeeting = async (req, res, next) => {
  try {
    const { title, meetingDate, description, memberIds } = req.body;
    res.status(201).json(await svc.createMeeting(req.pmProjectId, { title, meetingDate, description, memberIds }, req.user.userId));
  } catch (e) { next(e); }
};

const getMeeting = async (req, res, next) => {
  try { res.json(await svc.getMeetingDetail(req.params.meetingId, req.pmProjectId, req.user.userId, req.projectRole)); }
  catch (e) { next(e); }
};

// Manager only.
const updateMeeting = async (req, res, next) => {
  try {
    const { title, meetingDate, description } = req.body;
    res.json(await svc.updateMeeting(req.params.meetingId, req.pmProjectId, { title, meetingDate, description }, req.user.userId));
  } catch (e) { next(e); }
};

// Manager only — replace the meeting's roster.
const updateMembers = async (req, res, next) => {
  try { res.json(await svc.updateMeetingMembers(req.params.meetingId, req.pmProjectId, req.body.memberIds, req.user.userId)); }
  catch (e) { next(e); }
};

// Manager only — soft-cancel.
const cancelMeeting = async (req, res, next) => {
  try { res.json(await svc.cancelMeeting(req.params.meetingId, req.pmProjectId, req.user.userId)); }
  catch (e) { next(e); }
};

// Manager only — set one member's official status/remarks.
const markAttendance = async (req, res, next) => {
  try {
    const { status, remarks } = req.body;
    res.json(await svc.markAttendance(req.params.meetingId, req.pmProjectId, req.params.uid, status, remarks, req.user.userId));
  } catch (e) { next(e); }
};

// Member (or Manager, though they'd never need to) — submit a request for
// THEIR OWN attendance only. requestedBy always comes from the authenticated
// session, never the request body, so nobody can request on someone else's
// behalf even if they tried to pass a different userId.
const createChangeRequest = async (req, res, next) => {
  try {
    const { requestedStatus, reason } = req.body;
    res.status(201).json(await svc.createChangeRequest(req.params.meetingId, req.pmProjectId, req.user.userId, requestedStatus, reason));
  } catch (e) { next(e); }
};

// Manager only (route-gated) — service also blocks self-approval.
const approveChangeRequest = async (req, res, next) => {
  try { res.json(await svc.decideChangeRequest(req.params.requestId, req.pmProjectId, req.user.userId, 'approve', req.body?.note)); }
  catch (e) { next(e); }
};
const rejectChangeRequest = async (req, res, next) => {
  try { res.json(await svc.decideChangeRequest(req.params.requestId, req.pmProjectId, req.user.userId, 'reject', req.body?.note)); }
  catch (e) { next(e); }
};

// Requester withdraws their own still-pending request.
const cancelChangeRequest = async (req, res, next) => {
  try { res.json(await svc.cancelChangeRequest(req.params.requestId, req.pmProjectId, req.user.userId)); }
  catch (e) { next(e); }
};

module.exports = {
  listMeetings, createMeeting, getMeeting, updateMeeting, updateMembers, cancelMeeting,
  markAttendance, createChangeRequest, approveChangeRequest, rejectChangeRequest, cancelChangeRequest,
};
