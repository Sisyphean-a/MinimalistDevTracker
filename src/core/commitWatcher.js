const { createPathNormalizer } = require('./pathKey');

function normalizeRepoPath(repoPath, normalizer = createPathNormalizer()) {
  return normalizer.normalize(repoPath);
}

function createCommitWatcher(options) {
  const onCommit = options.onCommit;
  const normalizer = options.normalizer ?? createPathNormalizer(options);
  const headByRepo = new Map();

  function readHead(repo) {
    return repo?.state?.HEAD?.commit ?? null;
  }

  function trackRepository(repo) {
    const rawRepoPath = repo?.rootUri?.fsPath;
    if (!rawRepoPath) {
      return { dispose: () => {} };
    }

    const repoPath = normalizeRepoPath(rawRepoPath, normalizer);
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
