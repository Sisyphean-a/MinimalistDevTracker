const path = require('node:path');
const { openDatabase } = require('./sqliteDatabase');
const {
  createSqliteStorage,
  toDateKey,
  buildProjectKey,
  normalizeProjectRecord
} = require('./sqliteStorage');

function createStorage(storageRootPath, options = {}) {
  const now = options.now ?? (() => Date.now());
  const databasePromise = openDatabase(path.join(storageRootPath, 'storage.db'));
  return createSqliteStorage({
    databasePromise,
    now
  });
}

module.exports = {
  createStorage,
  toDateKey,
  buildProjectKey,
  normalizeProjectRecord
};
