'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { getPool, sql }            = require('../../../config/db');
const { generateTempPassword }    = require('../../../Shared/passwordGenerator');
const { sendMail }                = require('../../../Shared/mailer');
const { resetPasswordEmail }      = require('../../../Shared/emailTemplates');

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
                   email, user_type, is_active, profile_picture,
                   dept_id, must_change_password
      FROM auth_users
      WHERE username = @username
    `);

  const user = result.recordset[0];
  if (!user || !user.is_active) {
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
      userId:             user.user_id,
      username:           user.username,
      firstName:          user.first_name,
      lastName:           user.last_name,
      email:              user.email,
      userType:           user.user_type,
      profilePicture:     user.profile_picture,
      deptId:             user.dept_id,
      mustChangePassword: Boolean(user.must_change_password),
    },
  };
}

// ── Live active-status check ───────────────────────────────────────────────────
async function isUserActive(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT is_active FROM auth_users WHERE user_id = @userId`);
  const row = result.recordset[0];
  return Boolean(row && row.is_active);
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
    userId:             u.user_id,
    username:           u.username,
    firstName:          u.first_name,
    lastName:           u.last_name,
    email:              u.email,
    userType:           u.user_type,
    profilePicture:     u.profile_picture,
    deptId:             u.dept_id,
    mustChangePassword: Boolean(u.must_change_password),
  };
}

// ── Search users for RecipientPicker ─────────────────────────────────────────

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

// ── Forgot password ───────────────────────────────────────────────────────────
//
// Generates a new temporary password, overwrites the stored hash, and sets
// must_change_password = 1 so the user is forced to set a new password the
// moment they sign in with the temporary one.
//
// Security: we always return the same response whether or not the email
// address exists in the DB — this prevents account enumeration by external
// parties. The email is looked up case-insensitively.
//
// If SMTP is not configured, sendMail() will throw and the error will
// propagate to the controller, which logs it and returns a 500. The password
// hash in the DB will have already been updated at that point — this is
// acceptable for an internal ERP (the admin can share the temp password
// manually as a fallback, or check server logs).

async function forgotPassword(email) {
  if (!email || !email.trim()) return; // no-op, controller always returns 200

  const pool = await getPool();

  const result = await pool.request()
    .input('email', sql.NVarChar, email.trim().toLowerCase())
    .query(`
      SELECT TOP 1 user_id, username, first_name, email, is_active
      FROM   auth_users
      WHERE  email = @email
    `);

  const user = result.recordset[0];

  // Return silently if account not found or inactive — don't reveal account existence
  if (!user || !user.is_active) return;

  // Generate new temporary password and update the stored hash
  const temporaryPassword = generateTempPassword();
  const passwordHash      = await bcrypt.hash(temporaryPassword, 10);

  await pool.request()
    .input('passwordHash', sql.NVarChar,        passwordHash)
    .input('userId',       sql.UniqueIdentifier, user.user_id)
    .query(`
      UPDATE auth_users
      SET    password_hash       = @passwordHash,
             must_change_password = 1
      WHERE  user_id = @userId
    `);

  // Send the reset email with the plaintext temporary password
  const template = resetPasswordEmail({
    firstName:         user.first_name,
    username:          user.username,
    temporaryPassword,
  });

  await sendMail({ to: user.email, ...template });
}

module.exports = {
  login,
  getMe,
  searchUsers,
  changePassword,
  setInitialPassword,
  forgotPassword,
  isUserActive,
};