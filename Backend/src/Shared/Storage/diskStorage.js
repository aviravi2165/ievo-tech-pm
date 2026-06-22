const fs = require('fs');
const path = require('path');

const ROOT = process.env.FILE_STORAGE_ROOT;

async function saveFile(buffer, storageKey) {
  const fullPath = path.join(ROOT, storageKey);

  fs.mkdirSync(path.dirname(fullPath), {
    recursive: true,
  });

  fs.writeFileSync(fullPath, buffer);

  return storageKey;
}

function getFullPath(storageKey) {
  return path.join(ROOT, storageKey);
}

function deleteFile(storageKey) {
  const fullPath = path.join(ROOT, storageKey);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

module.exports = {
  saveFile,
  getFullPath,
  deleteFile,
};