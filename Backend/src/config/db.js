const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5433', 10),
  database: process.env.DB_DATABASE || 'ievo_erp',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  max:      10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

/**
 * Returns the shared pool.
 * Usage: const { rows } = await getPool().query('SELECT ...', [params])
 */
function getPool() {
  return pool;
}

async function closePool() {
  await pool.end();
}

module.exports = { getPool, closePool };