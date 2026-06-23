'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { getPool, sql } = require('../../../config/db');

// ── Login ─────────────────────────────────────────────────────────────────────

async function login({ username, password }) {
  if (!username || !password) {
    const err = new Error('Username and password are required');
    err.statusCode = 400; throw err;
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('username', sql.NVarChar, username.trim().toLowerCase())
    .query(`
      SELECT TOP 1 user_id, username, password_hash, first_name, last_name,
                   email, user_type, is_active, allow_login, profile_picture,
                   dept_id, must_change_password
      FROM auth_users
      WHERE username = @username
    `);

  const user = result.recordset[0];
  if (!user || !user.is_active || !user.allow_login) {
    const err = new Error('Invalid credentials'); err.statusCode = 401; throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid credentials'); err.statusCode = 401; throw err;
  }

  const payload = {
    userId:      user.user_id,
    username:    user.username,
    displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    email:       user.email,
    userType:    user.user_type,
    deptId:      user.dept_id,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  return {
    token,
    user: {
      userId:            user.user_id,
      username:          user.username,
      firstName:         user.first_name,
      lastName:          user.last_name,
      email:             user.email,
      userType:          user.user_type,
      profilePicture:    user.profile_picture,
      deptId:            user.dept_id,
      mustChangePassword: Boolean(user.must_change_password),
    },
  };
}

// ── Get current user ──────────────────────────────────────────────────────────

async function getMe(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT user_id, username, first_name, last_name, email,
             user_type, profile_picture, dept_id, must_change_password
      FROM auth_users
      WHERE user_id = @userId AND is_active = 1
    `);

  const u = result.recordset[0];
  if (!u) {
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }

  return {
    userId:            u.user_id,
    username:          u.username,
    firstName:         u.first_name,
    lastName:          u.last_name,
    email:             u.email,
    userType:          u.user_type,
    profilePicture:    u.profile_picture,
    deptId:            u.dept_id,
    mustChangePassword: Boolean(u.must_change_password),
  };
}

// ── Search users for RecipientPicker ─────────────────────────────────────────
// Super-admin accounts (user_type = 'admin') are excluded — they manage
// all communication via the governance panel and are never valid recipients.

async function searchUsers(q, limit = 10, excludeUserId = null) {
  const pool = await getPool();
  const req  = pool.request();
  req.input('limit', sql.Int, Math.min(limit, 50));

  let excludeClause = '';
  if (excludeUserId) {
    req.input('excludeUserId', sql.UniqueIdentifier, excludeUserId);
    excludeClause = 'AND user_id <> @excludeUserId';
  }

  if (!q || !q.trim()) {
    const result = await req.query(`
      SELECT TOP (@limit)
        user_id    AS userId,
        first_name AS firstName,
        last_name  AS lastName,
        email,
        username,
        user_type  AS userType
      FROM auth_users
      WHERE is_active = 1
        AND user_type <> 'admin'
        ${excludeClause}
      ORDER BY first_name, last_name
    `);
    return result.recordset;
  }

  req.input('search', sql.NVarChar, `%${q.trim()}%`);
  const result = await req.query(`
    SELECT TOP (@limit)
      user_id    AS userId,
      first_name AS firstName,
      last_name  AS lastName,
      email,
      username,
      user_type  AS userType
    FROM auth_users
    WHERE is_active = 1
      AND user_type <> 'admin'
      ${excludeClause}
      AND (
        first_name                     LIKE @search
        OR last_name                   LIKE @search
        OR username                    LIKE @search
        OR email                       LIKE @search
        OR CONCAT(first_name, ' ', last_name) LIKE @search
      )
    ORDER BY first_name, last_name
  `);
  return result.recordset;
}

// ── Change password ───────────────────────────────────────────────────────────

async function changePassword(userId, currentPassword, newPassword) {
  const pool = await getPool();

  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT password_hash FROM auth_users WHERE user_id = @userId`);

  if (!result.recordset.length) {
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }

  const valid = await bcrypt.compare(currentPassword, result.recordset[0].password_hash);
  if (!valid) {
    const err = new Error('Current password is incorrect'); err.statusCode = 400; throw err;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.request()
    .input('newHash', sql.NVarChar, newHash)
    .input('userId',  sql.UniqueIdentifier, userId)
    .query(`
      UPDATE auth_users
      SET password_hash = @newHash, must_change_password = 0
      WHERE user_id = @userId
    `);

  return true;
}

// ── Set initial password (forced first-login flow) ────────────────────────────
// Used only when must_change_password = 1. The JWT already proves the user
// authenticated with their current (temp) password seconds earlier at login,
// so we don't ask for it again here. We re-verify must_change_password on the
// server (not just trust the client) so this lenient path can't be reused
// later — once the flag is cleared, callers must go through changePassword()
// and supply their current password like normal.
async function setInitialPassword(userId, newPassword) {
  const pool = await getPool();

  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT must_change_password FROM auth_users WHERE user_id = @userId`);

  if (!result.recordset.length) {
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }
  if (!result.recordset[0].must_change_password) {
    const err = new Error('Password change is not required for this account');
    err.statusCode = 403; throw err;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.request()
    .input('newHash', sql.NVarChar, newHash)
    .input('userId',  sql.UniqueIdentifier, userId)
    .query(`
      UPDATE auth_users
      SET password_hash = @newHash, must_change_password = 0
      WHERE user_id = @userId
    `);

  return true;
}

module.exports = { login, getMe, searchUsers, changePassword, setInitialPassword };