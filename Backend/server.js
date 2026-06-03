require('dotenv').config();

const http = require('http');
const { createApp } = require('./src/app');
const { initAllRealtime } = require('./src/modules');
const { closePool } = require('./src/config/db');

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = createApp();
const server = http.createServer(app);
const { closeSocket } = initAllRealtime(server);

server.listen(PORT, () => {
  console.log(`I.EVO ERP API listening on port ${PORT}`);
  console.log('Modules: dashboard, project-management, scheduling, messages');
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  closeSocket();
  await closePool();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server };
