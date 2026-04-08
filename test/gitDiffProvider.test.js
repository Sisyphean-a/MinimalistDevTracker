const test = require('node:test');
const assert = require('node:assert/strict');

const { createGitDiffProvider, parseNumStat } = require('../src/core/gitDiffProvider');

test('parseNumStat aggregates insertions/deletions by file type', () => {
  const output = [
    '10\t2\tsrc/app.js',
    '3\t1\tsrc/App.vue',
    '5\t0\tdocs/README.md',
    '-\t-\tassets/logo.png'
  ].join('\n');

  const result = parseNumStat(output);

  assert.equal(result.insertions, 18);
  assert.equal(result.deletions, 3);
  assert.deepEqual(result.byFileType, {
    js: { insertions: 10, deletions: 2 },
    vue: { insertions: 3, deletions: 1 },
    md: { insertions: 5, deletions: 0 },
    png: { insertions: 0, deletions: 0 }
  });
});

test('parseNumStat falls back to "other" when file has no extension', () => {
  const output = '2\t4\tDockerfile';
  const result = parseNumStat(output);

  assert.equal(result.insertions, 2);
  assert.equal(result.deletions, 4);
  assert.deepEqual(result.byFileType, {
    other: { insertions: 2, deletions: 4 }
  });
});

test('getCommitDiff runs git show --numstat for the target commit', async () => {
  const calls = [];
  const provider = createGitDiffProvider({}, {
    normalizer: { normalize: (value) => value.toLowerCase() },
    gitClient: {
      run: async (args) => {
        calls.push(args);
        return '6\t1\tsrc/app.js';
      }
    }
  });

  const result = await provider.getCommitDiff('F:/repo/main', 'abc123');

  assert.deepEqual(calls[0], ['-C', 'F:/repo/main', 'show', '--numstat', '--format=', 'abc123']);
  assert.equal(result.insertions, 6);
  assert.equal(result.deletions, 1);
  assert.deepEqual(result.byFileType, {
    js: { insertions: 6, deletions: 1 }
  });
});

test('getDiff merges tracked and untracked file stats into total', async () => {
  const calls = [];
  const provider = createGitDiffProvider({}, {
    normalizer: { normalize: (value) => value.toLowerCase() },
    gitClient: {
      run: async (args) => {
        calls.push(args);
        const command = args.join(' ');
        if (command.includes('diff HEAD --numstat')) {
          return '2\t1\tsrc/app.js';
        }
        if (command.includes('ls-files --others --exclude-standard -z')) {
          return 'newfile.ts\0README.local\0';
        }
        throw new Error(`unexpected git command: ${command}`);
      }
    },
    countFileLines: async (repoPath, relativePath) => {
      if (repoPath !== 'F:/repo/main') {
        throw new Error('unexpected repo path');
      }
      if (relativePath === 'newfile.ts') {
        return 5;
      }
      if (relativePath === 'README.local') {
        return 3;
      }
      throw new Error(`unexpected file path: ${relativePath}`);
    }
  });

  const result = await provider.getDiff('F:/repo/main');

  assert.deepEqual(calls[0], ['-C', 'F:/repo/main', 'diff', 'HEAD', '--numstat']);
  assert.deepEqual(calls[1], ['-C', 'F:/repo/main', 'ls-files', '--others', '--exclude-standard', '-z']);
  assert.equal(result.tracked.insertions, 2);
  assert.equal(result.tracked.deletions, 1);
  assert.equal(result.untracked.insertions, 8);
  assert.equal(result.untracked.deletions, 0);
  assert.equal(result.insertions, 10);
  assert.equal(result.deletions, 1);
  assert.deepEqual(result.byFileType, {
    js: { insertions: 2, deletions: 1 },
    ts: { insertions: 5, deletions: 0 },
    local: { insertions: 3, deletions: 0 }
  });
});

test('getDiff limits tracked and untracked stats to target files', async () => {
  const calls = [];
  const provider = createGitDiffProvider({}, {
    normalizer: { normalize: (value) => value.toLowerCase() },
    gitClient: {
      run: async (args) => {
        calls.push(args);
        if (args.includes('diff')) {
          return '2\t1\tsrc/app.js';
        }
        if (args.includes('ls-files')) {
          return 'src/app.js\0';
        }
        throw new Error(`unexpected git command: ${args.join(' ')}`);
      }
    },
    countFileLines: async () => 5
  });

  await provider.getDiff('F:/repo/main', { files: ['F:/repo/main/src/app.js'] });

  assert.deepEqual(calls[0], ['-C', 'F:/repo/main', 'diff', 'HEAD', '--numstat', '--', 'src/app.js']);
  assert.deepEqual(calls[1], ['-C', 'F:/repo/main', 'ls-files', '--others', '--exclude-standard', '-z', '--', 'src/app.js']);
});

test('getCommitDiff limits commit stats to target files', async () => {
  const calls = [];
  const provider = createGitDiffProvider({}, {
    normalizer: { normalize: (value) => value.toLowerCase() },
    gitClient: {
      run: async (args) => {
        calls.push(args);
        return '6\t1\tsrc/app.js';
      }
    }
  });

  await provider.getCommitDiff('F:/repo/main', 'abc123', {
    files: ['F:/repo/main/src/app.js']
  });

  assert.deepEqual(calls[0], ['-C', 'F:/repo/main', 'show', '--numstat', '--format=', 'abc123', '--', 'src/app.js']);
});
