const { login, getMe, searchUsers } = require('../services/authService');

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
    const users = await searchUsers(q, limit, req.user.userId);
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

module.exports = { handleLogin, handleMe, handleUserSearch };