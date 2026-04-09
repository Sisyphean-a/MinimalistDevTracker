function createOpenDailyReportHandler(options) {
  const shouldFlushBeforeReport = options.shouldFlushBeforeReport;
  const tracker = options.tracker;
  const showDailyReport = options.showDailyReport;

  return async function openDailyReport() {
    if (shouldFlushBeforeReport()) {
      await tracker.flushAll();
    }
    await showDailyReport();
  };
}

function ensureRegistryContract(pathRegistry) {
  if (typeof pathRegistry?.getAllowedRoots !== 'function') {
    throw new Error('buildPathRegistry must return an object with getAllowedRoots()');
  }
}

function createTrackedRuntimeReloader(options) {
  return async function reloadTrackedRuntime() {
    const trackedPaths = options.loadTrackedPaths();
    const pathRegistry = await options.buildPathRegistry(trackedPaths);
    ensureRegistryContract(pathRegistry);
    if (typeof options.onPathRegistryUpdated === 'function') {
      options.onPathRegistryUpdated(pathRegistry);
    }
    options.runtimeTracker.setPathRegistry(pathRegistry);
    const nextRoots = pathRegistry.getAllowedRoots();
    const excludeGlobs = options.loadExcludeGlobs();
    options.fileActivityWatcher.rebuild(nextRoots, excludeGlobs);
  };
}

function createStorageBootstrapper(options) {
  return async function bootstrapStorage() {
    const snapshot = options.readStorageSnapshot
      ? await options.readStorageSnapshot()
      : {
          legacyImportCompletedAt: await options.readLegacyImportCompletedAt(),
          sessionCount: null
        };
    const sourceDirs = [...new Set((options.migrationSourceDirs ?? [options.legacyStoragePath]).filter(Boolean))];
    const shouldRetryEmptyImport = snapshot.sessionCount === 0 && sourceDirs.length > 0;

    if (!snapshot.legacyImportCompletedAt || shouldRetryEmptyImport) {
      for (const sourceDir of sourceDirs) {
        await options.migrateLegacyStorageData({
          sourceDir,
          targetDir: options.storageRootPath
        });
      }
    }
    return options.createStorage(options.storageRootPath);
  };
}

module.exports = {
  createOpenDailyReportHandler,
  createTrackedRuntimeReloader,
  createStorageBootstrapper
};
