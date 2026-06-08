const svc = require('../services/taskService');

const list         = async (req,res,next) => { try { res.json(await svc.getTasksForActivity(req.params.activityId)); } catch(e){next(e);} };
const create       = async (req,res,next) => { try { res.status(201).json(await svc.createTask(req.params.activityId, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);} };
const update       = async (req,res,next) => { try { res.json(await svc.updateTask(req.params.id, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);} };
const updateStatus = async (req,res,next) => { try { res.json(await svc.updateTaskStatus(req.params.id, req.pmProjectId, req.user.userId, req.body.status, req.projectRole)); } catch(e){next(e);} };
const remove       = async (req,res,next) => { try { await svc.deleteTask(req.params.id, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const addAssignee  = async (req,res,next) => { try { await svc.addAssignee(req.params.id, req.body.userId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeAssignee = async (req,res,next) => { try { await svc.removeAssignee(req.params.id, req.params.uid, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const addDep       = async (req,res,next) => { try { await svc.addTaskDep(req.params.id, req.body.dependsOnId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeDep    = async (req,res,next) => { try { await svc.removeTaskDep(req.params.id, req.params.depId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

module.exports = { list, create, update, updateStatus, remove, addAssignee, removeAssignee, addDep, removeDep };
