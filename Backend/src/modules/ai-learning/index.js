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
const aiStoryPublicRoutes = require('./routes/aiStoryPublicRoutes');

// Public "Share your AI story" form — no login (see aiStoryPublicRoutes).
// Registered via registerPublic so it runs before other modules' auth-guarded
// '/api' routers.
function registerPublic(app) {
  app.use('/api/public/ai-stories', aiStoryPublicRoutes);
}

function register(app) {
  app.use('/api/ai-learning', aiLearningRoutes);
}

module.exports = { register, registerPublic };
