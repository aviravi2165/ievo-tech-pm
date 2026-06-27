const { Router } = require('express');
const {
  handleLogin,
  handleMe,
  handleUserSearch,
  handleChangePassword,
  handleSetInitialPassword,
  handleForgotPassword,
} = require('../controllers/authController');
const {
  handleGetDepartments,
  handleGetUsers,
  handleRegisterUser,
  handleUpdateUser,
} = require('../controllers/userManagementController');
const { authenticate, requireAdmin } = require('../../../middleware/auth');

const router = Router();

// ── Public (no auth) ──────────────────────────────────────────────────────────
router.post('/login',           handleLogin);
router.post('/forgot-password', handleForgotPassword);

// ── Authenticated (any user) ──────────────────────────────────────────────────
router.get('/me',                    authenticate, handleMe);
router.get('/search',                authenticate, handleUserSearch);
router.post('/change-password',      authenticate, handleChangePassword);
router.post('/set-initial-password', authenticate, handleSetInitialPassword);

// ── Admin only — User Management ─────────────────────────────────────────────
// NOTE: static paths (/departments, /list, /register) MUST come before the
// dynamic /:userId param so Express doesn't swallow them as IDs.
router.get('/departments',   authenticate, requireAdmin, handleGetDepartments);
router.get('/list',          authenticate, requireAdmin, handleGetUsers);
router.post('/register',     authenticate, requireAdmin, handleRegisterUser);
router.patch('/:userId',     authenticate, requireAdmin, handleUpdateUser);

module.exports = router;