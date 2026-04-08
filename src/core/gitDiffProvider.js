const path = require('node:path');
const fs = require('node:fs/promises');
const { createGitClient } = require('./gitClient');
const { createPathNormalizer } = require('./pathKey');

const EMPTY_BY_FILE_TYPE = Object.freeze({});
const DIFF_ZERO = Object.freeze({ insertions: 0, deletions: 0, byFileType: EMPTY_BY_FILE_TYPE });
const DIFF_SNAPSHOT_ZERO = Object.freeze({
  tracked: DIFF_ZERO,
  untracked: DIFF_ZERO,
  insertions: 0,
  deletions: 0,
  byFileType: EMPTY_BY_FILE_TYPE
});
const NUMSTAT_SEPARATOR = '\t';
const OTHER_FILE_TYPE = 'other';
const UNKNOWN_BRANCH = 'unknown';
const DETACHED_BRANCH = 'detached';

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

function mergeByFileType(leftMap, rightMap) {
  const output = { ...(leftMap ?? {}) };
  Object.entries(rightMap ?? {}).forEach(([fileType, metrics]) => {
    const current = output[fileType] ?? { insertions: 0, deletions: 0 };
    output[fileType] = {
      insertions: current.insertions + (metrics.insertions ?? 0),
      deletions: current.deletions + (metrics.deletions ?? 0)
    };
  });
  return output;
}

function mergeMetrics(leftMetrics, rightMetrics) {
  return {
    insertions: (leftMetrics?.insertions ?? 0) + (rightMetrics?.insertions ?? 0),
    deletions: (leftMetrics?.deletions ?? 0) + (rightMetrics?.deletions ?? 0),
    byFileType: mergeByFileType(leftMetrics?.byFileType, rightMetrics?.byFileType)
  };
}

function createSnapshot(trackedMetrics, untrackedMetrics) {
  const tracked = trackedMetrics ?? DIFF_ZERO;
  const untracked = untrackedMetrics ?? DIFF_ZERO;
  const total = mergeMetrics(tracked, untracked);
  return {
    tracked,
    untracked,
    insertions: total.insertions,
    deletions: total.deletions,
    byFileType: total.byFileType
  };
}

function parseNullSeparatedPaths(raw) {
  if (!raw) {
    return [];
  }
  return raw.split('\0').map((item) => item.trim()).filter(Boolean);
}

function countBufferLines(contentBuffer) {
  if (!contentBuffer || contentBuffer.length === 0) {
    return 0;
  }
  if (contentBuffer.includes(0)) {
    return 0;
  }
  let lines = 1;
  for (let index = 0; index < contentBuffer.length; index += 1) {
    if (contentBuffer[index] === 10) {
      lines += 1;
    }
  }
  return lines;
}

async function defaultCountFileLines(repoPath, relativePath) {
  const absolutePath = path.join(repoPath, relativePath);
  const content = await fs.readFile(absolutePath);
  return countBufferLines(content);
}

function toPosixPath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

function resolveRelativePaths(repoPath, input = {}) {
  if (!Array.isArray(input.files)) {
    return null;
  }
  const values = input.files
    .map((filePath) => path.relative(repoPath, filePath))
    .filter((relativePath) => relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
    .map(toPosixPath);
  return Array.from(new Set(values));
}

function appendPathspec(args, relativePaths) {
  if (!relativePaths || relativePaths.length === 0) {
    return args;
  }
  return args.concat(['--', ...relativePaths]);
}

async function collectUntrackedMetrics(repoPath, gitClient, countFileLines, relativePaths) {
  if (relativePaths && relativePaths.length === 0) {
    return DIFF_ZERO;
  }
  const stdout = await gitClient.run(appendPathspec(
    ['-C', repoPath, 'ls-files', '--others', '--exclude-standard', '-z'],
    relativePaths
  ));
  const files = parseNullSeparatedPaths(stdout);
  if (files.length === 0) {
    return DIFF_ZERO;
  }

  let insertions = 0;
  const byFileType = {};
  await Promise.all(files.map(async (relativePath) => {
    const lines = await countFileLines(repoPath, relativePath);
    if (lines <= 0) {
      return;
    }
    const fileType = resolveFileType(relativePath);
    insertions += lines;
    addFileTypeMetrics(byFileType, fileType, lines, 0);
  }));

  if (insertions === 0) {
    return DIFF_ZERO;
  }
  return { insertions, deletions: 0, byFileType };
}

function createGitDiffProvider(vscode, options = {}) {
  const gitClient = options.gitClient ?? createGitClient(options);
  const normalizer = options.normalizer ?? createPathNormalizer(options);
  const countFileLines = options.countFileLines ?? defaultCountFileLines;
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

  async function getDiff(repoPath, input = {}) {
    const repo = getRepoFromPath(repoPath);
    const targetRepoPath = repo ? repo.rootUri.fsPath : repoPath;
    const relativePaths = resolveRelativePaths(targetRepoPath, input);
    if (relativePaths && relativePaths.length === 0) {
      return DIFF_SNAPSHOT_ZERO;
    }
    const trackedStdout = await gitClient.run(appendPathspec(
      ['-C', targetRepoPath, 'diff', 'HEAD', '--numstat'],
      relativePaths
    ));
    const trackedMetrics = parseNumStat(trackedStdout);
    const untrackedMetrics = await collectUntrackedMetrics(targetRepoPath, gitClient, countFileLines, relativePaths);
    return createSnapshot(trackedMetrics, untrackedMetrics);
  }

  async function getCommitDiff(repoPath, commitHash, input = {}) {
    const repo = getRepoFromPath(repoPath);
    const targetRepoPath = repo ? repo.rootUri.fsPath : repoPath;
    const ref = commitHash ?? 'HEAD';
    const relativePaths = resolveRelativePaths(targetRepoPath, input);
    if (relativePaths && relativePaths.length === 0) {
      return DIFF_SNAPSHOT_ZERO;
    }
    const stdout = await gitClient.run(appendPathspec(
      ['-C', targetRepoPath, 'show', '--numstat', '--format=', ref],
      relativePaths
    ));
    const trackedMetrics = parseNumStat(stdout);
    return createSnapshot(trackedMetrics, DIFF_ZERO);
  }

  async function isUntrackedFile(repoPath, fsPath) {
    const repo = getRepoFromPath(repoPath);
    const targetRepoPath = repo ? repo.rootUri.fsPath : repoPath;
    const relativePaths = resolveRelativePaths(targetRepoPath, { files: [fsPath] });
    if (!relativePaths || relativePaths.length === 0) {
      return false;
    }
    const stdout = await gitClient.run(appendPathspec(
      ['-C', targetRepoPath, 'ls-files', '--others', '--exclude-standard', '-z'],
      relativePaths
    ));
    return parseNullSeparatedPaths(stdout).length > 0;
  }

  async function getCurrentBranch(repoPath) {
    const repo = getRepoFromPath(repoPath);
    const stateBranch = repo?.state?.HEAD?.name;
    if (stateBranch && stateBranch.trim()) {
      return stateBranch.trim();
    }
    const targetRepoPath = repo ? repo.rootUri.fsPath : repoPath;
    const stdout = await gitClient.run(['-C', targetRepoPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = stdout.trim();
    if (!branch) {
      return UNKNOWN_BRANCH;
    }
    if (branch === 'HEAD') {
      return DETACHED_BRANCH;
    }
    return branch;
  }

  return Object.freeze({
    bindRepository,
    getDiff,
    getCommitDiff,
    isUntrackedFile,
    getCurrentBranch
  });
}

module.exports = {
  createGitDiffProvider,
  parseNumStat,
  DIFF_ZERO,
  DIFF_SNAPSHOT_ZERO,
  createSnapshot
};
