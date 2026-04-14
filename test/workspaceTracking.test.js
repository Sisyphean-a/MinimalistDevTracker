const test = require('node:test');
const assert = require('node:assert/strict');

const {
  listWorkspaceFolderPaths,
  resolveWorkspaceAllowedPaths
} = require('../src/core/workspaceTracking');

test('listWorkspaceFolderPaths returns unique folder fsPaths in order', () => {
  const paths = listWorkspaceFolderPaths([
    { uri: { fsPath: 'F:/repo/main' } },
    { uri: { fsPath: 'F:/repo/main' } },
    { uri: { fsPath: 'F:/repo/other' } },
    { uri: { fsPath: '' } },
    {}
  ]);

  assert.deepEqual(paths, ['F:/repo/main', 'F:/repo/other']);
});

test('resolveWorkspaceAllowedPaths delegates workspace roots to discovery', async () => {
  const calls = [];
  const result = await resolveWorkspaceAllowedPaths([
    { uri: { fsPath: 'F:/repo/main/packages/app' } },
    { uri: { fsPath: 'F:/repo/other' } }
  ], {
    resolveAllowedPaths: async (inputPaths) => {
      calls.push(inputPaths);
      return {
        allowedPaths: ['f:/repo/main', 'f:/repo/other'],
        errors: []
      };
    }
  });

  assert.deepEqual(calls, [['F:/repo/main/packages/app', 'F:/repo/other']]);
  assert.deepEqual(result.allowedPaths, ['f:/repo/main', 'f:/repo/other']);
});
