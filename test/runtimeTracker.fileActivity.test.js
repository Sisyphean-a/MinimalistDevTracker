const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeTracker } = require('../src/core/runtimeTracker');

function createFakeDisposable() {
  return { dispose: () => {} };
}

function createRuntimeTrackerForFileActivity(input) {
  return createRuntimeTracker({
    pathRegistry: input.pathRegistry,
    activityTracker: input.activityTracker,
    gitDiffProvider: {
      bindRepository: () => {}
    },
    commitWatcher: {
      trackRepository: () => createFakeDisposable()
    },
    logError: input.logError
  });
}

test('recordPathActivity routes tracked file path to activity tracker', async () => {
  const calls = [];
  const tracker = createRuntimeTrackerForFileActivity({
    pathRegistry: {
      resolveRepoPath: () => 'f:/repo/main'
    },
    activityTracker: {
      recordActivity: async (repoPath) => calls.push(repoPath),
      handleCommit: () => Promise.resolve()
    },
    logError: () => {}
  });

  tracker.recordPathActivity('F:/repo/main/src/index.js');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['f:/repo/main']);
});

test('recordPathActivity uses latest registry after setPathRegistry', async () => {
  const calls = [];
  const tracker = createRuntimeTrackerForFileActivity({
    pathRegistry: {
      resolveRepoPath: () => null
    },
    activityTracker: {
      recordActivity: async (repoPath) => calls.push(repoPath),
      handleCommit: () => Promise.resolve()
    },
    logError: () => {}
  });

  tracker.recordPathActivity('F:/repo/new/src/index.js');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 0);

  tracker.setPathRegistry({
    isAllowed: () => true,
    resolveRepoPath: () => 'f:/repo/new'
  });
  tracker.recordPathActivity('F:/repo/new/src/index.js');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['f:/repo/new']);
});

test('recordPathActivity reports async errors through logError', async () => {
  const errors = [];
  const tracker = createRuntimeTrackerForFileActivity({
    pathRegistry: {
      resolveRepoPath: () => 'f:/repo/main'
    },
    activityTracker: {
      recordActivity: async () => {
        throw new Error('write failed');
      },
      handleCommit: () => Promise.resolve()
    },
    logError: (label, error) => errors.push({ label, error })
  });

  tracker.recordPathActivity('F:/repo/main/src/index.js');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(errors.length, 1);
  assert.equal(errors[0].label, 'recordPathActivity');
  assert.match(errors[0].error.message, /write failed/);
});
