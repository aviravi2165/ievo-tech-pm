'use strict';

/**
 * templateService — admin-curated reusable project skeletons
 * (Phase → Activity → Task) plus instantiateTemplate, which builds a real
 * project structure from one.
 *
 * No absolute dates exist at the template level — every phase/activity
 * stores a start OFFSET (days from its own parent's computed start) plus a
 * duration; tasks store a due-offset from their activity's start.
 * instantiateTemplate resolves these against a real project's
 * planned_start and creates every row through the SAME
 * phaseService.createPhase / activityService.createActivity /
 * taskService.createTask functions every other code path uses, so all
 * existing validation/audit/status logic runs unchanged — this file never
 * touches pm_phases/pm_activities/pm_tasks directly.
 *
 * Dependencies within a template are a plain sequential chain (each
 * phase auto-depends on the previous phase; each activity auto-depends on
 * the previous activity within the SAME phase), wired via the real
 * addPhaseDep/addActivityDep functions at instantiation time — not a full
 * dependency graph. A project created from a template is a completely
 * ordinary, fully-editable project afterward; arbitrary dependencies are
 * edited there like any project today.
 *
 * Each phase/activity has its own `dependsOnPrevious` flag — an admin can
 * turn off just ONE chain link (e.g. Phase 3 doesn't need to wait on Phase
 * 2) without disabling auto-chaining for the whole template. The first item
 * in any chain has no previous sibling anyway, so its own flag is moot; the
 * flag matters for item i>0 and controls only the link between i and i-1,
 * not the whole chain past that point.
 *
 * Tasks have the SAME `dependsOnPrevious` flag, but it defaults to false —
 * unlike Phase/Activity, Tasks never auto-chained at all before this
 * existed, so defaulting them to true would have silently introduced
 * blocking behavior for every already-built template's tasks. It's opt-IN
 * per task, not opt-out.
 */

const { getPool, sql } = require('../../../config/db');
const phaseService = require('./phaseService');
const activityService = require('./activityService');
const taskService = require('./taskService');

function toISODate(d) { return d.toISOString().slice(0, 10); }
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + (days || 0));
  return d;
}

// ── Template CRUD (admin) ───────────────────────────────────────────────────

async function listTemplates() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT t.template_id AS templateId, t.name, t.description, t.category, t.is_active AS isActive,
           t.created_at AS createdAt,
           (SELECT COUNT(*) FROM pm_template_phases WHERE template_id = t.template_id) AS phaseCount,
           (SELECT COUNT(*) FROM pm_template_activities ta INNER JOIN pm_template_phases tp ON tp.template_phase_id = ta.template_phase_id WHERE tp.template_id = t.template_id) AS activityCount
    FROM pm_project_templates t
    ORDER BY t.category, t.name
  `);
  return result.recordset;
}

async function getTemplate(templateId) {
  const pool = await getPool();
  const tplResult = await pool.request()
    .input('templateId', sql.Int, templateId)
    .query(`SELECT template_id AS templateId, name, description, category, is_active AS isActive, created_at AS createdAt
            FROM pm_project_templates WHERE template_id=@templateId`);
  const template = tplResult.recordset[0];
  if (!template) return null;

  const phasesResult = await pool.request()
    .input('templateId', sql.Int, templateId)
    .query(`SELECT template_phase_id AS templatePhaseId, name, description, display_order AS displayOrder,
                   start_offset_days AS startOffsetDays, duration_days AS durationDays,
                   depends_on_previous AS dependsOnPrevious
            FROM pm_template_phases WHERE template_id=@templateId ORDER BY display_order`);

  const activitiesResult = await pool.request()
    .input('templateId', sql.Int, templateId)
    .query(`SELECT ta.template_activity_id AS templateActivityId, ta.template_phase_id AS templatePhaseId,
                   ta.name, ta.description, ta.display_order AS displayOrder,
                   ta.start_offset_days AS startOffsetDays, ta.duration_days AS durationDays,
                   ta.depends_on_previous AS dependsOnPrevious
            FROM pm_template_activities ta
            INNER JOIN pm_template_phases tp ON tp.template_phase_id = ta.template_phase_id
            WHERE tp.template_id=@templateId ORDER BY ta.display_order`);

  const tasksResult = await pool.request()
    .input('templateId', sql.Int, templateId)
    .query(`SELECT tt.template_task_id AS templateTaskId, tt.template_activity_id AS templateActivityId,
                   tt.name, tt.description, tt.display_order AS displayOrder,
                   tt.priority, tt.due_offset_days AS dueOffsetDays,
                   tt.depends_on_previous AS dependsOnPrevious
            FROM pm_template_tasks tt
            INNER JOIN pm_template_activities ta ON ta.template_activity_id = tt.template_activity_id
            INNER JOIN pm_template_phases tp ON tp.template_phase_id = ta.template_phase_id
            WHERE tp.template_id=@templateId ORDER BY tt.display_order`);

  template.phases = phasesResult.recordset.map(ph => ({
    ...ph,
    activities: activitiesResult.recordset
      .filter(a => a.templatePhaseId === ph.templatePhaseId)
      .map(a => ({ ...a, tasks: tasksResult.recordset.filter(t => t.templateActivityId === a.templateActivityId) })),
  }));
  return template;
}

async function createTemplate(userId, body) {
  const { name, description, category } = body;
  if (!name?.trim()) { const e = new Error('Template name is required'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  const result = await pool.request()
    .input('name',        sql.NVarChar(200),     name.trim())
    .input('description', sql.NVarChar(sql.MAX), description || null)
    .input('category',    sql.NVarChar(50),      category || null)
    .input('userId',      sql.UniqueIdentifier,  userId)
    .query(`
      INSERT INTO pm_project_templates (name, description, category, created_by)
      OUTPUT INSERTED.template_id AS templateId, INSERTED.name
      VALUES (@name, @description, @category, @userId)
    `);
  return result.recordset[0];
}

async function updateTemplate(templateId, body) {
  const { name, description, category, isActive } = body;
  const pool = await getPool();
  await pool.request()
    .input('templateId',  sql.Int,               templateId)
    .input('name',        sql.NVarChar(200),     name?.trim())
    .input('description', sql.NVarChar(sql.MAX), description ?? null)
    .input('category',    sql.NVarChar(50),      category ?? null)
    .input('isActive',    sql.Bit,               isActive === undefined ? null : (isActive ? 1 : 0))
    .query(`
      UPDATE pm_project_templates
      SET name = COALESCE(@name, name),
          description = @description,
          category = @category,
          is_active = COALESCE(@isActive, is_active),
          modified_at = SYSDATETIMEOFFSET()
      WHERE template_id = @templateId
    `);
}

async function deleteTemplate(templateId) {
  // Templates are blueprints, not live data — ON DELETE CASCADE on the
  // template_phases/activities/tasks FKs handles cleanup, so this really is
  // a hard delete, unlike the soft-delete-then-hard-delete flow real
  // Phases/Activities/Tasks go through.
  const pool = await getPool();
  await pool.request()
    .input('templateId', sql.Int, templateId)
    .query(`DELETE FROM pm_project_templates WHERE template_id=@templateId`);
}

// ── Template phase/activity/task CRUD (admin) ───────────────────────────────

async function addTemplatePhase(templateId, body) {
  const { name, description, startOffsetDays = 0, durationDays, dependsOnPrevious = true } = body;
  if (!name?.trim()) { const e = new Error('Phase name is required'); e.statusCode = 400; throw e; }
  if (!durationDays || durationDays < 1) { const e = new Error('Duration (days) is required'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  const orderResult = await pool.request()
    .input('templateId', sql.Int, templateId)
    .query(`SELECT COALESCE(MAX(display_order), 0) + 1 AS nextOrder FROM pm_template_phases WHERE template_id=@templateId`);
  const result = await pool.request()
    .input('templateId',  sql.Int,               templateId)
    .input('name',        sql.NVarChar(200),     name.trim())
    .input('description', sql.NVarChar(sql.MAX), description || null)
    .input('displayOrder', sql.Int,              orderResult.recordset[0].nextOrder)
    .input('startOffsetDays', sql.Int,           startOffsetDays)
    .input('durationDays',    sql.Int,           durationDays)
    .input('dependsOnPrevious', sql.Bit,         dependsOnPrevious ? 1 : 0)
    .query(`
      INSERT INTO pm_template_phases (template_id, name, description, display_order, start_offset_days, duration_days, depends_on_previous)
      OUTPUT INSERTED.template_phase_id AS templatePhaseId
      VALUES (@templateId, @name, @description, @displayOrder, @startOffsetDays, @durationDays, @dependsOnPrevious)
    `);
  return result.recordset[0];
}

async function updateTemplatePhase(templatePhaseId, body) {
  const { name, description, startOffsetDays, durationDays, displayOrder, dependsOnPrevious } = body;
  const pool = await getPool();
  await pool.request()
    .input('id',               sql.Int,               templatePhaseId)
    .input('name',             sql.NVarChar(200),     name?.trim())
    .input('description',      sql.NVarChar(sql.MAX), description ?? null)
    .input('startOffsetDays',  sql.Int,               startOffsetDays ?? null)
    .input('durationDays',     sql.Int,               durationDays ?? null)
    .input('displayOrder',     sql.Int,               displayOrder ?? null)
    .input('dependsOnPrevious', sql.Bit,              dependsOnPrevious === undefined ? null : (dependsOnPrevious ? 1 : 0))
    .query(`
      UPDATE pm_template_phases
      SET name = COALESCE(@name, name), description = @description,
          start_offset_days = COALESCE(@startOffsetDays, start_offset_days),
          duration_days = COALESCE(@durationDays, duration_days),
          display_order = COALESCE(@displayOrder, display_order),
          depends_on_previous = COALESCE(@dependsOnPrevious, depends_on_previous)
      WHERE template_phase_id = @id
    `);
}

async function deleteTemplatePhase(templatePhaseId) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, templatePhaseId)
    .query(`DELETE FROM pm_template_phases WHERE template_phase_id=@id`);
}

async function addTemplateActivity(templatePhaseId, body) {
  const { name, description, startOffsetDays = 0, durationDays, dependsOnPrevious = true } = body;
  if (!name?.trim()) { const e = new Error('Activity name is required'); e.statusCode = 400; throw e; }
  if (!durationDays || durationDays < 1) { const e = new Error('Duration (days) is required'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  const orderResult = await pool.request()
    .input('templatePhaseId', sql.Int, templatePhaseId)
    .query(`SELECT COALESCE(MAX(display_order), 0) + 1 AS nextOrder FROM pm_template_activities WHERE template_phase_id=@templatePhaseId`);
  const result = await pool.request()
    .input('templatePhaseId', sql.Int,               templatePhaseId)
    .input('name',             sql.NVarChar(200),     name.trim())
    .input('description',      sql.NVarChar(sql.MAX), description || null)
    .input('displayOrder',     sql.Int,               orderResult.recordset[0].nextOrder)
    .input('startOffsetDays',  sql.Int,               startOffsetDays)
    .input('durationDays',     sql.Int,               durationDays)
    .input('dependsOnPrevious', sql.Bit,              dependsOnPrevious ? 1 : 0)
    .query(`
      INSERT INTO pm_template_activities (template_phase_id, name, description, display_order, start_offset_days, duration_days, depends_on_previous)
      OUTPUT INSERTED.template_activity_id AS templateActivityId
      VALUES (@templatePhaseId, @name, @description, @displayOrder, @startOffsetDays, @durationDays, @dependsOnPrevious)
    `);
  return result.recordset[0];
}

async function updateTemplateActivity(templateActivityId, body) {
  const { name, description, startOffsetDays, durationDays, displayOrder, dependsOnPrevious } = body;
  const pool = await getPool();
  await pool.request()
    .input('id',               sql.Int,               templateActivityId)
    .input('name',             sql.NVarChar(200),     name?.trim())
    .input('description',      sql.NVarChar(sql.MAX), description ?? null)
    .input('startOffsetDays',  sql.Int,               startOffsetDays ?? null)
    .input('durationDays',     sql.Int,               durationDays ?? null)
    .input('displayOrder',     sql.Int,               displayOrder ?? null)
    .input('dependsOnPrevious', sql.Bit,              dependsOnPrevious === undefined ? null : (dependsOnPrevious ? 1 : 0))
    .query(`
      UPDATE pm_template_activities
      SET name = COALESCE(@name, name), description = @description,
          start_offset_days = COALESCE(@startOffsetDays, start_offset_days),
          duration_days = COALESCE(@durationDays, duration_days),
          display_order = COALESCE(@displayOrder, display_order),
          depends_on_previous = COALESCE(@dependsOnPrevious, depends_on_previous)
      WHERE template_activity_id = @id
    `);
}

async function deleteTemplateActivity(templateActivityId) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, templateActivityId)
    .query(`DELETE FROM pm_template_activities WHERE template_activity_id=@id`);
}

async function addTemplateTask(templateActivityId, body) {
  const { name, description, priority = 'Medium', dueOffsetDays, dependsOnPrevious = false } = body;
  if (!name?.trim()) { const e = new Error('Task name is required'); e.statusCode = 400; throw e; }
  if (dueOffsetDays === undefined || dueOffsetDays === null) { const e = new Error('Due offset (days) is required'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  const orderResult = await pool.request()
    .input('templateActivityId', sql.Int, templateActivityId)
    .query(`SELECT COALESCE(MAX(display_order), 0) + 1 AS nextOrder FROM pm_template_tasks WHERE template_activity_id=@templateActivityId`);
  const result = await pool.request()
    .input('templateActivityId', sql.Int,               templateActivityId)
    .input('name',                sql.NVarChar(200),     name.trim())
    .input('description',         sql.NVarChar(sql.MAX), description || null)
    .input('displayOrder',        sql.Int,               orderResult.recordset[0].nextOrder)
    .input('priority',            sql.VarChar(20),       priority)
    .input('dueOffsetDays',       sql.Int,               dueOffsetDays)
    .input('dependsOnPrevious',   sql.Bit,               dependsOnPrevious ? 1 : 0)
    .query(`
      INSERT INTO pm_template_tasks (template_activity_id, name, description, display_order, priority, due_offset_days, depends_on_previous)
      OUTPUT INSERTED.template_task_id AS templateTaskId
      VALUES (@templateActivityId, @name, @description, @displayOrder, @priority, @dueOffsetDays, @dependsOnPrevious)
    `);
  return result.recordset[0];
}

async function updateTemplateTask(templateTaskId, body) {
  const { name, description, priority, dueOffsetDays, displayOrder, dependsOnPrevious } = body;
  const pool = await getPool();
  await pool.request()
    .input('id',            sql.Int,               templateTaskId)
    .input('name',          sql.NVarChar(200),     name?.trim())
    .input('description',   sql.NVarChar(sql.MAX), description ?? null)
    .input('priority',      sql.VarChar(20),       priority ?? null)
    .input('dueOffsetDays', sql.Int,               dueOffsetDays ?? null)
    .input('displayOrder',  sql.Int,               displayOrder ?? null)
    .input('dependsOnPrevious', sql.Bit,           dependsOnPrevious === undefined ? null : (dependsOnPrevious ? 1 : 0))
    .query(`
      UPDATE pm_template_tasks
      SET name = COALESCE(@name, name), description = @description,
          priority = COALESCE(@priority, priority),
          due_offset_days = COALESCE(@dueOffsetDays, due_offset_days),
          depends_on_previous = COALESCE(@dependsOnPrevious, depends_on_previous),
          display_order = COALESCE(@displayOrder, display_order)
      WHERE template_task_id = @id
    `);
}

async function deleteTemplateTask(templateTaskId) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, templateTaskId)
    .query(`DELETE FROM pm_template_tasks WHERE template_task_id=@id`);
}

// ── Instantiate ──────────────────────────────────────────────────────────────

async function instantiateTemplate(templateId, projectId, userId) {
  const template = await getTemplate(templateId);
  if (!template) { const e = new Error('Template not found'); e.statusCode = 404; throw e; }

  const pool = await getPool();
  const projResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT planned_start AS plannedStart FROM pm_projects WHERE project_id=@projectId`);
  const projectStart = projResult.recordset[0]?.plannedStart;
  if (!projectStart) {
    const e = new Error('Project needs a planned start date before a template can be applied.');
    e.statusCode = 400; throw e;
  }
  // Every phase/activity/task date below is computed as an offset from this
  // one — a past start date would generate a whole schedule that's already
  // late on arrival. The frontend already defaults/blocks this in
  // ProjectFormModal, but that's client-side convenience only; this is the
  // actual enforcement boundary.
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  if (new Date(projectStart) < todayMidnight) {
    const e = new Error("A template project can't start in the past.");
    e.statusCode = 400; throw e;
  }

  // Two passes: create every Phase → Activity → Task first (with NO
  // dependencies wired yet), then wire the sequential chain in a second
  // pass. Wiring a dependency immediately sets that entity's status to
  // Blocked (see dependencyService.blockIfNeeded) — createActivity and
  // createTask both refuse to add anything under a Blocked parent
  // (activityService.js:215, taskService.js:149-155), so wiring phase N's
  // dependency before phase N's own activities/tasks existed made every
  // create call after the second phase/activity in the chain fail with
  // "blocked by an unresolved dependency". Deferring all dependency wiring
  // to a second pass, once everything already exists, avoids that entirely.
  const phaseIds = [];
  for (const tplPhase of template.phases) {
    const phaseStart = addDays(projectStart, tplPhase.startOffsetDays);
    const phaseEnd = addDays(phaseStart, tplPhase.durationDays);
    const phase = await phaseService.createPhase(projectId, userId, {
      name: tplPhase.name, description: tplPhase.description,
      plannedStart: toISODate(phaseStart), plannedEnd: toISODate(phaseEnd),
    });
    phaseIds.push(phase.phaseId);

    const activityIds = [];
    const activityCount = tplPhase.activities.length;
    for (const [activityIndex, tplActivity] of tplPhase.activities.entries()) {
      const actStart = addDays(phaseStart, tplActivity.startOffsetDays);
      const actEnd = addDays(actStart, tplActivity.durationDays);
      // Templates predate required Activity weightage. Give each generated
      // Activity an equal share, with the final Activity receiving any
      // rounding remainder so the Phase totals exactly 100%.
      const weightage = activityIndex === activityCount - 1
        ? Math.round((100 - (Math.floor(10000 / activityCount) / 100) * (activityCount - 1)) * 100) / 100
        : Math.floor(10000 / activityCount) / 100;
      const activity = await activityService.createActivity(phase.phaseId, projectId, userId, {
        name: tplActivity.name, description: tplActivity.description,
        plannedStart: toISODate(actStart), plannedEnd: toISODate(actEnd),
        weightage,
      });
      activityIds.push(activity.activityId);

      const taskIds = [];
      for (const tplTask of tplActivity.tasks) {
        const dueDate = addDays(actStart, tplTask.dueOffsetDays);
        const task = await taskService.createTask(activity.activityId, projectId, userId, {
          name: tplTask.name, description: tplTask.description,
          priority: tplTask.priority, dueDate: toISODate(dueDate),
        });
        taskIds.push(task.taskId);
      }
      // Task chaining defaults OFF (unlike Phase/Activity) — only wire a
      // link where the template explicitly opted in for that Task. See the
      // depends_on_previous column comment in schema.mssql.sql for why the
      // default differs here.
      for (let i = 1; i < taskIds.length; i++) {
        if (!tplActivity.tasks[i].dependsOnPrevious) continue;
        await taskService.addTaskDep(taskIds[i], taskIds[i - 1], projectId, userId);
      }
    }
    // Wire this phase's own Activity chain now that all of them (and their
    // Tasks) exist — skipping any link an admin explicitly turned off for
    // that specific Activity (dependsOnPrevious === false).
    for (let i = 1; i < activityIds.length; i++) {
      if (tplPhase.activities[i].dependsOnPrevious === false) continue;
      await activityService.addActivityDep(activityIds[i], activityIds[i - 1], projectId, userId);
    }
  }

  // Wire the Phase chain now that every Phase (and everything under it)
  // exists — same per-item skip as the Activity chain above.
  for (let i = 1; i < phaseIds.length; i++) {
    if (template.phases[i].dependsOnPrevious === false) continue;
    await phaseService.addPhaseDep(phaseIds[i], phaseIds[i - 1], projectId, userId);
  }
}

module.exports = {
  listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
  addTemplatePhase, updateTemplatePhase, deleteTemplatePhase,
  addTemplateActivity, updateTemplateActivity, deleteTemplateActivity,
  addTemplateTask, updateTemplateTask, deleteTemplateTask,
  instantiateTemplate,
};
