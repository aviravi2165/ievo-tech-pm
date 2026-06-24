require('dotenv').config();

const http = require('http');
const { createApp } = require('./src/app');
const { initAllRealtime } = require('./src/modules');
const { closePool } = require('./src/config/db');

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = createApp();
const server = http.createServer(app);
const { closeSocket } = initAllRealtime(server);

server.listen(PORT ,() => {
  console.log(`I.EVO ERP API listening on port ${PORT}`);
  console.log('Modules: dashboard, project-management, scheduling, messages');
});

let shuttingDown = false;

async function shutdown(signal) {
  // FIX: previously every SIGINT re-ran this whole function, including a
  // second one fired while the first was still (hanging) in progress —
  // that's why the message printed multiple times and server.close()
  // listeners piled up. Now a repeated signal while already shutting down
  // is a no-op.
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down...`);

  // FIX: hard fallback. If something still doesn't close cleanly within
  // a few seconds (e.g. a stuck DB connection), force-exit anyway so the
  // terminal always gets control back instead of hanging indefinitely.
  const forceExitTimer = setTimeout(() => {
    console.error('Shutdown taking too long — forcing exit.');
    process.exit(1);
  }, 8000);

  try {
    await closePool();
  } catch (err) {
    console.error('Error closing DB pool:', err);
  }

  // FIX: closeSocket() now correctly closes the underlying httpServer too
  // (see src/modules/index.js / socketHandler.js) — calling server.close()
  // separately afterward was racing/duplicating that close and was the
  // actual reason shutdown never completed when a client was still connected.
  closeSocket(() => {
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };