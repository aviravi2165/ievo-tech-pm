const sql = require('mssql');

const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

/**
 * Returns a connected MSSQL connection pool (singleton).
 * @returns {Promise<import('mssql').ConnectionPool>}
 */
async function getPool() {
  if (pool && pool.connected) {
    return pool;
  }

  pool = await sql.connect(dbConfig);
  return pool;
}

/**
 * Gracefully closes the connection pool.
 */
async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

module.exports = {
  sql,
  getPool,
  closePool,
};
