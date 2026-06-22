'use strict';

const sql = require('mssql');

const config = {
  server:   process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_DATABASE || 'ievo_erp',
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    enableArithAbort:       true,
  },
  pool: {
    max:                  10,
    min:                  0,
    idleTimeoutMillis:    30000,
    acquireTimeoutMillis: 5000,
  },
};

let _pool = null;

/**
 * Returns the singleton mssql ConnectionPool, connecting on first call.
 * @returns {Promise<import('mssql').ConnectionPool>}
 */
async function getPool() {
  if (!_pool) {
    _pool = await sql.connect(config);
    _pool.on('error', (err) => {
      console.error('[db] Pool error:', err.message);
      _pool = null;
    });
  }
  return _pool;
}

/**
 * Closes the pool (used during graceful shutdown).
 */
async function closePool() {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

/**
 * Runs `fn(tx)` inside a committed mssql Transaction, rolling back on error.
 * fn receives a `new sql.Request(tx)` factory so callers never touch the
 * transaction directly:
 *
 *   await withTransaction(async (req) => {
 *     await req().input('id', sql.Int, id).query('UPDATE ...');
 *     await req().input('id', sql.Int, id).query('INSERT ...');
 *   });
 *
 * @param {(req: () => import('mssql').Request) => Promise<any>} fn
 */
async function withTransaction(fn) {
  const pool = await getPool();
  const tx   = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(() => new sql.Request(tx));
    await tx.commit();
    return result;
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    throw err;
  }
}

module.exports = { getPool, closePool, withTransaction, sql };