const test = require('node:test');
const assert = require('node:assert/strict');

const { createCommitWatcher } = require('../src/core/commitWatcher');

function createMockRepo(rootPath, commit) {
  const listeners = [];
  const state = {
    HEAD: { commit },
    onDidChange: (callback) => {
      listeners.push(callback);
      return { dispose: () => {} };
    }
  };

  return {
    rootUri: { fsPath: rootPath },
    state,
    emitChange: () => listeners.forEach((callback) => callback())
  };
}

test('triggers onCommit only when HEAD commit hash changes', () => {
  const commits = [];
  const watcher = createCommitWatcher({
    onCommit: (repoPath) => commits.push(repoPath)
  });

  const repo = createMockRepo('F:/repo/a', 'a1');
  watcher.trackRepository(repo);

  repo.state.HEAD.commit = 'a1';
  repo.emitChange();
  repo.state.HEAD.commit = 'a2';
  repo.emitChange();
  repo.state.HEAD.commit = 'a2';
  repo.emitChange();

  assert.deepEqual(commits, ['f:/repo/a']);
});

test('ignores repositories without root path or head', () => {
  const commits = [];
  const watcher = createCommitWatcher({
    onCommit: (repoPath) => commits.push(repoPath)
  });

  watcher.trackRepository({
    rootUri: null,
    state: { onDidChange: () => ({ dispose: () => {} }) }
  });

  assert.equal(commits.length, 0);
});

