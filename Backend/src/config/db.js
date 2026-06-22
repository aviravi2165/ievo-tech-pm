<<<<<<< HEAD
const sql = require('mssql');

const config = {
  server:   process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_DATABASE || 'ievo_erp',
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:              process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    enableArithAbort:     true,
  },
  pool: {
    max:              10,
    min:              0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 5000,
  },
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    pool.on('error', (err) => {
      console.error('MSSQL pool error:', err);
      pool = null;
    });
  }
=======
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

function getPool() {
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
  return pool;
}

async function closePool() {
<<<<<<< HEAD
  if (pool) {
    await pool.close();
    pool = null;
  }
}

module.exports = { getPool, closePool, sql };
=======
  await pool.end();
}

module.exports = { getPool, closePool };
>>>>>>> 2a58f874468df0c80c7e06e35da0681865f70648
