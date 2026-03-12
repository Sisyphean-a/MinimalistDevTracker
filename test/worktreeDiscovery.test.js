const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorktreeDiscovery, parseWorktreeListPorcelain } = require('../src/core/worktreeDiscovery');

test('parseWorktreeListPorcelain extracts all worktree paths', () => {
  const output = [
    'worktree F:/repo/main',
    'HEAD abcdef1',
    'branch refs/heads/main',
    '',
    'worktree F:/repo/wt-a',
    'HEAD abcdef2',
    'branch refs/heads/feature/a'
  ].join('\n');

  const paths = parseWorktreeListPorcelain(output);
  assert.deepEqual(paths, ['F:/repo/main', 'F:/repo/wt-a']);
});

test('resolveAllowedPaths merges repo root and discovered worktrees', async () => {
  const responses = new Map([
    ['-C|F:/input/repo|rev-parse|--show-toplevel', 'F:/repo/main\n'],
    ['-C|F:/repo/main|worktree|list|--porcelain', 'worktree F:/repo/main\nworktree F:/repo/wt-a\n']
  ]);

  const discovery = createWorktreeDiscovery({
    execGit: async (args) => {
      const key = args.join('|');
      if (!responses.has(key)) {
        throw new Error(`unexpected git call: ${key}`);
      }
      return responses.get(key);
    }
  });

  const result = await discovery.resolveAllowedPaths(['F:/input/repo']);
  assert.deepEqual(result.allowedPaths.sort(), ['f:/repo/main', 'f:/repo/wt-a']);
  assert.equal(result.errors.length, 0);
});

test('resolveAllowedPaths reports invalid tracked path errors explicitly', async () => {
  const discovery = createWorktreeDiscovery({
    execGit: async () => {
      throw new Error('not a git repository');
    }
  });

  const result = await discovery.resolveAllowedPaths(['F:/invalid']);
  assert.equal(result.allowedPaths.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /not a git repository/);
});
