'use strict';

const svc = require('../services/budgetService');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

module.exports = {
  list:      wrap(async (req, res) => res.json(await svc.listExpenses(req.pmProjectId, req.user.userId, req.projectRole))),
  create:    wrap(async (req, res) => res.status(201).json(await svc.createExpense(req.pmProjectId, req.body || {}, req.files, req.user.userId, req.projectRole))),
  update:    wrap(async (req, res) => res.json(await svc.updateExpense(req.pmProjectId, req.params.expenseId, req.body || {}, req.files, req.user.userId, req.projectRole))),
  remove:    wrap(async (req, res) => res.json(await svc.deleteExpense(req.pmProjectId, req.params.expenseId, req.user.userId, req.projectRole))),
  reimburse: wrap(async (req, res) => res.json(await svc.setReimbursed(req.pmProjectId, req.params.expenseId, req.body?.reimbursed !== false, req.user.userId, req.projectRole))),
  bulkReimburse: wrap(async (req, res) => res.json(await svc.bulkReimburse(req.pmProjectId, req.body?.expenseIds, req.user.userId, req.projectRole))),
  downloadInvoice: wrap(async (req, res) => {
    const f = await svc.getInvoiceForDownload(req.pmProjectId, req.params.expenseId, req.params.fileId, req.user.userId, req.projectRole);
    res.download(f.fullPath, f.originalName);
  }),
};
