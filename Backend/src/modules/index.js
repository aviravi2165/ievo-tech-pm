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
      const result = mod.initRealtime(server);
      // FIX: initRealtime() implementations return an object like
      // { name, closeSocket }, not a bare function. The old code checked
      // `typeof result === 'function'` against that object — always false —
      // so closers stayed permanently empty and closeSocket() below was a
      // total no-op. That meant socket.io connections were NEVER actually
      // closed on shutdown, which is why server.close() in server.js would
      // hang forever whenever a client was still connected.
      const close = typeof result === 'function' ? result : result?.closeSocket;
      if (typeof close === 'function') closers.push(close);
    }
  }
  return {
    // Accepts a callback and only invokes it once every module's closer has
    // actually finished (each closer is itself given its own "done" callback).
    closeSocket: (callback) => {
      if (closers.length === 0) { callback?.(); return; }
      let remaining = closers.length;
      const done = () => { if (--remaining === 0) callback?.(); };
      closers.forEach((fn) => fn(done));
    },
  };
}

module.exports = { registerAllModules, initAllRealtime };