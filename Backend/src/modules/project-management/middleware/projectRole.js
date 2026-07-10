'use strict';

/**
 * projectRole middleware — enforces Manager / Member / Viewer before every write.
 * Reads project_id from req.params.projectId or req.pmProjectId (set by sub-routes).
 * (PRD FR-05–08, NFR role enforcement)
 */
const { getPool, sql } = require('../../../config/db');

const RANK = { Viewer: 1, Member: 2, Manager: 3 };

function requireRole(minRole) {
  const required = RANK[minRole] ?? 1;
  return async (req, res, next) => {
    try {
      const projectId = req.params.projectId || req.pmProjectId;
      if (!projectId) return res.status(400).json({ error: 'projectId not resolved for role check' });

      // Admins get oversight/management access to every project (mirrors
      // the messaging module's super-admin bypass) without needing a
      // pm_members row — but this only grants VIEW/MANAGE access to
      // existing entities; it does not make admins selectable as
      // assignees/members anywhere (authService.searchUsers excludes
      // user_type='admin' from that list entirely).
      if (req.user.userType === 'admin') {
        req.projectRole = 'Manager';
        req.isSuperAdmin = true;
        return next();
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('projectId', sql.Int,              projectId)
        .input('userId',    sql.UniqueIdentifier, req.user.userId)
        .query(`SELECT role FROM pm_members WHERE project_id = @projectId AND user_id = @userId`);
      const row = result.recordset[0];
      if (!row) return res.status(403).json({ error: 'You are not a member of this project' });

      const userRank = RANK[row.role] ?? 0;
      if (userRank < required) {
        return res.status(403).json({ error: `Requires ${minRole} role or above` });
      }
      req.projectRole = row.role;
      return next();
    } catch (err) { return next(err); }
  };
}

module.exports = { requireRole };
