const svc   = require('../services/projectService');
const audit = require('../services/auditService');

const list   = async (req,res,next) => { try { res.json(await svc.listProjects(req.user.userId)); } catch(e){next(e);} };
const get    = async (req,res,next) => { try { res.json(await svc.getProject(req.params.id, req.user.userId)); } catch(e){next(e);} };
const create = async (req,res,next) => { try { res.status(201).json(await svc.createProject(req.user.userId, req.body)); } catch(e){next(e);} };
const update = async (req,res,next) => { try { res.json(await svc.updateProject(req.params.id, req.user.userId, req.body)); } catch(e){next(e);} };
const remove = async (req,res,next) => { try { await svc.deleteProject(req.params.id, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const getAudit  = async (req,res,next) => { try { res.json(await audit.getProjectAudit(req.params.id)); } catch(e){next(e);} };
const getMembers    = async (req,res,next) => { try { res.json(await svc.getMembers(req.params.id)); } catch(e){next(e);} };
const addMember     = async (req,res,next) => { try { await svc.addMember(req.params.id, req.body.userId, req.body.role||'Member', req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const updateMember  = async (req,res,next) => { try { await svc.updateMemberRole(req.params.id, req.params.uid, req.body.role, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeMember  = async (req,res,next) => { try { await svc.removeMember(req.params.id, req.params.uid, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

module.exports = { list, get, create, update, remove, getAudit, getMembers, addMember, updateMember, removeMember };
