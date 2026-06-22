const diskStorage = require('./diskStorage');

const provider =
  process.env.FILE_STORAGE_PROVIDER || 'disk';

module.exports =
  provider === 'disk'
    ? diskStorage
    : diskStorage;