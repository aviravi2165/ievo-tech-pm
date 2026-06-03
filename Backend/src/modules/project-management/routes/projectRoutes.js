const express = require('express');
const { authenticate } = require('../../../middleware/auth');

const router = express.Router();

router.use(authenticate);

/** Placeholder until project management APIs are implemented */
router.get('/', (req, res) => {
  res.json({
    module: 'project-management',
    status: 'coming-soon',
    message: 'Project APIs will be registered under /api/projects',
  });
});

module.exports = router;
