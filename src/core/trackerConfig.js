const SHARED_STORAGE_PATH_KEY = 'minimalTracker.sharedStoragePath';

function createTrackerConfigReader(vscode) {
  function getConfig() {
    return vscode.workspace.getConfiguration('minimalTracker');
  }

  function readStringArray(path, fallback = []) {
    const rawValue = getConfig().get(path, fallback);
    if (!Array.isArray(rawValue)) {
      return fallback;
    }
    return rawValue.filter((value) => typeof value === 'string' && value.trim());
  }

  function getExcludeGlobs() {
    return readStringArray('fileWatch.excludeGlobs', []);
  }

  function shouldFlushBeforeReport() {
    return getConfig().get('flushBeforeReport', true);
  }

  function getSharedStoragePath() {
    const rawValue = getConfig().get('sharedStoragePath', '');
    if (typeof rawValue !== 'string') {
      throw new Error(`${SHARED_STORAGE_PATH_KEY} must be a string`);
    }
    return rawValue;
  }

  return Object.freeze({
    getExcludeGlobs,
    getSharedStoragePath,
    shouldFlushBeforeReport
  });
}

module.exports = {
  createTrackerConfigReader
};
