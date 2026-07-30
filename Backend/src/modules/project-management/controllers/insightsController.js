const svc = require('../services/insightsService');

const getCatalog = async (req, res, next) => { try { res.json(svc.getCatalog()); } catch (e) { next(e); } };
const getAdded   = async (req, res, next) => { try { res.json(await svc.getVisibleInsights(req.params.id)); } catch (e) { next(e); } };
const add        = async (req, res, next) => {
  try { await svc.setInsightVisibility(req.params.id, req.body.insightType, true, req.user.userId); res.json({ ok: true }); }
  catch (e) { next(e); }
};
const remove     = async (req, res, next) => {
  try { await svc.setInsightVisibility(req.params.id, req.params.type, false, req.user.userId); res.json({ ok: true }); }
  catch (e) { next(e); }
};
const getData    = async (req, res, next) => { try { res.json(await svc.getInsightsData(req.params.id)); } catch (e) { next(e); } };

module.exports = { getCatalog, getAdded, add, remove, getData };
