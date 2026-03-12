const test = require('node:test');
const assert = require('node:assert/strict');

const { createPathRegistry } = require('../src/core/pathRegistry');

test('isAllowed returns true when file path is under tracked root or worktree', () => {
  const registry = createPathRegistry([
    'F:/repo/root',
    'F:/repo/root-worktree'
  ]);

  assert.equal(registry.isAllowed('F:/repo/root/src/a.ts'), true);
  assert.equal(registry.isAllowed('F:/repo/root-worktree/lib/b.ts'), true);
  assert.equal(registry.isAllowed('F:/other/file.ts'), false);
});

test('resolveRepoPath picks the longest matching root', () => {
  const registry = createPathRegistry([
    'F:/repo',
    'F:/repo/worktrees/feature-a'
  ]);

  const resolved = registry.resolveRepoPath('F:/repo/worktrees/feature-a/src/index.ts');
  assert.equal(resolved, 'f:/repo/worktrees/feature-a');
});
