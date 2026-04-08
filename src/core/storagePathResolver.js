const path = require('node:path');

function resolveStorageRootPath(options) {
  const sharedStoragePath = options.sharedStoragePath;
  const defaultStoragePath = options.defaultStoragePath;
  const defaultSharedStoragePath = options.defaultSharedStoragePath;
  if (typeof defaultStoragePath !== 'string' || defaultStoragePath.trim() === '') {
    throw new Error('defaultStoragePath must be a non-empty string');
  }
  if (sharedStoragePath === undefined || sharedStoragePath === null) {
    return defaultStoragePath;
  }
  if (typeof sharedStoragePath !== 'string') {
    throw new Error('minimalTracker.sharedStoragePath must be a string');
  }
  const trimmed = sharedStoragePath.trim();
  if (trimmed === '') {
    if (typeof defaultSharedStoragePath === 'string' && defaultSharedStoragePath.trim() !== '') {
      return defaultSharedStoragePath;
    }
    return defaultStoragePath;
  }
  if (!path.isAbsolute(trimmed)) {
    throw new Error('minimalTracker.sharedStoragePath must be an absolute path');
  }
  return trimmed;
}

module.exports = {
  resolveStorageRootPath
};
