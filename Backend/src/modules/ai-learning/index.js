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
const aiTechPublicRoutes = require('./routes/aiTechPublicRoutes');
const aiFeedPublicRoutes = require('./routes/aiFeedPublicRoutes');

// Public pages — no login: "Share your AI story", "Share a tech" and the AI Feed
// (see the *PublicRoutes files). Registered via registerPublic so they run before
// other modules' auth-guarded '/api' routers.
function registerPublic(app) {
  app.use('/api/public/ai-stories', aiStoryPublicRoutes);
  app.use('/api/public/ai-tech', aiTechPublicRoutes);
  app.use('/api/public/ai-feed', aiFeedPublicRoutes);
}

function register(app) {
  app.use('/api/ai-learning', aiLearningRoutes);
}

module.exports = { register, registerPublic };
