const express  = require('express');
const cors     = require('cors');
const { getPool }             = require('./config/db');
const { registerAllModules }  = require('./modules');

/**
 * Builds the Express application and registers all ERP module routes.
 *
 * Rate limiting has been intentionally removed. Reasons:
 *
 *  1. All routes are protected by JWT auth middleware — unauthenticated
 *     requests are rejected before any business logic runs.
 *
 *  2. This is an internal ERP serving known employees. Every user is a
 *     legitimate actor; there is no public attack surface.
 *
 *  3. The office network routes all users through one NAT/router IP.
 *     express-rate-limit's default key (req.ip) therefore counted every
 *     employee's requests against a single shared bucket, causing 429
 *     errors under normal concurrent use — not abuse.
 *
 *  4. Switching to pure socket-driven state (MessagingContext) has already
 *     removed polling and auto-refresh HTTP calls, so request volume is
 *     far lower than it was when rate limiting was first added.
 *
 * If public exposure is ever needed, re-introduce rate limiting with a
 * per-user key: keyGenerator: (req) => req.user?.userId || req.ip
 */
function createApp() {
  const app = express();

  const corsOptions = {
    origin:         (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
    methods:        'GET,POST,PUT,PATCH,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials:    true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health-check
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
      error:   err.message || 'Internal server error',
      message: err.message || 'Internal server error',
    });
  });

  return app;
}

module.exports = { createApp };