const path = require('node:path');
const { createGitClient } = require('./gitClient');
const { createPathNormalizer } = require('./pathKey');

const EMPTY_BY_FILE_TYPE = Object.freeze({});
const DIFF_ZERO = Object.freeze({ insertions: 0, deletions: 0, byFileType: EMPTY_BY_FILE_TYPE });
const NUMSTAT_SEPARATOR = '\t';
const OTHER_FILE_TYPE = 'other';

function toMetricValue(raw) {
  if (raw === '-' || raw === undefined) {
    return 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePathForType(rawPath) {
  if (!rawPath) {
    return '';
  }
  const candidate = rawPath.includes('=>')
    ? rawPath.split('=>').pop().trim()
    : rawPath.trim();
  return candidate.replace(/[{}]/g, '').trim();
}

function resolveFileType(rawPath) {
  const normalizedPath = normalizePathForType(rawPath);
  if (!normalizedPath) {
    return OTHER_FILE_TYPE;
  }
  const extension = path.extname(normalizedPath).toLowerCase();
  return extension ? extension.slice(1) : OTHER_FILE_TYPE;
}

function addFileTypeMetrics(byFileType, fileType, insertions, deletions) {
  const existing = byFileType[fileType] ?? { insertions: 0, deletions: 0 };
  byFileType[fileType] = {
    insertions: existing.insertions + insertions,
    deletions: existing.deletions + deletions
  };
}

function parseNumStat(stdout) {
  if (!stdout || !stdout.trim()) {
    return DIFF_ZERO;
  }

  let insertions = 0;
  let deletions = 0;
  const byFileType = {};
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    const [addedRaw, deletedRaw, ...pathParts] = line.split(NUMSTAT_SEPARATOR);
    if (!pathParts.length) {
      return;
    }
    const filePath = pathParts.join(NUMSTAT_SEPARATOR);
    const fileType = resolveFileType(filePath);
    const added = toMetricValue(addedRaw);
    const deleted = toMetricValue(deletedRaw);
    insertions += added;
    deletions += deleted;
    addFileTypeMetrics(byFileType, fileType, added, deleted);
  });
  return { insertions, deletions, byFileType };
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
    const stdout = await gitClient.run(['-C', targetRepoPath, 'diff', 'HEAD', '--numstat']);
    return parseNumStat(stdout);
  }

  async function getCommitDiff(repoPath, commitHash) {
    const repo = getRepoFromPath(repoPath);
    const targetRepoPath = repo ? repo.rootUri.fsPath : repoPath;
    const ref = commitHash ?? 'HEAD';
    const stdout = await gitClient.run(['-C', targetRepoPath, 'show', '--numstat', '--format=', ref]);
    return parseNumStat(stdout);
  }

  return Object.freeze({
    bindRepository,
    getDiff,
    getCommitDiff
  });
}

module.exports = {
  createGitDiffProvider,
  parseNumStat,
  DIFF_ZERO
};
