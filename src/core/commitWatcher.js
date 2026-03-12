const path = require('node:path');

function normalizeRepoPath(repoPath) {
  return path.resolve(repoPath).replace(/\\/g, '/').toLowerCase();
}

function createCommitWatcher(options) {
  const onCommit = options.onCommit;
  const headByRepo = new Map();

  function readHead(repo) {
    return repo?.state?.HEAD?.commit ?? null;
  }

  function trackRepository(repo) {
    const rawRepoPath = repo?.rootUri?.fsPath;
    if (!rawRepoPath) {
      return { dispose: () => {} };
    }

    const repoPath = normalizeRepoPath(rawRepoPath);
    headByRepo.set(repoPath, readHead(repo));
    return repo.state.onDidChange(() => {
      const previous = headByRepo.get(repoPath);
      const current = readHead(repo);
      headByRepo.set(repoPath, current);
      if (!previous || !current || previous === current) {
        return;
      }
      onCommit(repoPath);
    });
  }

  return Object.freeze({
    trackRepository
  });
}

module.exports = {
  createCommitWatcher,
  normalizeRepoPath
};
