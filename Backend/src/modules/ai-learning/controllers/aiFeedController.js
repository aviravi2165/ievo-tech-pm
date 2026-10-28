'use strict';

const feed = require('../services/aiFeedService');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

module.exports = {
  // ── Public (no login) ──
  options: wrap(async (_req, res) => res.json(await feed.getFeedOptions())),
  list: wrap(async (req, res) => {
    const { type, deptId, q, page, email } = req.query;
    res.json(await feed.listFeed({ type, deptId, q, page, email }));
  }),
  comments: wrap(async (req, res) => res.json(await feed.listComments(req.params.type, req.params.id))),
  addComment: wrap(async (req, res) => {
    // Honeypot: real people never see the hidden "website" field. A bot that fills it
    // gets a normal-looking reply and nothing is saved.
    if (req.body?.website) return res.status(201).json({ comment: null });
    const { name, email, body } = req.body || {};
    res.status(201).json(await feed.addComment(req.params.type, req.params.id, name, email, body));
  }),
  like: wrap(async (req, res) => {
    const { name, email } = req.body || {};
    res.json(await feed.toggleLike(req.params.type, req.params.id, name, email));
  }),

  // ── Admin (route-gated by requireAdmin) ──
  recentComments: wrap(async (_req, res) => res.json(await feed.listRecentComments())),
  removeComment: wrap(async (req, res) => res.json(await feed.deleteComment(req.params.commentId))),
};
