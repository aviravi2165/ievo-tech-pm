'use strict';

const bcrypt = require('bcrypt');
const { getPool, sql } = require('../../../config/db');
const { generateTempPassword } = require('../../../Shared/passwordGenerator');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translates MSSQL constraint-violation errors into readable messages.
 * Numbers: 2627 = UNIQUE KEY violation, 2601 = unique index violation,
 *          547  = FK violation.
 */
function translateSqlError(err) {
  if (err.number === 2627 || err.number === 2601) {
    const msg = err.message || '';
    if (msg.includes('UQ__auth_use__F3DBC572')) return 'Username is already taken.';
    if (msg.includes('UQ__auth_use__AB6E6164')) return 'Email address is already in use.';
    if (msg.includes('employee_code'))           return 'Employee code is already assigned to another user.';
    return 'A duplicate value was found — please check username, email or employee code.';
  }
  if (err.number === 547) return 'Invalid department or manager reference.';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// getDepartments
// ─────────────────────────────────────────────────────────────────────────────

async function getDepartments() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT dept_id AS deptId, dept_name AS deptName, dept_code AS deptCode
    FROM   dept_master
    WHERE  is_active = 1
    ORDER  BY dept_name
  `);
  return result.recordset;
}

// ─────────────────────────────────────────────────────────────────────────────
// getUsers
// ─────────────────────────────────────────────────────────────────────────────

async function getUsers({ search = '', page = 1, limit = 50 } = {}) {
  const pool   = await getPool();
  const req    = pool.request();
  const offset = (Math.max(page, 1) - 1) * Math.min(limit, 100);
  req.input('limit',  sql.Int, Math.min(limit, 100));
  req.input('offset', sql.Int, offset);

  let where = '1 = 1';
  if (search.trim()) {
    req.input('search', sql.NVarChar, `%${search.trim()}%`);
    where = `(u.username LIKE @search
      OR u.first_name  LIKE @search
      OR u.last_name   LIKE @search
      OR u.email       LIKE @search
      OR u.employee_code LIKE @search
      OR CONCAT(u.first_name, ' ', u.last_name) LIKE @search)`;
  }

  const result = await req.query(`
    SELECT
      u.user_id        AS userId,
      u.username,
      u.first_name     AS firstName,
      u.last_name      AS lastName,
      u.email,
      u.phone_number   AS phoneNumber,
      u.dept_id        AS deptId,
      d.dept_name      AS deptName,
      u.[level],
      u.mgr_user_id    AS mgrUserId,
      COALESCE(NULLIF(TRIM(CONCAT(m.first_name,' ',m.last_name)),''), m.email) AS mgrName,
      u.user_type      AS userType,
      u.employee_code  AS employeeCode,
      u.is_active      AS isActive,
      u.must_change_password AS mustChangePassword,
      u.created_at     AS createdAt
    FROM   auth_users u
    LEFT JOIN dept_master d ON d.dept_id  = u.dept_id
    LEFT JOIN auth_users  m ON m.user_id  = u.mgr_user_id
    WHERE  ${where}
    ORDER  BY u.created_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);
  return result.recordset;
}

// ─────────────────────────────────────────────────────────────────────────────
// registerUser
// ─────────────────────────────────────────────────────────────────────────────

async function registerUser(data) {
  const {
    username,
    firstName    = null,
    lastName     = null,
    email        = null,
    phoneNumber  = null,
    deptId       = null,
    level        = null,
    mgrUserId    = null,
    userType     = 'employee',
    employeeCode = null,
    isActive     = true,
  } = data;

  if (!username || !username.trim()) {
    const err = new Error('Username is required'); err.statusCode = 400; throw err;
  }

  if (!email || !email.trim()) {
    const err = new Error('Email is required — it is used to send login credentials to the new user.');
    err.statusCode = 400; throw err;
  }

  const VALID_TYPES = ['employee', 'manager', 'admin'];
  if (!VALID_TYPES.includes(userType)) {
    const err = new Error(`user_type must be one of: ${VALID_TYPES.join(', ')}`);
    err.statusCode = 400; throw err;
  }

  // Initial password is randomly generated; user is forced to change it on
  // first login (must_change_password = 1). The plaintext value is returned
  // ONCE in this function's result, purely so the admin can manually share
  // it with the new user for now — nothing persists it anywhere, and it's
  // never retrievable again after this response. Once nodemailer is wired
  // up, this is where the "send welcome email" call will go instead, and
  // the plaintext can stop being returned to the frontend at all.
  const temporaryPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const pool = await getPool();
  try {
    const result = await pool.request()
      .input('username',      sql.NVarChar,        username.trim().toLowerCase())
      .input('passwordHash',  sql.NVarChar,        passwordHash)
      .input('firstName',     sql.NVarChar,        firstName    || null)
      .input('lastName',      sql.NVarChar,        lastName     || null)
      .input('email',         sql.NVarChar,        email        || null)
      .input('phoneNumber',   sql.NVarChar,        phoneNumber  || null)
      .input('deptId',        sql.Int,             deptId       || null)
      .input('level',         sql.Int,             level        || null)
      .input('mgrUserId',     sql.UniqueIdentifier, mgrUserId   || null)
      .input('userType',      sql.NVarChar,        userType)
      .input('employeeCode',  sql.NVarChar,        employeeCode || null)
      .input('isActive',      sql.Bit,             isActive  ? 1 : 0)
      .query(`
        INSERT INTO auth_users (
          username, password_hash,
          first_name, last_name, email, phone_number,
          dept_id, [level], mgr_user_id,
          user_type, employee_code,
          is_active,
          must_change_password
        )
        OUTPUT
          INSERTED.user_id        AS userId,
          INSERTED.username,
          INSERTED.first_name     AS firstName,
          INSERTED.last_name      AS lastName,
          INSERTED.email,
          INSERTED.user_type      AS userType,
          INSERTED.employee_code  AS employeeCode,
          INSERTED.is_active      AS isActive,
          INSERTED.must_change_password AS mustChangePassword,
          INSERTED.created_at     AS createdAt
        VALUES (
          @username, @passwordHash,
          @firstName, @lastName, @email, @phoneNumber,
          @deptId, @level, @mgrUserId,
          @userType, @employeeCode,
          @isActive,
          1   -- must_change_password always 1 on creation
        )
      `);
    return { ...result.recordset[0], temporaryPassword };
  } catch (err) {
    const friendly = translateSqlError(err);
    if (friendly) {
      const e = new Error(friendly); e.statusCode = 409; throw e;
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateUser
// ─────────────────────────────────────────────────────────────────────────────

async function updateUser(userId, data) {
  const pool = await getPool();

  // Verify user exists
  const check = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT user_id FROM auth_users WHERE user_id = @userId`);
  if (!check.recordset[0]) {
    const err = new Error('User not found'); err.statusCode = 404; throw err;
  }

  // Build SET clause dynamically — only update fields that were supplied
  const allowed = [
    ['username',             sql.NVarChar,         v => v?.trim().toLowerCase()],
    ['firstName',            sql.NVarChar,         null, 'first_name'],
    ['lastName',             sql.NVarChar,         null, 'last_name'],
    ['email',                sql.NVarChar,         null],
    ['phoneNumber',          sql.NVarChar,         null, 'phone_number'],
    ['deptId',               sql.Int,              null, 'dept_id'],
    ['level',                sql.Int,              null],
    ['mgrUserId',            sql.UniqueIdentifier, null, 'mgr_user_id'],
    ['userType',             sql.NVarChar,         null, 'user_type'],
    ['employeeCode',         sql.NVarChar,         null, 'employee_code'],
    ['isActive',             sql.Bit,              v => v ? 1 : 0, 'is_active'],
    ['mustChangePassword',   sql.Bit,              v => v ? 1 : 0, 'must_change_password'],
  ];

  const req = pool.request();
  req.input('userId', sql.UniqueIdentifier, userId);

  const setClauses = [];
  for (const [field, type, transform, dbCol] of allowed) {
    if (!(field in data)) continue;
    const colName = dbCol || field.replace(/([A-Z])/g, '_$1').toLowerCase();
    const value   = transform ? transform(data[field]) : (data[field] ?? null);
    req.input(field, type, value);
    setClauses.push(`${colName} = @${field}`);
  }

  if (!setClauses.length) {
    const err = new Error('No fields to update'); err.statusCode = 400; throw err;
  }
  setClauses.push(`modified_at = SYSDATETIMEOFFSET()`);

  try {
    await req.query(`
      UPDATE auth_users
      SET    ${setClauses.join(', ')}
      WHERE  user_id = @userId
    `);
  } catch (err) {
    const friendly = translateSqlError(err);
    if (friendly) {
      const e = new Error(friendly); e.statusCode = 409; throw e;
    }
    throw err;
  }

  // Return the refreshed row
  const updated = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        u.user_id       AS userId, u.username,
        u.first_name    AS firstName, u.last_name AS lastName,
        u.email, u.phone_number AS phoneNumber,
        u.dept_id       AS deptId, d.dept_name AS deptName,
        u.[level], u.mgr_user_id AS mgrUserId,
        COALESCE(NULLIF(TRIM(CONCAT(m.first_name,' ',m.last_name)),''), m.email) AS mgrName,
        u.user_type     AS userType, u.employee_code AS employeeCode,
        u.is_active     AS isActive,
        u.must_change_password AS mustChangePassword
      FROM   auth_users u
      LEFT JOIN dept_master d ON d.dept_id = u.dept_id
      LEFT JOIN auth_users  m ON m.user_id = u.mgr_user_id
      WHERE  u.user_id = @userId
    `);
  return updated.recordset[0];
}

module.exports = { getDepartments, getUsers, registerUser, updateUser };