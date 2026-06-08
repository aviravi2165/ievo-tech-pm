/**
 * projectRole middleware — enforces Manager / Member / Viewer before every write.
 * Reads project_id from req.params.projectId or req.pmProjectId (set by sub-routes).
 * (PRD FR-05–08, NFR role enforcement)
 */
const { getPool } = require('../../../config/db');

const RANK = { Viewer: 1, Member: 2, Manager: 3 };

function requireRole(minRole) {
  const required = RANK[minRole] ?? 1;
  return async (req, res, next) => {
    try {
      const projectId = req.params.projectId || req.pmProjectId;
      if (!projectId) return res.status(400).json({ error: 'projectId not resolved for role check' });

      const { rows } = await getPool().query(
        `SELECT role FROM pm_members WHERE project_id = $1 AND user_id = $2`,
        [projectId, req.user.userId]
      );
      if (!rows[0]) return res.status(403).json({ error: 'You are not a member of this project' });

      const userRank = RANK[rows[0].role] ?? 0;
      if (userRank < required) {
        return res.status(403).json({ error: `Requires ${minRole} role or above` });
      }
      req.projectRole = rows[0].role;
      return next();
    } catch (err) { return next(err); }
  };
}

module.exports = { requireRole };