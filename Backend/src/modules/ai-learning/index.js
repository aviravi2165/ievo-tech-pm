/**
 * AI Learning Module
 *
 * Routes: /api/ai-learning/*
 *
 * One continuous journal thread per employee, built on the existing
 * messaging system (see services/aiLearningService.js) — no separate
 * socket server, no separate message CRUD; actual message send/fetch
 * reuses the messages module's generic /api/messages/:conversationId
 * endpoints untouched.
 */
const aiLearningRoutes = require('./routes/aiLearningRoutes');

function register(app) {
  app.use('/api/ai-learning', aiLearningRoutes);
}

module.exports = { register };
