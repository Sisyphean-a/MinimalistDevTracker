const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveReportRepoPaths,
  projectHasLocActivity,
  filterDailyDataByRepoPaths
} = require('../src/core/reportScope');

test('resolveReportRepoPaths maps workspace folders to tracked repo roots', () => {
  const repoPaths = resolveReportRepoPaths([
    { uri: { fsPath: 'F:/repo/main/packages/app' } },
    { uri: { fsPath: 'F:/repo/other' } },
    { uri: { fsPath: 'F:/repo/main/tools' } }
  ], {
    resolveRepoPath: (inputPath) => {
      if (inputPath.startsWith('F:/repo/main')) {
        return 'f:/repo/main';
      }
      if (inputPath === 'F:/repo/other') {
        return 'f:/repo/other';
      }
      return null;
    }
  });

  assert.deepEqual(repoPaths, ['f:/repo/main', 'f:/repo/other']);
});

test('projectHasLocActivity excludes legacy zero-loc projects', () => {
  assert.equal(projectHasLocActivity({
    totalLocAdded: 0,
    totalLocDeleted: 0,
    sessions: [{ locAdded: 0, locDeleted: 0 }]
  }), false);
  assert.equal(projectHasLocActivity({
    totalLocAdded: 0,
    totalLocDeleted: 0,
    sessions: [{ locAdded: 2, locDeleted: 0 }]
  }), true);
});

test('filterDailyDataByRepoPaths keeps only target repos', () => {
  const filtered = filterDailyDataByRepoPaths({
    date: '2026-03-31',
    projects: {
      'f:/repo/main||main': { repoPath: 'f:/repo/main', totalLocAdded: 1, totalLocDeleted: 0, sessions: [] },
      'f:/repo/other||main': { repoPath: 'f:/repo/other', totalLocAdded: 2, totalLocDeleted: 0, sessions: [] }
    }
  }, ['f:/repo/main']);

  assert.deepEqual(Object.keys(filtered.projects), ['f:/repo/main||main']);
});
