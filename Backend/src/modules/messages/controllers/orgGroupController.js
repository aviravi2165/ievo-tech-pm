'use strict';

const svc = require('../services/orgGroupService');

const list        = async (req, res, next) => { try { res.json(await svc.listOrgGroups()); } catch (e) { next(e); } };
const getMembers  = async (req, res, next) => { try { res.json(await svc.getOrgGroupMembers(req.params.id)); } catch (e) { next(e); } };

const create = async (req, res, next) => {
  try { res.status(201).json(await svc.createOrgGroup(req.body.name, req.body.description, req.user.userId, req.body.memberIds)); }
  catch (e) { next(e); }
};
const update = async (req, res, next) => {
  try { res.json(await svc.updateOrgGroup(req.params.id, req.body)); }
  catch (e) { next(e); }
};
const remove = async (req, res, next) => {
  try { await svc.deleteOrgGroup(req.params.id); res.json({ ok: true }); }
  catch (e) { next(e); }
};
const addMembers = async (req, res, next) => {
  try { res.json(await svc.addOrgGroupMembers(req.params.id, req.body.userIds)); }
  catch (e) { next(e); }
};
const removeMember = async (req, res, next) => {
  try { await svc.removeOrgGroupMember(req.params.id, req.params.userId); res.json({ ok: true }); }
  catch (e) { next(e); }
};

module.exports = { list, getMembers, create, update, remove, addMembers, removeMember };
