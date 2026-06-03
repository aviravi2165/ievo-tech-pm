const dashboardService = require('../services/dashboardService');

function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    error: err.message,
    message: err.message,
  });
}

async function getSummary(req, res) {
  try {
    const data = await dashboardService.getSummary(req.user.userId);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  getSummary,
};
