const svc = require('../services/phaseService');

const list         = async (req,res,next) => { try { res.json(await svc.getPhasesForProject(req.params.projectId)); } catch(e){next(e);} };
const reorder      = async (req,res,next) => { try { await svc.reorderPhase(req.pmProjectId, req.params.id, req.body.direction); res.json({ok:true}); } catch(e){next(e);} };
const create       = async (req,res,next) => { try { res.status(201).json(await svc.createPhase(req.params.projectId, req.user.userId, req.body)); } catch(e){next(e);} };
const update       = async (req,res,next) => { try { res.json(await svc.updatePhase(req.params.id, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);} };
const updateStatus = async (req,res,next) => { try { res.json(await svc.updatePhaseStatus(req.params.id, req.pmProjectId, req.user.userId, req.body.status)); } catch(e){next(e);} };
const remove       = async (req,res,next) => { try { await svc.deletePhase(req.params.id, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const addDep       = async (req,res,next) => { try { await svc.addPhaseDep(req.params.id, req.body.dependsOnId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeDep    = async (req,res,next) => { try { await svc.removePhaseDep(req.params.id, req.params.depId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

module.exports = { list, create, update, updateStatus, remove, addDep, removeDep, reorder };