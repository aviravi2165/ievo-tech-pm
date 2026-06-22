const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { getPool } = require('./config/db');
const { registerAllModules } = require('./modules');

/** Builds the Express application and registers all ERP module routes. */
function createApp() {
  const app = express();

  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const corsOptions = {
    origin: process.env.CORS_ORIGIN.split(','),
    methods: 'GET,POST,PUT,PATCH,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'], 
    credentials: true,
  };

  app.use(limiter);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health-check — uses mssql pool directly (getPool is now async)
  app.get('/health', async (req, res) => {
    try {
      const pool = await getPool();
      await pool.request().query('SELECT 1 AS ok');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'disconnected' });
    }
  });

  registerAllModules(app);

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
      error: err.message || 'Internal server error',
      message: err.message || 'Internal server error',
    });
  });

  return app;
}

module.exports = { createApp };