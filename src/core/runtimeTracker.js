function isFileDocument(document) {
  return document?.uri?.scheme === 'file';
}

function createRuntimeTracker(options) {
  const pathRegistry = options.pathRegistry;
  const activityTracker = options.activityTracker;
  const gitDiffProvider = options.gitDiffProvider;
  const commitWatcher = options.commitWatcher;
  const logError = options.logError;

  function safeInvokeAsync(label, task) {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        logError(label, error);
      });
  }

  function isDocumentTracked(document) {
    return Boolean(isFileDocument(document) && pathRegistry.isAllowed(document.uri.fsPath));
  }

  function resolveRepoPath(document) {
    return pathRegistry.resolveRepoPath(document.uri.fsPath);
  }

  function recordEditorActivity(document) {
    if (!isDocumentTracked(document)) {
      return;
    }
    const repoPath = resolveRepoPath(document);
    if (!repoPath) {
      return;
    }
    safeInvokeAsync('recordActivity', () => activityTracker.recordActivity(repoPath));
  }

  function handleCommit(repoPath) {
    safeInvokeAsync('handleCommit', () => activityTracker.handleCommit(repoPath));
  }

  function registerRepository(input) {
    gitDiffProvider.bindRepository(input.repo);
    const disposable = commitWatcher.trackRepository(input.repo);
    input.subscriptions.push(disposable);
  }

  return Object.freeze({
    recordEditorActivity,
    handleCommit,
    registerRepository
  });
}

module.exports = {
  createRuntimeTracker
};
