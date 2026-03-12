function isFileDocument(document) {
  return document?.uri?.scheme === 'file';
}

function createRuntimeTracker(options) {
  let pathRegistry = options.pathRegistry;
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

  function handleCommit(repoPath, commitHash) {
    safeInvokeAsync('handleCommit', async () => {
      let commitDiff = null;
      if (commitHash && typeof gitDiffProvider.getCommitDiff === 'function') {
        commitDiff = await gitDiffProvider.getCommitDiff(repoPath, commitHash);
      }
      await activityTracker.handleCommit(repoPath, commitDiff);
    });
  }

  function recordPathActivity(fsPath) {
    const repoPath = pathRegistry.resolveRepoPath(fsPath);
    if (!repoPath) {
      return;
    }
    safeInvokeAsync('recordPathActivity', () => activityTracker.recordActivity(repoPath));
  }

  function setPathRegistry(nextPathRegistry) {
    if (typeof nextPathRegistry?.isAllowed !== 'function' || typeof nextPathRegistry?.resolveRepoPath !== 'function') {
      throw new Error('pathRegistry must expose isAllowed() and resolveRepoPath()');
    }
    pathRegistry = nextPathRegistry;
  }

  function registerRepository(input) {
    gitDiffProvider.bindRepository(input.repo);
    const disposable = commitWatcher.trackRepository(input.repo);
    input.subscriptions.push(disposable);
  }

  return Object.freeze({
    recordEditorActivity,
    recordPathActivity,
    setPathRegistry,
    handleCommit,
    registerRepository
  });
}

module.exports = {
  createRuntimeTracker
};
