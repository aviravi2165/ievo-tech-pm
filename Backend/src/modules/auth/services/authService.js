const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getPool } = require('../../../config/db');

/**
 * Validates credentials against auth_users.
 * Returns a signed JWT and user info on success.
 */
async function login({ username, password }) {
  if (!username || !password) {
    const err = new Error('Username and password are required');
    err.statusCode = 400;
    throw err;
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT user_id, username, password_hash, first_name, last_name,
            email, user_type, is_active, allow_login, profile_picture, dept_id
     FROM auth_users
     WHERE username = $1
     LIMIT 1`,
    [username.trim().toLowerCase()]
  );
  const user = rows[0];
  if (!user || !user.is_active || !user.allow_login) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
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
      userId:         user.user_id,
      username:       user.username,
      firstName:      user.first_name,
      lastName:       user.last_name,
      email:          user.email,
      userType:       user.user_type,
      profilePicture: user.profile_picture,
      deptId:         user.dept_id,
    },
  };
}

/**
 * Returns basic profile for the logged-in user.
 */
async function getMe(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT user_id, username, first_name, last_name, email,
            user_type, profile_picture, dept_id
     FROM auth_users
     WHERE user_id = $1 AND is_active = TRUE`,
    [userId]
  );
  if (!rows[0]) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

/**
 * Search users by name or username for RecipientPicker.
 * Excludes the requesting user from results.
 * Returns: [{ userId, firstName, lastName, email, username, userType }]
 */
async function searchUsers(q, limit = 10, excludeUserId = null) {
  const pool = getPool();

  // If empty query return recent/all active users up to limit
  if (!q) {
    const { rows } = await pool.query(
      `SELECT user_id AS "userId",
              first_name AS "firstName",
              last_name  AS "lastName",
              email,
              username,
              user_type  AS "userType"
       FROM auth_users
       WHERE is_active = TRUE
         AND ($1::uuid IS NULL OR user_id != $1::uuid)
       ORDER BY first_name, last_name
       LIMIT $2`,
      [excludeUserId || null, limit]
    );
    return rows;
  }

  const search = `%${q.toLowerCase()}%`;
  const { rows } = await pool.query(
    `SELECT user_id AS "userId",
            first_name AS "firstName",
            last_name  AS "lastName",
            email,
            username,
            user_type  AS "userType"
     FROM auth_users
     WHERE is_active = TRUE
       AND ($1::uuid IS NULL OR user_id != $1::uuid)
       AND (
         LOWER(first_name) LIKE $2
         OR LOWER(last_name)  LIKE $2
         OR LOWER(username)   LIKE $2
         OR LOWER(email)      LIKE $2
         OR LOWER(CONCAT(first_name, ' ', last_name)) LIKE $2
       )
     ORDER BY first_name, last_name
     LIMIT $3`,
    [excludeUserId || null, search, limit]
  );
  return rows;
}

module.exports = { login, getMe, searchUsers };