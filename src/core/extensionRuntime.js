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
    options.runtimeTracker.setPathRegistry(pathRegistry);
    const nextRoots = pathRegistry.getAllowedRoots();
    const excludeGlobs = options.loadExcludeGlobs();
    options.fileActivityWatcher.rebuild(nextRoots, excludeGlobs);
  };
}

module.exports = {
  createOpenDailyReportHandler,
  createTrackedRuntimeReloader
};
