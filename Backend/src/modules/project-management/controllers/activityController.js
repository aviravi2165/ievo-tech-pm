const svc = require('../services/activityService');

const list         = async (req,res,next) => { try { res.json(await svc.getActivitiesForPhase(req.params.phaseId)); } catch(e){next(e);} };
const create       = async (req,res,next) => { try { res.status(201).json(await svc.createActivity(req.params.phaseId, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);} };
const update       = async (req,res,next) => { try { res.json(await svc.updateActivity(req.params.id, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);} };
const updateStatus = async (req,res,next) => { try { res.json(await svc.updateActivityStatus(req.params.id, req.pmProjectId, req.user.userId, req.body.status)); } catch(e){next(e);} };
const remove       = async (req,res,next) => { try { await svc.deleteActivity(req.params.id, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const addDep       = async (req,res,next) => { try { await svc.addActivityDep(req.params.id, req.body.dependsOnId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeDep    = async (req,res,next) => { try { await svc.removeActivityDep(req.params.id, req.params.depId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

module.exports = { list, create, update, updateStatus, remove, addDep, removeDep };
