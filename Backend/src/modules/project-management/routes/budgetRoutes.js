'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole } = require('../middleware/projectRole');
const { uploadMultiple, handleUploadError } = require('../../../middleware/upload');
const ctrl = require('../controllers/budgetController');

const setProjectId = (req, _, next) => { req.pmProjectId = req.params.id; next(); };

router.use(authenticate);

// Read — Viewer+ (non-Managers only ever get their own expenses back).
// Add — Member+, with invoice file(s) as multipart field "files".
// Edit/delete/reimburse — creator or Manager (enforced in the service).
router.get('/projects/:id/expenses',                          setProjectId, requireRole('Viewer'), ctrl.list);
router.post('/projects/:id/expenses',                         setProjectId, requireRole('Member'), uploadMultiple, handleUploadError, ctrl.create);
// Before the :expenseId routes so "reimburse" isn't read as an id.
router.post('/projects/:id/expenses/reimburse',               setProjectId, requireRole('Member'), ctrl.bulkReimburse);
router.patch('/projects/:id/expenses/:expenseId',             setProjectId, requireRole('Member'), uploadMultiple, handleUploadError, ctrl.update);
router.delete('/projects/:id/expenses/:expenseId',            setProjectId, requireRole('Member'), ctrl.remove);
router.post('/projects/:id/expenses/:expenseId/reimburse',    setProjectId, requireRole('Member'), ctrl.reimburse);
router.get('/projects/:id/expenses/:expenseId/invoices/:fileId', setProjectId, requireRole('Viewer'), ctrl.downloadInvoice);

module.exports = router;
