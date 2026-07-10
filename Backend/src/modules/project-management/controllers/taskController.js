'use strict';

const svc  = require('../services/taskService');
const audit = require('../services/auditService');

const list           = async (req,res,next) => { try { res.json(await svc.getTasksForActivity(req.params.activityId)); } catch(e){next(e);} };
const create         = async (req,res,next) => { try { res.status(201).json(await svc.createTask(req.params.activityId, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);} };
const update         = async (req,res,next) => { try { res.json(await svc.updateTask(req.params.id, req.pmProjectId, req.user.userId, req.body, req.user.userType === 'admin')); } catch(e){next(e);} };
const updateStatus   = async (req,res,next) => { try { res.json(await svc.updateTaskStatus(req.params.id, req.pmProjectId, req.user.userId, req.body.status, req.projectRole)); } catch(e){next(e);} };
const remove         = async (req,res,next) => { try { res.json(await svc.deleteTask(req.params.id, req.pmProjectId, req.user.userId)); } catch(e){next(e);} };
const reactivate      = async (req,res,next) => { try { await svc.reactivateTask(req.params.id, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

// Assignment requests — post-creation assign
const sendRequest    = async (req,res,next) => { try { await svc.sendAssignmentRequest(req.params.id, req.body.userId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeRequest  = async (req,res,next) => { try { await svc.removeAssignmentRequest(req.params.id, req.params.uid, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

// Called by the assignee (Dashboard → accept/decline)
const acceptRequest  = async (req,res,next) => { try { res.json(await svc.acceptAssignmentRequest(req.params.requestId, req.user.userId)); } catch(e){next(e);} };
const declineRequest = async (req,res,next) => { try { res.json(await svc.declineAssignmentRequest(req.params.requestId, req.user.userId)); } catch(e){next(e);} };

// Fetch all pending/responded requests for the logged-in user (Dashboard)
const getMyRequests     = async (req,res,next) => { try { res.json(await svc.getMyAssignmentRequests(req.user.userId)); } catch(e){next(e);} };
// Accepted/Ongoing tasks across all projects for the logged-in user (Dashboard)
const getMyActiveTasks  = async (req,res,next) => { try { res.json(await svc.getMyActiveTasks(req.user.userId)); } catch(e){next(e);} };
// Cross-project recent audit feed for the logged-in user (Dashboard)
const getMyRecentAudit  = async (req,res,next) => { try { res.json(await audit.getMyRecentAudit(req.user.userId)); } catch(e){next(e);} };
const getMyProjectsOverdueBlocked = async (req,res,next) => { try { res.json(await svc.getMyProjectsOverdueAndBlockedTasks(req.user.userId)); } catch(e){next(e);} };
const getAdminRecentAudit    = async (req,res,next) => { try { res.json(await audit.getAllRecentAudit()); } catch(e){next(e);} };
const getAdminOverdueBlocked = async (req,res,next) => { try { res.json(await svc.getOrgOverdueAndBlockedTasks()); } catch(e){next(e);} };

// Chat — returns the (auto-created if needed) task Shared/CC thread's conversationId
const getChat = async (req,res,next) => { try { res.json({ conversationId: await svc.getOrCreateTaskThread(req.params.id) }); } catch(e){next(e);} };

const addDep         = async (req,res,next) => { try { await svc.addTaskDep(req.params.id, req.body.dependsOnId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const removeDep      = async (req,res,next) => { try { await svc.removeTaskDep(req.params.id, req.params.depId, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

const getStatusHistory = async (req,res,next) => { try { res.json(await svc.getTaskStatusHistory(req.params.id)); } catch(e){next(e);} };

module.exports = { list, create, update, updateStatus, remove, reactivate, sendRequest, removeRequest, acceptRequest, declineRequest, getMyRequests, getMyActiveTasks, getMyRecentAudit, getChat, addDep, removeDep, getAdminRecentAudit, getAdminOverdueBlocked, getMyProjectsOverdueBlocked, getStatusHistory };