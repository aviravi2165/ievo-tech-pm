const { Router } = require('express');
const { handleLogin, handleMe, handleUserSearch } = require('../controllers/authController');
const { authenticate } = require('../../../middleware/auth');

const router = Router();

// POST /api/auth/login — public, no JWT required
router.post('/login', handleLogin);

// GET /api/auth/me — requires valid JWT, used on app load
router.get('/me', authenticate, handleMe);

// GET /api/users/search?q=   — search users for RecipientPicker
// Mounted separately in auth/index.js as /api/users
router.get('/search', authenticate, handleUserSearch);

module.exports = router;