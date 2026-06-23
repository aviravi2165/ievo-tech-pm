const {login,getMe,searchUsers,changePassword,setInitialPassword} = require('../services/authService');

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
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

    const users = await searchUsers(
      q,
      limit,
      req.user.userId
    );

    res.json({ users });
  } catch (err) {
    next(err);
  }
}

async function handleChangePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    await changePassword(
      req.user.userId,
      currentPassword,
      newPassword
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
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

    res.json({
      success: true,
      message: 'Password set successfully'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleLogin,
  handleMe,
  handleUserSearch,
  handleChangePassword,
  handleSetInitialPassword
};