'use strict';

/**
 * Shared dependency resolution — identical logic at phase/activity/task levels.
 * Each function accepts `reqFactory`: a () => sql.Request producer, either
 * `() => pool.request()` (no transaction) or the `req` factory handed to the
 * callback of withTransaction (so all queries share one transaction).
 * Returns array of newly unblocked entity IDs for socket broadcast.
 */
const { sql } = require('../../../config/db');

const CFG = {
  phase:    { depTable: 'pm_phase_deps',    entityTable: 'pm_phases',     idCol: 'phase_id',    depCol: 'depends_on_phase_id',    done: 'Completed' },
  activity: { depTable: 'pm_activity_deps', entityTable: 'pm_activities', idCol: 'activity_id', depCol: 'depends_on_activity_id', done: 'Completed' },
  task:     { depTable: 'pm_task_deps',     entityTable: 'pm_tasks',      idCol: 'task_id',     depCol: 'depends_on_task_id',     done: 'Done'      },
};

async function resolveUnblocked(reqFactory, entityType, completedId) {
  const c = CFG[entityType]; if (!c) return [];

  const depResult = await reqFactory()
    .input('completedId', sql.Int, completedId)
    .query(`SELECT ${c.idCol} AS id FROM ${c.depTable} WHERE ${c.depCol} = @completedId`);

  const unblocked = [];
  for (const { id } of depResult.recordset) {
    const unresolved = await reqFactory()
      .input('id',   sql.Int,          id)
      .input('done', sql.NVarChar(30), c.done)
      .query(`
        SELECT 1 AS x
        FROM ${c.depTable} d
        INNER JOIN ${c.entityTable} e ON e.${c.idCol} = d.${c.depCol}
        WHERE d.${c.idCol} = @id AND e.status <> @done AND e.is_deleted = 0
      `);
    if (!unresolved.recordset.length) {
      await reqFactory()
        .input('id', sql.Int, id)
        .query(`UPDATE ${c.entityTable} SET status = 'To Do' WHERE ${c.idCol} = @id AND status = 'Blocked'`);
      unblocked.push(id);
    }
  }
  return unblocked;
}

/**
 * blockIfNeeded — when the dependency's blocker is not yet done, set the
 * dependent entity to Blocked. `reqFactory` is a () => sql.Request producer.
 */
async function blockIfNeeded(reqFactory, entityType, entityId, dependsOnId) {
  const c = CFG[entityType]; if (!c) return;
  const result = await reqFactory()
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`SELECT status FROM ${c.entityTable} WHERE ${c.idCol} = @dependsOnId`);
  if (result.recordset[0]?.status !== c.done) {
    await reqFactory()
      .input('entityId', sql.Int, entityId)
      .query(`UPDATE ${c.entityTable} SET status = 'Blocked' WHERE ${c.idCol} = @entityId AND status = 'To Do'`);
  }
}

module.exports = { resolveUnblocked, blockIfNeeded };
