const test = require('node:test');
const assert = require('node:assert/strict');

const { createFileActivityWatcher } = require('../src/core/fileActivityWatcher');

function createMockWatcher(pattern) {
  const listeners = {
    create: [],
    change: [],
    delete: []
  };
  let disposed = false;

  function on(eventName, callback) {
    listeners[eventName].push(callback);
    return { dispose: () => {} };
  }

  function emit(eventName, fsPath) {
    listeners[eventName].forEach((callback) => callback({ fsPath }));
  }

  return {
    pattern,
    onDidCreate: (callback) => on('create', callback),
    onDidChange: (callback) => on('change', callback),
    onDidDelete: (callback) => on('delete', callback),
    emitCreate: (fsPath) => emit('create', fsPath),
    emitChange: (fsPath) => emit('change', fsPath),
    emitDelete: (fsPath) => emit('delete', fsPath),
    dispose: () => {
      disposed = true;
    },
    isDisposed: () => disposed
  };
}

function createMockVscode() {
  const createdWatchers = [];

  class RelativePattern {
    constructor(baseUri, pattern) {
      this.baseUri = baseUri;
      this.pattern = pattern;
    }
  }

  return {
    Uri: {
      file: (fsPath) => ({ fsPath })
    },
    RelativePattern,
    workspace: {
      createFileSystemWatcher: (pattern) => {
        const watcher = createMockWatcher(pattern);
        createdWatchers.push(watcher);
        return watcher;
      }
    },
    __watchers: createdWatchers
  };
}

test('forwards file events and filters .git + exclude globs', async () => {
  const vscode = createMockVscode();
  const activities = [];
  createFileActivityWatcher({
    vscode,
    roots: ['F:/repo/main'],
    excludeGlobs: ['**/*.tmp'],
    onFileActivity: (fsPath) => activities.push(fsPath),
    logError: () => {}
  });

  const watcher = vscode.__watchers[0];
  watcher.emitChange('F:/repo/main/src/index.js');
  watcher.emitCreate('F:/repo/main/.git/index');
  watcher.emitDelete('F:/repo/main/cache/result.tmp');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(activities, ['F:/repo/main/src/index.js']);
});

test('rebuild disposes previous watcher set and registers new roots', () => {
  const vscode = createMockVscode();
  const watcherController = createFileActivityWatcher({
    vscode,
    roots: ['F:/repo/a'],
    excludeGlobs: [],
    onFileActivity: () => {},
    logError: () => {}
  });

  const firstWatcher = vscode.__watchers[0];
  watcherController.rebuild(['F:/repo/b'], ['**/*.log']);
  const secondWatcher = vscode.__watchers[1];

  assert.equal(firstWatcher.isDisposed(), true);
  assert.equal(secondWatcher.isDisposed(), false);
  assert.equal(secondWatcher.pattern.baseUri.fsPath, 'F:/repo/b');
});

test('logs async callback failures without swallowing them silently', async () => {
  const vscode = createMockVscode();
  const errors = [];
  createFileActivityWatcher({
    vscode,
    roots: ['F:/repo/main'],
    excludeGlobs: [],
    onFileActivity: async () => {
      throw new Error('activity boom');
    },
    logError: (label, error) => errors.push({ label, error })
  });

  vscode.__watchers[0].emitChange('F:/repo/main/src/index.js');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(errors.length, 1);
  assert.equal(errors[0].label, 'fileActivity');
  assert.match(errors[0].error.message, /activity boom/);
});
