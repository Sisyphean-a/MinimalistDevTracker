const path = require('node:path');

const WORKTREE_PREFIX = 'worktree ';

function normalizeRepoPath(inputPath) {
  return path.resolve(inputPath).replace(/\\/g, '/').toLowerCase();
}

function parseWorktreeListPorcelain(output) {
  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith(WORKTREE_PREFIX))
    .map((line) => line.slice(WORKTREE_PREFIX.length).trim())
    .filter((line) => line.length > 0);
}

function createWorktreeDiscovery(options) {
  const execGit = options.execGit;

  async function resolveRepositoryRoot(trackedPath) {
    const rootOutput = await execGit(['-C', trackedPath, 'rev-parse', '--show-toplevel']);
    return rootOutput.trim();
  }

  async function resolveWorktrees(repoRoot) {
    const output = await execGit(['-C', repoRoot, 'worktree', 'list', '--porcelain']);
    const worktrees = parseWorktreeListPorcelain(output).map((item) => normalizeRepoPath(item));
    const normalizedRoot = normalizeRepoPath(repoRoot);
    return Array.from(new Set(worktrees.concat(normalizedRoot)));
  }

  async function resolveAllowedPaths(trackedPaths) {
    const allowed = new Set();
    const errors = [];

    for (const trackedPath of trackedPaths) {
      try {
        const repoRoot = await resolveRepositoryRoot(trackedPath);
        const worktreePaths = await resolveWorktrees(repoRoot);
        worktreePaths.forEach((item) => allowed.add(item));
      } catch (error) {
        errors.push(new Error(`tracked path ${trackedPath}: ${error.message}`));
      }
    }

    return Object.freeze({
      allowedPaths: Array.from(allowed),
      errors
    });
  }

  return Object.freeze({
    resolveAllowedPaths
  });
}

module.exports = {
  createWorktreeDiscovery,
  parseWorktreeListPorcelain,
  normalizeRepoPath
};
