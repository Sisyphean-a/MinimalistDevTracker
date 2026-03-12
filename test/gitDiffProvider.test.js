const test = require('node:test');
const assert = require('node:assert/strict');

const { parseNumStat } = require('../src/core/gitDiffProvider');

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
