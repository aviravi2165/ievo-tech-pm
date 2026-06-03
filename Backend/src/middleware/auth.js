const jwt = require('jsonwebtoken');

/**
 * Verifies a JWT and returns the normalized user payload.
 * @param {string} token
 * @returns {{ userId: number|string, email?: string, displayName?: string }}
 */
function verifyToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const userId = decoded.userId ?? decoded.sub ?? decoded.id;
  if (userId === undefined || userId === null) {
    const err = new Error('Invalid token payload');
    err.name = 'InvalidTokenPayload';
    throw err;
  }

  return {
    userId,
    email: decoded.email,
    displayName: decoded.displayName ?? decoded.name,
  };
}

/**
 * Express middleware — requires `Authorization: Bearer <token>`.
 * Attaches `req.user` on success.
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return null;
}

function authenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'InvalidTokenPayload') {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = {
  authenticate,
  verifyToken,
};
