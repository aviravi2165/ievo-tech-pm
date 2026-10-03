'use strict';

const svc = require('../services/meetingMinutesService');

const listMinutes = async (req, res, next) => {
  try { res.json(await svc.listMinutes(req.params.meetingId, req.pmProjectId, req.user.userId, req.projectRole)); }
  catch (e) { next(e); }
};

const addMinute = async (req, res, next) => {
  try { res.status(201).json(await svc.addMinute(req.params.meetingId, req.pmProjectId, { body: req.body?.body, files: req.files }, req.user.userId, req.projectRole)); }
  catch (e) { next(e); }
};

const updateMinute = async (req, res, next) => {
  try { res.json(await svc.updateMinute(req.params.meetingId, req.pmProjectId, req.params.minuteId, req.body?.body, req.user.userId)); }
  catch (e) { next(e); }
};

const deleteMinute = async (req, res, next) => {
  try { res.json(await svc.deleteMinute(req.params.meetingId, req.pmProjectId, req.params.minuteId, req.user.userId, req.projectRole)); }
  catch (e) { next(e); }
};

const downloadFile = async (req, res, next) => {
  try {
    const f = await svc.getFileForDownload(req.params.meetingId, req.pmProjectId, req.params.fileId);
    res.download(f.fullPath, f.originalName);
  } catch (e) { next(e); }
};

module.exports = { listMinutes, addMinute, updateMinute, deleteMinute, downloadFile };
