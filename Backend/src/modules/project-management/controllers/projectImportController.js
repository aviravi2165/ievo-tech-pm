'use strict';

const svc = require('../services/projectImportService');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

module.exports = {
  // The sample workbook; its dates start from the project's start date so it imports as it is.
  template: wrap(async (req, res) => {
    const { getPool, sql } = require('../../../config/db');
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, req.params.id).query(`SELECT planned_start AS plannedStart FROM pm_projects WHERE project_id=@id`);
    const start = r.recordset[0]?.plannedStart ? new Date(r.recordset[0].plannedStart).toISOString().slice(0, 10) : null;
    const wb = await svc.buildTemplateWorkbook(start);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Specula project import format.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  }),
  preview: wrap(async (req, res) => res.json(await svc.previewImport(req.params.id, req.file.buffer))),
  run: wrap(async (req, res) => res.status(201).json(await svc.runImport(req.params.id, req.user.userId, req.file.buffer))),
};
