/**
 * Central module registry.
 * To add a new module: import it here and add to MODULES array.
 */
const auth        = require('./auth');
const messages    = require('./messages');

const MODULES = [auth, messages,];

function registerAllModules(app) {
  for (const mod of MODULES) {
    if (typeof mod.register === 'function') {
      mod.register(app);
    }
  }
}

function initAllRealtime(server) {
  const closers = [];
  for (const mod of MODULES) {
    if (typeof mod.initRealtime === 'function') {
      const close = mod.initRealtime(server);
      if (typeof close === 'function') closers.push(close);
    }
  }
  return {
    closeSocket: () => closers.forEach((fn) => fn()),
  };
}

module.exports = { registerAllModules, initAllRealtime };