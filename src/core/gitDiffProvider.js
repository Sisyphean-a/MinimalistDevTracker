const { execFile } = require('node:child_process');
const path = require('node:path');

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

function runGitShortStat(repoPath) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', repoPath, 'diff', 'HEAD', '--shortstat'], (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(parseShortStat(stdout));
    });
  });
}

function createGitDiffProvider(vscode) {
  const repoMap = new Map();

  function bindRepository(repo) {
    const rootPath = repo.rootUri?.fsPath;
    if (!rootPath) {
      return;
    }
    repoMap.set(path.resolve(rootPath).toLowerCase(), repo);
  }

  function getRepoFromPath(repoPath) {
    const normalized = path.resolve(repoPath).toLowerCase();
    return repoMap.get(normalized) ?? null;
  }

  async function getDiff(repoPath) {
    const repo = getRepoFromPath(repoPath);
    if (repo) {
      return runGitShortStat(repo.rootUri.fsPath);
    }
    return runGitShortStat(repoPath);
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
