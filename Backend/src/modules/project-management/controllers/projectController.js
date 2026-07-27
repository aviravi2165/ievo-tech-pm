const svc   = require('../services/projectService');
const audit = require('../services/auditService');
const activityInsights = require('../services/activityInsightsService');

const list   = async (req,res,next) => {
  try {
    // page/pageSize both required to opt into pagination — see
    // listProjects' own comment for why this is additive, not a replacement
    // for the plain-array shape (Dashboard/AdminDashboard need the full set).
    const { page, pageSize, search } = req.query;
    const opts = {};
    if (page !== undefined && pageSize !== undefined) {
      opts.page = parseInt(page, 10);
      opts.pageSize = Math.min(parseInt(pageSize, 10) || 25, 100);
      if (search !== undefined) opts.search = search;
    }
    res.json(await svc.listProjects(req.user.userId, req.user.userType === 'admin', opts));
  } catch(e){next(e);}
};
const get    = async (req,res,next) => { try { res.json(await svc.getProject(req.params.id, req.user.userId, req.user.userType === 'admin')); } catch(e){next(e);} };
const create = async (req,res,next) => { try { res.status(201).json(await svc.createProject(req.user.userId, req.body)); } catch(e){next(e);} };
const update = async (req,res,next) => { try { res.json(await svc.updateProject(req.params.id, req.user.userId, req.body)); } catch(e){next(e);} };
const remove = async (req,res,next) => { try { res.json(await svc.deleteProject(req.params.id, req.user.userId)); } catch(e){next(e);} };
const reactivate = async (req,res,next) => { try { await svc.reactivateProject(req.params.id, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const getAudit      = async (req,res,next) => { try { res.json(await audit.getProjectAudit(req.params.id)); } catch(e){next(e);} };
const getTaskCompletions = async (req,res,next) => { try { res.json(await audit.getTaskCompletionDates(req.params.id)); } catch(e){next(e);} };
const runActivityInsightsNow = async (req,res,next) => { try { res.json(await activityInsights.runActivityInsightsJob()); } catch(e){next(e);} };
const getMembers    = async (req,res,next) => { try { res.json(await svc.getMembers(req.params.id)); } catch(e){next(e);} };

// Returns deduplicated members with full phase → activity hierarchy for the Members tab
const getMembersHierarchy = async (req,res,next) => { try { res.json(await svc.getProjectMembersHierarchy(req.params.id)); } catch(e){next(e);} };

const addMember     = async (req,res,next) => { try { await svc.addMember(req.params.id, req.body.userId, req.body.role||'Member', req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const updateMember  = async (req,res,next) => { try { await svc.updateMemberRole(req.params.id, req.params.uid, req.body.role, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeMember  = async (req,res,next) => { try { await svc.removeMember(req.params.id, req.params.uid, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

module.exports = { list, get, create, update, remove, reactivate, getAudit, getTaskCompletions, runActivityInsightsNow, getMembers, getMembersHierarchy, addMember, updateMember, removeMember };