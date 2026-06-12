/**
 * Shared dependency resolution â€” identical logic at phase/activity/task levels.
 * Called inside the caller's DB transaction client.
 * Returns array of newly unblocked entity IDs for socket broadcast.
 */
const CFG = {
  phase:    { depTable: 'pm_phase_deps',    entityTable: 'pm_phases',     idCol: 'phase_id',    depCol: 'depends_on_phase_id',    done: 'Completed' },
  activity: { depTable: 'pm_activity_deps', entityTable: 'pm_activities', idCol: 'activity_id', depCol: 'depends_on_activity_id', done: 'Completed' },
  task:     { depTable: 'pm_task_deps',     entityTable: 'pm_tasks',      idCol: 'task_id',     depCol: 'depends_on_task_id',     done: 'Done'      },
};

async function resolveUnblocked(client, entityType, completedId) {
  const c = CFG[entityType]; if (!c) return [];
  const { rows: dependents } = await client.query(
    `SELECT ${c.idCol} AS id FROM ${c.depTable} WHERE ${c.depCol} = $1`, [completedId]
  );
  const unblocked = [];
  for (const { id } of dependents) {
    const { rows: unresolved } = await client.query(
      `SELECT 1 FROM ${c.depTable} d
       JOIN ${c.entityTable} e ON e.${c.idCol} = d.${c.depCol}
       WHERE d.${c.idCol} = $1 AND e.status <> $2 AND NOT e.is_deleted`,
      [id, c.done]
    );
    if (!unresolved.length) {
      await client.query(
        `UPDATE ${c.entityTable} SET status = 'To Do' WHERE ${c.idCol} = $1 AND status = 'Blocked'`,
        [id]
      );
      unblocked.push(id);
    }
  }
  return unblocked;
}

/**
 * blockIfNeeded — accepts a pool or a transaction client.
 * When the dependency's blocker is not yet done, set the dependent entity to Blocked.
 */
async function blockIfNeeded(poolOrClient, entityType, entityId, dependsOnId) {
  const c = CFG[entityType]; if (!c) return;
  const { rows } = await poolOrClient.query(
    `SELECT status FROM ${c.entityTable} WHERE ${c.idCol} = $1`, [dependsOnId]
  );
  if (rows[0]?.status !== c.done) {
    await poolOrClient.query(
      `UPDATE ${c.entityTable} SET status = 'Blocked' WHERE ${c.idCol} = $1 AND status = 'To Do'`,
      [entityId]
    );
  }
}

module.exports = { resolveUnblocked, blockIfNeeded };