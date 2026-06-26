'use strict';

const {
  getDepartments,
  getUsers,
  registerUser,
  updateUser,
} = require('../services/userManagementService');

async function handleGetDepartments(req, res, next) {
  try {
    const depts = await getDepartments();
    res.json(depts);
  } catch (err) { next(err); }
}

async function handleGetUsers(req, res, next) {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const users = await getUsers({
      search,
      page:  parseInt(page,  10) || 1,
      limit: parseInt(limit, 10) || 50,
    });
    res.json(users);
  } catch (err) { next(err); }
}

async function handleRegisterUser(req, res, next) {
  try {
    const user = await registerUser(req.body);
    res.status(201).json(user);
  } catch (err) { next(err); }
}

async function handleUpdateUser(req, res, next) {
  try {
    const { userId } = req.params;
    const user = await updateUser(userId, req.body);
    res.json(user);
  } catch (err) { next(err); }
}

module.exports = {
  handleGetDepartments,
  handleGetUsers,
  handleRegisterUser,
  handleUpdateUser,
};