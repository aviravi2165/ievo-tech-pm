const jwt = require('jsonwebtoken');
const { isUserActive } = require('../modules/auth/services/authService');

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
    // FIX: was missing — needed so backend routes can recognise the
    // messaging super-admin (auth_users.user_type === 'admin') without
    // an extra DB round trip on every request.
    userType: decoded.userType,
  };
}

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

async function authenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'InvalidTokenPayload') {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  // FIX: login() blocking is_active=0 only stops a NEW session from
  // starting. A user already holding a valid JWT (issued before they were
  // deactivated) would keep working for up to JWT_EXPIRES_IN (default 8h)
  // with zero further checks, since the token's signature alone was never
  // re-validated against current account state. This closes that gap.
  try {
    const active = await isUserActive(req.user.userId);
    if (!active) {
      return res.status(401).json({ error: 'Account has been deactivated' });
    }
  } catch (err) {
    return next(err);
  }

  return next();
}

module.exports = {
  authenticate,
  verifyToken,
  // FIX: 'admin' user_type is repurposed as the messaging super admin —
  // full group control (add/remove participants, disable, delete) across
  // every group in the system, without read access to message content.
  isSuperAdmin: (user) => user?.userType === 'admin',

  // Guards a route so only admin accounts can call it.
  // Always use AFTER authenticate so req.user is already set.
  requireAdmin(req, res, next) {
    if (req.user?.userType !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return next();
  },
};