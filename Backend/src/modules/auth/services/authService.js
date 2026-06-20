const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { getPool } = require('../../../config/db');

// ── Login ─────────────────────────────────────────────────────────────────────

async function login({ username, password }) {
  if (!username || !password) {
    const err = new Error('Username and password are required');
    err.statusCode = 400; throw err;
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


// UUID-based checks (send, reply, read receipts) for every user.

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
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }
  const u = rows[0];
  // Return camelCase so AuthContext.user shape is identical whether
  // the user just logged in OR reloaded the page.
  return {
    userId:         u.user_id,
    username:       u.username,
    firstName:      u.first_name,
    lastName:       u.last_name,
    email:          u.email,
    userType:       u.user_type,
    profilePicture: u.profile_picture,
    deptId:         u.dept_id,
  };
}

// ── Search users for RecipientPicker ─────────────────────────────────────────

async function searchUsers(q, limit = 10, excludeUserId = null) {
  const pool = getPool();
  if (!q) {
    const { rows } = await pool.query(
      `SELECT user_id AS "userId", first_name AS "firstName", last_name AS "lastName",
              email, username, user_type AS "userType"
       FROM auth_users
       WHERE is_active = TRUE
         AND user_type <> 'admin'
         AND ($1::uuid IS NULL OR user_id != $1::uuid)
       ORDER BY first_name, last_name
       LIMIT $2`,
      [excludeUserId || null, limit]
    );
    return rows;
  }
  const search = `%${q.toLowerCase()}%`;
  const { rows } = await pool.query(
    `SELECT user_id AS "userId", first_name AS "firstName", last_name AS "lastName",
            email, username, user_type AS "userType"
     FROM auth_users
     WHERE is_active = TRUE
       AND user_type <> 'admin'
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
async function changePassword(
  userId,
  currentPassword,
  newPassword
) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    SELECT password_hash
    FROM auth_users
    WHERE user_id = $1
    `,
    [userId]
  );

  if (!rows.length) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const user = rows[0];

  const valid = await bcrypt.compare(
    currentPassword,
    user.password_hash
  );

  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 400;
    throw err;
  }

  const newHash = await bcrypt.hash(
    newPassword,
    10
  );

  await pool.query(
    `
    UPDATE auth_users
    SET password_hash = $1
    WHERE user_id = $2
    `,
    [newHash, userId]
  );

  return true;
}
module.exports = { login, getMe, searchUsers,changePassword, };