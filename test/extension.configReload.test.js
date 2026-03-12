const test = require('node:test');
const assert = require('node:assert/strict');

const { createTrackedRuntimeReloader } = require('../src/core/extensionRuntime');

test('tracked runtime reloader rebuilds path registry and watcher from latest config', async () => {
  const actions = [];
  const nextRegistry = {
    getAllowedRoots: () => ['f:/repo/new']
  };
  const reloader = createTrackedRuntimeReloader({
    loadTrackedPaths: () => ['F:/repo/new'],
    loadExcludeGlobs: () => ['**/*.tmp'],
    buildPathRegistry: async (trackedPaths) => {
      actions.push(['buildPathRegistry', trackedPaths]);
      return nextRegistry;
    },
    runtimeTracker: {
      setPathRegistry: (value) => actions.push(['setPathRegistry', value])
    },
    fileActivityWatcher: {
      rebuild: (roots, excludeGlobs) => {
        actions.push(['rebuildWatcher', roots, excludeGlobs]);
      }
    }
  });

  await reloader();

  assert.deepEqual(actions[0], ['buildPathRegistry', ['F:/repo/new']]);
  assert.deepEqual(actions[1], ['setPathRegistry', nextRegistry]);
  assert.deepEqual(actions[2], ['rebuildWatcher', ['f:/repo/new'], ['**/*.tmp']]);
});

test('tracked runtime reloader throws explicit error when registry interface is invalid', async () => {
  const reloader = createTrackedRuntimeReloader({
    loadTrackedPaths: () => ['F:/repo/new'],
    loadExcludeGlobs: () => [],
    buildPathRegistry: async () => ({}),
    runtimeTracker: {
      setPathRegistry: () => {}
    },
    fileActivityWatcher: {
      rebuild: () => {}
    }
  });

  await assert.rejects(() => reloader(), /getAllowedRoots/);
});
