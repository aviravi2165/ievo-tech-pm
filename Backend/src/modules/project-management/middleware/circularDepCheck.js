/**
 * Circular dependency prevention (PRD NFR Reliability)
 * BFS from `dependsOn` node — if it can reach `entityId`, the insert would create a cycle.
 */
const { getPool } = require('../../../config/db');

const CFG = {
  phase:    { table: 'pm_phase_deps',    idCol: 'phase_id',    depCol: 'depends_on_phase_id'    },
  activity: { table: 'pm_activity_deps', idCol: 'activity_id', depCol: 'depends_on_activity_id' },
  task:     { table: 'pm_task_deps',     idCol: 'task_id',     depCol: 'depends_on_task_id'     },
};

async function wouldCreateCycle(type, fromId, toId) {
  const c = CFG[type]; if (!c) return false;
  const pool = getPool();
  const visited = new Set(); const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === toId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const { rows } = await pool.query(
      `SELECT ${c.depCol} AS dep FROM ${c.table} WHERE ${c.idCol} = $1`, [cur]
    );
    rows.forEach(r => queue.push(r.dep));
  }
  return false;
}

function checkCircular(entityType) {
  return async (req, res, next) => {
    try {
      const entityId  = parseInt(req.params.id, 10);
      const dependsOn = parseInt(req.body.dependsOnId, 10);
      if (isNaN(entityId) || isNaN(dependsOn)) return next();
      if (entityId === dependsOn) return res.status(400).json({ error: 'An entity cannot depend on itself' });
      if (await wouldCreateCycle(entityType, dependsOn, entityId)) {
        return res.status(400).json({ error: 'This dependency would create a circular chain' });
      }
      return next();
    } catch (err) { return next(err); }
  };
}

module.exports = { checkCircular };