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

const { getEffectiveActivityRole, getEffectivePhaseRole, rank } = require('../services/roleService');

function requireEntityRole(level, minRole) {
  const required = rank(minRole);
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;

      // Admins get the same oversight bypass as project-level Managers
      // (mirrors the messaging module's super-admin pattern) — see
      // projectRole.js requireRole for the equivalent at the project level.
      if (req.user.userType === 'admin') {
        req.effectiveRole = 'Manager';
        req.effectiveLevel = 'admin';
        req.isSuperAdmin = true;
        return next();
      }

      // NOTE: there used to be a shortcut here that granted Manager access
      // whenever the user was a project-level Manager, checked BEFORE
      // looking at any entity-level row. It was meant to cover the
      // bootstrap case — a project Manager acting on a Phase/Activity with
      // no explicit row of their own yet — but getEffectiveActivityRole/
      // getEffectivePhaseRole below already LEFT JOINs pm_members as a
      // fallback and returns {role: projectRole, level:'project'} in
      // exactly that case, so the shortcut was redundant for it. The only
      // case where it actually changed behavior was the opposite one: a
      // project Manager who has an EXPLICIT, LOWER role on this specific
      // Phase/Activity (e.g. downgraded to Viewer to scope them out of
      // sensitive work) — the shortcut silently overrode that downgrade for
      // every write endpoint, even though the read side (this same
      // roleService) and the UI (MemberManager's downgrade warning) both
      // treat an explicit entity-level row as REPLACING the project role,
      // not topping it up. Removed so both sides agree: most-specific-row-
      // wins, consistently, for both reads and writes.
      let effective;
      if (level === 'activity') {
        // Prefer an explicitly-resolved activityId (set by a resolve*Project
        // middleware, e.g. taskRoutes.js resolveTaskProject) over req.params.id
        // — on task routes :id is the TASK's own id, not the activity's, so
        // falling back to it first would silently check the wrong entity.
        const activityId = req.params.activityId || req.params.id;
        effective = await getEffectiveActivityRole(userId, activityId);
      } else if (level === 'phase') {
        const phaseId = req.params.phaseId || req.params.id;
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