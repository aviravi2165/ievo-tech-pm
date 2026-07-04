'use strict';

/**
 * entityRole — enforces a minimum EFFECTIVE role at the Phase or Activity
 * level (see roleService for the inheritance rule), with one extra allowance
 * on top: a project-level Manager can always administer any Phase or
 * Activity underneath their project, even with no explicit row at that
 * level. This matches the CSV: Phase Manager has "Full Management" and
 * that authority has to originate somewhere before any Phase/Activity
 * Managers have been explicitly assigned.
 *
 * Usage (route level, AFTER a resolve*Project middleware has set
 * req.pmProjectId, and req.params.id / req.params.phaseId / req.params.activityId
 * identifies the entity):
 *
 *   router.post('/:id/members', resolveActivityProject,
 *     requireEntityRole('activity', 'Manager'), ctrl.addMember);
 */

const { getPool, sql } = require('../../../config/db');
const { getEffectiveActivityRole, getEffectivePhaseRole, rank } = require('../services/roleService');

function requireEntityRole(level, minRole) {
  const required = rank(minRole);
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;

      // A project-level Manager can always administer Phases/Activities
      // inside their own project — check this first, it's a single cheap query.
      if (req.pmProjectId) {
        const pool = await getPool();
        const projResult = await pool.request()
          .input('projectId', sql.Int, req.pmProjectId)
          .input('userId',    sql.UniqueIdentifier, userId)
          .query(`SELECT role FROM pm_members WHERE project_id=@projectId AND user_id=@userId`);
        if (projResult.recordset[0]?.role === 'Manager') {
          req.effectiveRole = 'Manager';
          req.effectiveLevel = 'project';
          return next();
        }
      }

      let effective;
      if (level === 'activity') {
        const activityId = req.params.id || req.params.activityId;
        effective = await getEffectiveActivityRole(userId, activityId);
      } else if (level === 'phase') {
        const phaseId = req.params.id || req.params.phaseId;
        effective = await getEffectivePhaseRole(userId, phaseId);
      } else {
        return res.status(500).json({ error: `Unknown entityRole level: ${level}` });
      }

      if (!effective.role) {
        return res.status(403).json({ error: `You have no access to this ${level}` });
      }
      if (rank(effective.role) < required) {
        return res.status(403).json({ error: `Requires ${minRole} role or above on this ${level}` });
      }
      req.effectiveRole  = effective.role;
      req.effectiveLevel = effective.level;
      return next();
    } catch (err) { return next(err); }
  };
}

module.exports = { requireEntityRole };