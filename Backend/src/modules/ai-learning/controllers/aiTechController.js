'use strict';

const fs = require('fs');
const svc = require('../services/aiTechService');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const isAdmin = (req) => req.user?.userType === 'admin';

module.exports = {
  // ── Public (no login) ──
  formOptions: wrap(async (_req, res) => res.json(await svc.getFormOptions())),
  submit: wrap(async (req, res) => {
    // Honeypot — see aiStoryController.submit.
    if (req.body?.website) {
      for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch { /* ignore */ } }
      return res.status(201).json({ submitted: true });
    }
    res.status(201).json(await svc.submitTechPost(req.body || {}, req.files || []));
  }),
  // Files of an APPROVED post only (the service refuses anything else when not admin).
  publicDownload: wrap(async (req, res) => {
    const f = await svc.getFileForDownload(Number(req.params.postId), Number(req.params.fileId), false);
    res.download(f.fullPath, f.originalName);
  }),

  // ── Logged in (admin) ──
  list: wrap(async (req, res) => {
    const { status, deptId, search } = req.query;
    res.json(await svc.listTechPosts({ status, deptId, search }));
  }),
  review: wrap(async (req, res) => res.json(await svc.reviewTechPost(Number(req.params.postId), req.body?.action, req.body?.note, req.user.userId))),
  remove: wrap(async (req, res) => res.json(await svc.deleteTechPost(Number(req.params.postId)))),
  download: wrap(async (req, res) => {
    const f = await svc.getFileForDownload(Number(req.params.postId), Number(req.params.fileId), isAdmin(req));
    res.download(f.fullPath, f.originalName);
  }),
};
