'use strict';

const svc = require('../services/phaseService');
const memberSvc = require('../services/phaseMemberService');

const list         = async (req,res,next) => { try { res.json(await svc.getPhasesForProject(req.params.projectId, req.user.userId, req.user.userType === 'admin')); } catch(e){next(e);} };
const reorder      = async (req,res,next) => { try { await svc.reorderPhase(req.pmProjectId, req.params.id, req.body.direction); res.json({ok:true}); } catch(e){next(e);} };
const create       = async (req,res,next) => { try { res.status(201).json(await svc.createPhase(req.params.projectId, req.user.userId, req.body)); } catch(e){next(e);} };
const update       = async (req,res,next) => { try { res.json(await svc.updatePhase(req.params.id, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);} };
const remove       = async (req,res,next) => { try { res.json(await svc.deletePhase(req.params.id, req.pmProjectId, req.user.userId)); } catch(e){next(e);} };
const reactivate   = async (req,res,next) => { try { await svc.reactivatePhase(req.params.id, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const addDep       = async (req,res,next) => { try { await svc.addPhaseDep(req.params.id, req.body.dependsOnId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeDep    = async (req,res,next) => { try { await svc.removePhaseDep(req.params.id, req.params.depId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

// Members — role can be 'Manager' | 'Employee' | 'Viewer' (default 'Employee')
const listMembers      = async (req,res,next) => { try { res.json(await memberSvc.getPhaseMembers(req.params.id)); } catch(e){next(e);} };
const addMember        = async (req,res,next) => { try { await memberSvc.addOrUpdatePhaseMember(req.params.id, req.body.userId, req.body.role, req.user.userId, req.pmProjectId); res.json({ok:true}); } catch(e){next(e);} };
const updateMemberRole = async (req,res,next) => { try { await memberSvc.addOrUpdatePhaseMember(req.params.id, req.params.uid, req.body.role, req.user.userId, req.pmProjectId); res.json({ok:true}); } catch(e){next(e);} };
const removeMember     = async (req,res,next) => { try { await memberSvc.removePhaseMember(req.params.id, req.params.uid, req.user.userId, req.pmProjectId); res.json({ok:true}); } catch(e){next(e);} };

const getStatusHistory = async (req,res,next) => { try { res.json(await svc.getPhaseStatusHistory(req.params.id)); } catch(e){next(e);} };

module.exports = {
  list, create, update, remove, reactivate, addDep, removeDep, reorder,
  listMembers, addMember, updateMemberRole, removeMember, getStatusHistory,
};