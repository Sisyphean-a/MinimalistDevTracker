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
