const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeTracker } = require('../src/core/runtimeTracker');

function createFakeDisposable() {
  return { dispose: () => {} };
}

test('registerRepository pushes disposable via injected subscriptions', () => {
  const subscriptions = [];
  const tracker = createRuntimeTracker({
    pathRegistry: {
      isAllowed: () => true,
      resolveRepoPath: () => 'f:/repo/main'
    },
    activityTracker: {
      recordActivity: () => Promise.resolve(),
      handleCommit: () => Promise.resolve()
    },
    gitDiffProvider: {
      bindRepository: () => {}
    },
    commitWatcher: {
      trackRepository: () => createFakeDisposable()
    },
    logError: () => {}
  });

  tracker.registerRepository({
    repo: { rootUri: { fsPath: 'F:/repo/main' } },
    subscriptions
  });

  assert.equal(subscriptions.length, 1);
  assert.equal(typeof subscriptions[0].dispose, 'function');
});

test('recordEditorActivity catches rejected promises and reports error', async () => {
  const errors = [];
  const tracker = createRuntimeTracker({
    pathRegistry: {
      isAllowed: () => true,
      resolveRepoPath: () => 'f:/repo/main'
    },
    activityTracker: {
      recordActivity: async () => {
        throw new Error('boom');
      },
      handleCommit: () => Promise.resolve()
    },
    gitDiffProvider: {
      bindRepository: () => {}
    },
    commitWatcher: {
      trackRepository: () => createFakeDisposable()
    },
    logError: (label, error) => errors.push({ label, error })
  });

  tracker.recordEditorActivity({ uri: { scheme: 'file', fsPath: 'F:/repo/main/a.js' } });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(errors.length, 1);
  assert.equal(errors[0].label, 'recordActivity');
  assert.match(errors[0].error.message, /boom/);
});

test('handleCommit loads commit diff and forwards to activity tracker', async () => {
  const calls = [];
  const tracker = createRuntimeTracker({
    pathRegistry: {
      isAllowed: () => true,
      resolveRepoPath: () => 'f:/repo/main'
    },
    activityTracker: {
      recordActivity: () => Promise.resolve(),
      handleCommit: async (repoPath, commitDiff) => {
        calls.push({ repoPath, commitDiff });
      }
    },
    gitDiffProvider: {
      bindRepository: () => {},
      getCommitDiff: async () => ({
        insertions: 10,
        deletions: 2,
        byFileType: { js: { insertions: 10, deletions: 2 } }
      })
    },
    commitWatcher: {
      trackRepository: () => createFakeDisposable()
    },
    logError: () => {}
  });

  tracker.handleCommit('f:/repo/main', 'abc123');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].repoPath, 'f:/repo/main');
  assert.equal(calls[0].commitDiff.insertions, 10);
  assert.equal(calls[0].commitDiff.deletions, 2);
});
