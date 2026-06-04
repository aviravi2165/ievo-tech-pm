const authRoutes = require('./routes/authRoutes');

function register(app) {
  // Auth routes: /api/auth/login, /api/auth/me
  app.use('/api/auth', authRoutes);

  // User search route: /api/users/search?q=
  // RecipientPicker calls GET /api/users/search
  app.use('/api/users', authRoutes);
}

module.exports = { register };