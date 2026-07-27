'use strict';

const svc = require('../services/templateService');
const projectService = require('../services/projectService');

const list   = async (req,res,next) => { try { res.json(await svc.listTemplates()); } catch(e){next(e);} };
const get    = async (req,res,next) => { try {
  const template = await svc.getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
} catch(e){next(e);} };
const create = async (req,res,next) => { try { res.status(201).json(await svc.createTemplate(req.user.userId, req.body)); } catch(e){next(e);} };
const update = async (req,res,next) => { try { await svc.updateTemplate(req.params.id, req.body); res.json({ok:true}); } catch(e){next(e);} };
const remove = async (req,res,next) => { try { await svc.deleteTemplate(req.params.id); res.json({ok:true}); } catch(e){next(e);} };

const addPhase      = async (req,res,next) => { try { res.status(201).json(await svc.addTemplatePhase(req.params.id, req.body)); } catch(e){next(e);} };
const updatePhase   = async (req,res,next) => { try { await svc.updateTemplatePhase(req.params.phaseId, req.body); res.json({ok:true}); } catch(e){next(e);} };
const removePhase   = async (req,res,next) => { try { await svc.deleteTemplatePhase(req.params.phaseId); res.json({ok:true}); } catch(e){next(e);} };

const addActivity    = async (req,res,next) => { try { res.status(201).json(await svc.addTemplateActivity(req.params.phaseId, req.body)); } catch(e){next(e);} };
const updateActivity = async (req,res,next) => { try { await svc.updateTemplateActivity(req.params.activityId, req.body); res.json({ok:true}); } catch(e){next(e);} };
const removeActivity = async (req,res,next) => { try { await svc.deleteTemplateActivity(req.params.activityId); res.json({ok:true}); } catch(e){next(e);} };

const addTask    = async (req,res,next) => { try { res.status(201).json(await svc.addTemplateTask(req.params.activityId, req.body)); } catch(e){next(e);} };
const updateTask = async (req,res,next) => { try { await svc.updateTemplateTask(req.params.taskId, req.body); res.json({ok:true}); } catch(e){next(e);} };
const removeTask = async (req,res,next) => { try { await svc.deleteTemplateTask(req.params.taskId); res.json({ok:true}); } catch(e){next(e);} };

// Creates the project first (identical to a normal "New Project" — the
// caller becomes its Manager, same as projectService.createProject always
// does), then instantiates the chosen template's structure into it.
const instantiate = async (req,res,next) => { try {
  const project = await projectService.createProject(req.user.userId, req.body);
  await svc.instantiateTemplate(req.params.id, project.projectId, req.user.userId);
  res.status(201).json(project);
} catch(e){next(e);} };

module.exports = {
  list, get, create, update, remove,
  addPhase, updatePhase, removePhase,
  addActivity, updateActivity, removeActivity,
  addTask, updateTask, removeTask,
  instantiate,
};
