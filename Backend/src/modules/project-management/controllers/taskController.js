'use strict';

const svc  = require('../services/taskService');
const proofs = require('../services/taskProofService');
const audit = require('../services/auditService');

const list           = async (req,res,next) => { try { res.json(await svc.getTasksForActivity(req.params.activityId, req.user.userId)); } catch(e){next(e);} };
const create         = async (req,res,next) => { try { res.status(201).json(await svc.createTask(req.params.activityId, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);} };
const update         = async (req,res,next) => { try { res.json(await svc.updateTask(req.params.id, req.pmProjectId, req.user.userId, req.body, req.user.userType === 'admin')); } catch(e){next(e);} };
const updateStatus   = async (req,res,next) => { try { res.json(await svc.updateTaskStatus(req.params.id, req.pmProjectId, req.user.userId, req.body.status, req.projectRole, req.user.userType === 'admin')); } catch(e){next(e);} };
const remove         = async (req,res,next) => { try { res.json(await svc.deleteTask(req.params.id, req.pmProjectId, req.user.userId)); } catch(e){next(e);} };
const reactivate      = async (req,res,next) => { try { await svc.reactivateTask(req.params.id, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };
const hardDelete      = async (req,res,next) => { try { await svc.hardDeleteTask(req.params.id, req.pmProjectId, req.user.userId); res.json({ok:true}); } catch(e){next(e);} };

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

// Proof of completion (optional files on a task)
const isAdmin = (req) => req.user.userType === 'admin';
const listProofs   = async (req,res,next) => { try { res.json(await proofs.listProofs(req.params.id, req.user.userId, req.projectRole, isAdmin(req))); } catch(e){next(e);} };
const addProofs    = async (req,res,next) => { try { res.status(201).json(await proofs.addProofs(req.params.id, req.pmProjectId, req.user.userId, req.projectRole, isAdmin(req), req.files, req.body?.note)); } catch(e){next(e);} };
const removeProof  = async (req,res,next) => { try { res.json(await proofs.removeProof(req.params.id, req.params.proofId, req.pmProjectId, req.user.userId, req.projectRole, isAdmin(req))); } catch(e){next(e);} };
const downloadProof = async (req,res,next) => { try { const f = await proofs.getProofForDownload(req.params.id, req.params.proofId); res.download(f.fullPath, f.originalName); } catch(e){next(e);} };

module.exports = { listProofs, addProofs, removeProof, downloadProof, list, create, update, updateStatus, remove, reactivate, hardDelete, sendRequest, removeRequest, acceptRequest, declineRequest, getMyRequests, getMyActiveTasks, getMyRecentAudit, getChat, addDep, removeDep, getAdminRecentAudit, getAdminOverdueBlocked, getMyProjectsOverdueBlocked, getStatusHistory };