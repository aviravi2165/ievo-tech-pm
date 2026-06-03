const express = require('express');
const { authenticate } = require('../../middleware/auth');

function registerSchedulingModule(app) {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', (req, res) => {
    res.json({ module: 'scheduling', status: 'coming-soon' });
  });
  app.use('/api/scheduling', router);
  return { name: 'scheduling' };
}

module.exports = { registerSchedulingModule };
