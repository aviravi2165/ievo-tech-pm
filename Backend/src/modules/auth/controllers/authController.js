const {
  login,
  getMe,
  searchUsers,
  changePassword,
  setInitialPassword,
  forgotPassword,
} = require('../services/authService');

async function handleLogin(req, res, next) {
  try {
    const result = await login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function handleMe(req, res, next) {
  try {
    const user = await getMe(req.user.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function handleUserSearch(req, res, next) {
  try {
    const q     = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const users = await searchUsers(q, limit, req.user.userId);
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

async function handleChangePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    await changePassword(req.user.userId, currentPassword, newPassword);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

async function handleSetInitialPassword(req, res, next) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    await setInitialPassword(req.user.userId, newPassword);
    res.json({ success: true, message: 'Password set successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot-password  (public — no auth required)
 *
 * Accepts { email } in the request body. Generates a new temporary password,
 * sets must_change_password = 1, and emails the new credentials to the user.
 *
 * Always responds with 200 and the same generic message regardless of whether
 * the email address is registered — this prevents account enumeration.
 *
 * If SMTP is not configured or sending fails, we return 500 so the admin can
 * see the error in server logs and fall back to sharing the temp password
 * manually.
 */
async function handleForgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    await forgotPassword(email.trim());
    // Always the same message — do not confirm whether the email is registered
    res.json({
      success: true,
      message: 'If that email address is registered, you will receive a password reset email shortly.',
    });
  } catch (err) {
    // SMTP failure — log it but don't expose internals
    console.error('[forgot-password] Failed to send reset email:', err.message);
    next(err);
  }
}

module.exports = {
  handleLogin,
  handleMe,
  handleUserSearch,
  handleChangePassword,
  handleSetInitialPassword,
  handleForgotPassword,
};