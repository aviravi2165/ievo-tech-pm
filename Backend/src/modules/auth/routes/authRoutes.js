const { Router } = require('express');
const {
  handleLogin,
  handleMe,
  handleUserSearch,
  handleChangePassword,
  handleSetInitialPassword
} = require('../controllers/authController');
const { authenticate } = require('../../../middleware/auth');

const router = Router();

// POST /api/auth/login — public, no JWT required
router.post('/login', handleLogin);

// GET /api/auth/me — requires valid JWT, used on app load
router.get('/me', authenticate, handleMe);

// GET /api/users/search?q=   — search users for RecipientPicker
// Mounted separately in auth/index.js as /api/users
router.get('/search', authenticate, handleUserSearch);

router.post(
  '/change-password',
  authenticate,
  handleChangePassword
);

// POST /api/auth/set-initial-password — forced first-login password change.
// No currentPassword required: the JWT already proves they just authenticated
// with the temp password; setInitialPassword() re-checks must_change_password
// server-side so this can't be reused once that flag is cleared.
router.post(
  '/set-initial-password',
  authenticate,
  handleSetInitialPassword
);

module.exports = router;