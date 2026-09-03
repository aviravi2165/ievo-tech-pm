'use strict';

const svc = require('../services/projectGroupService');

const isAdmin = (req) => req.user.userType === 'admin';

const list   = async (req, res, next) => { try { res.json(await svc.listGroups()); } catch (e) { next(e); } };
const create = async (req, res, next) => { try { res.status(201).json(await svc.createGroup(req.user.userId, isAdmin(req), req.body)); } catch (e) { next(e); } };
const rename = async (req, res, next) => { try { res.json(await svc.renameGroup(req.params.id, req.user.userId, isAdmin(req), req.body.name)); } catch (e) { next(e); } };
const remove = async (req, res, next) => { try { res.json(await svc.deleteGroup(req.params.id, req.user.userId, isAdmin(req))); } catch (e) { next(e); } };

// Assign/remove a single project's group. body.groupId = null removes it.
const setProjectGroup = async (req, res, next) => {
  try { res.json(await svc.setProjectGroup(req.params.projectId, req.body.groupId ?? null, req.user.userId, isAdmin(req))); }
  catch (e) { next(e); }
};

module.exports = { list, create, rename, remove, setProjectGroup };
