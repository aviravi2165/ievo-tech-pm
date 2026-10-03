'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole } = require('../middleware/projectRole');
const ctrl = require('../controllers/budgetController');

const setProjectId = (req, _, next) => { req.pmProjectId = req.params.id; next(); };

router.use(authenticate);

// Read — Viewer+. Add — Member+. Edit/delete — creator or Manager (service).
// Reimburse — Manager only.
router.get('/projects/:id/expenses',                       setProjectId, requireRole('Viewer'),  ctrl.list);
router.post('/projects/:id/expenses',                      setProjectId, requireRole('Member'),  ctrl.create);
router.patch('/projects/:id/expenses/:expenseId',          setProjectId, requireRole('Member'),  ctrl.update);
router.delete('/projects/:id/expenses/:expenseId',         setProjectId, requireRole('Member'),  ctrl.remove);
router.post('/projects/:id/expenses/:expenseId/reimburse', setProjectId, requireRole('Manager'), ctrl.reimburse);

module.exports = router;
