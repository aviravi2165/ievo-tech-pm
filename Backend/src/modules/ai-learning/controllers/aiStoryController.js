'use strict';

const fs = require('fs');
const svc = require('../services/aiStoryService');
const { buildStoryPdf } = require('../services/aiStoryPdf');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const isAdmin = (req) => req.user?.userType === 'admin';

module.exports = {
  // ── Public (no login) ──
  formOptions: wrap(async (_req, res) => res.json(await svc.getFormOptions())),
  submit: wrap(async (req, res) => {
    // Honeypot: the form has a hidden "website" field real people never see.
    // A bot that fills it gets a normal-looking success and nothing is saved.
    if (req.body?.website) {
      for (const f of Object.values(req.files || {}).flat()) { try { fs.unlinkSync(f.path); } catch { /* ignore */ } }
      return res.status(201).json({ submitted: true });
    }
    res.status(201).json(await svc.submitStory(req.body || {}, req.files || {}));
  }),

  // ── Logged in ──
  list: wrap(async (req, res) => {
    const { status, deptId, aiModel, search } = req.query;
    res.json(await svc.listStories({ status, deptId, aiModel, search }, isAdmin(req)));
  }),
  review: wrap(async (req, res) => res.json(await svc.reviewStory(req.params.storyId, req.body?.action, req.body?.note, req.user.userId))),
  remove: wrap(async (req, res) => res.json(await svc.deleteStory(req.params.storyId))),
  pdf: wrap(async (req, res) => {
    const story = await svc.getStoryForPdf(req.params.storyId, isAdmin(req));
    const buf = await buildStoryPdf(story);
    const safeTitle = story.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'story';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Your AI Story - ${safeTitle}.pdf"`);
    res.send(buf);
  }),
  download: wrap(async (req, res) => {
    const f = await svc.getFileForDownload(req.params.storyId, req.params.fileId, isAdmin(req));
    res.download(f.fullPath, f.originalName);
  }),
};
