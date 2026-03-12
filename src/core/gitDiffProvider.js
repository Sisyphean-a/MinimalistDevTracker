const { createGitClient } = require('./gitClient');
const { createPathNormalizer } = require('./pathKey');

const DIFF_ZERO = Object.freeze({ insertions: 0, deletions: 0 });
const SHORTSTAT_PATTERN = /(\d+)\s+insertions?\(\+\).*(\d+)\s+deletions?\(-\)|((\d+)\s+insertions?\(\+\))|((\d+)\s+deletions?\(-\))/;

function parseShortStat(stdout) {
  if (!stdout || !stdout.trim()) {
    return DIFF_ZERO;
  }
  const text = stdout.trim();
  const match = SHORTSTAT_PATTERN.exec(text);
  if (!match) {
    return DIFF_ZERO;
  }
  const insertions = Number(match[1] ?? match[4] ?? 0);
  const deletions = Number(match[2] ?? match[6] ?? 0);
  return { insertions, deletions };
}

function createGitDiffProvider(vscode, options = {}) {
  const gitClient = options.gitClient ?? createGitClient(options);
  const normalizer = options.normalizer ?? createPathNormalizer(options);
  const repoMap = new Map();

  function bindRepository(repo) {
    const rootPath = repo.rootUri?.fsPath;
    if (!rootPath) {
      return;
    }
    repoMap.set(normalizer.normalize(rootPath), repo);
  }

  function getRepoFromPath(repoPath) {
    const normalized = normalizer.normalize(repoPath);
    return repoMap.get(normalized) ?? null;
  }

  async function getDiff(repoPath) {
    const repo = getRepoFromPath(repoPath);
    const targetRepoPath = repo ? repo.rootUri.fsPath : repoPath;
    const stdout = await gitClient.run(['-C', targetRepoPath, 'diff', 'HEAD', '--shortstat']);
    return parseShortStat(stdout);
  }

  return Object.freeze({
    bindRepository,
    getDiff
  });
}

module.exports = {
  createGitDiffProvider,
  parseShortStat,
  DIFF_ZERO
};
