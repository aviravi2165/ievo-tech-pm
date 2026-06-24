const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { getPool } = require('./config/db');
const { registerAllModules } = require('./modules');

/** Builds the Express application and registers all ERP module routes. */
function createApp() {
  const app = express();

  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);

  // Generous limiter for read-only polling endpoints that fire frequently
  // (unread count, thread load, inbox). These are safe to call often and
  // should never hit a tight limit during normal use.
  const readLimiter = rateLimit({
    windowMs,
    max:            parseInt(process.env.RATE_LIMIT_READ_MAX  || '1000', 10),
    standardHeaders: true,
    legacyHeaders:  false,
    message: { error: 'Too many requests, please try again later.' },
  });

  // Stricter limiter for write operations (send, reply, mark-read, uploads)
  const writeLimiter = rateLimit({
    windowMs,
    max:            parseInt(process.env.RATE_LIMIT_WRITE_MAX || '300', 10),
    standardHeaders: true,
    legacyHeaders:  false,
    message: { error: 'Too many requests, please try again later.' },
  });

  // Default limiter for everything else (auth, group mgmt, etc.)
  const limiter = rateLimit({
    windowMs,
    max:            parseInt(process.env.RATE_LIMIT_MAX || '500', 10),
    standardHeaders: true,
    legacyHeaders:  false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const corsOptions = {
    origin: (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
    methods: 'GET,POST,PUT,PATCH,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'], 
    credentials: true,
  };

  app.use(cors(corsOptions));

  // Apply targeted limiters to high-frequency read endpoints BEFORE the global limiter
  app.use('/api/messages/unread-count',            readLimiter);
  app.use('/api/messages/unread-conversation-ids', readLimiter);
  app.use((req, res, next) => {
    // Thread GETs and inbox GETs use readLimiter; everything else uses default
    if (req.method === 'GET' && (
      req.path.match(/^\/api\/messages\/\d+\/thread$/) ||
      req.path === '/api/messages/inbox' ||
      req.path === '/api/messages/sent'
    )) {
      return readLimiter(req, res, next);
    }
    // Mark-read and file uploads use writeLimiter
    if (req.method === 'PATCH' || req.method === 'POST') {
      return writeLimiter(req, res, next);
    }
    return limiter(req, res, next);
  });
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