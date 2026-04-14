const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHourlyBuckets,
  collectSessions,
  sortSessionsByEndTime
} = require('../src/ui/reportViewModel');

function createProject(overrides = {}) {
  return {
    repoPath: 'f:/repo/main',
    branch: 'main',
    totalActiveTimeMs: 7_200_000,
    totalLocAdded: 20,
    totalLocDeleted: 5,
    locByFileType: {},
    sessions: [],
    ...overrides
  };
}

test('collectSessions flattens project sessions without changing source order', () => {
  const sessions = collectSessions([
    createProject({
      repoPath: 'f:/repo/main',
      sessions: [
        { startTime: 10, endTime: 20, durationMs: 10, locAdded: 1, locDeleted: 0 },
        { startTime: 30, endTime: 40, durationMs: 10, locAdded: 2, locDeleted: 0 }
      ]
    }),
    createProject({
      repoPath: 'f:/repo/other',
      branch: 'feature/demo',
      sessions: [
        { startTime: 50, endTime: 60, durationMs: 10, locAdded: 3, locDeleted: 1 }
      ]
    })
  ]);

  assert.deepEqual(
    sessions.map((session) => ({
      repoPath: session.repoPath,
      branch: session.branch,
      endTime: session.endTime
    })),
    [
      { repoPath: 'f:/repo/main', branch: 'main', endTime: 20 },
      { repoPath: 'f:/repo/main', branch: 'main', endTime: 40 },
      { repoPath: 'f:/repo/other', branch: 'feature/demo', endTime: 60 }
    ]
  );
});

test('sortSessionsByEndTime returns a sorted copy and keeps input untouched', () => {
  const source = [
    { repoPath: 'f:/repo/main', endTime: 20 },
    { repoPath: 'f:/repo/main', endTime: 60 },
    { repoPath: 'f:/repo/main', endTime: 40 }
  ];

  const sorted = sortSessionsByEndTime(source);

  assert.deepEqual(sorted.map((session) => session.endTime), [60, 40, 20]);
  assert.deepEqual(source.map((session) => session.endTime), [20, 60, 40]);
});

test('buildHourlyBuckets consumes flattened sessions and allocates active time by overlap', () => {
  const buckets = buildHourlyBuckets([
    {
      repoPath: 'f:/repo/main',
      branch: 'main',
      startTime: Date.parse('2026-04-08T01:30:00.000Z'),
      endTime: Date.parse('2026-04-08T03:00:00.000Z'),
      durationMs: 3_600_000,
      locAdded: 2,
      locDeleted: 1
    }
  ], '2026-04-08', '2026-04-08');

  assert.equal(buckets.length, 24);
  assert.deepEqual(
    buckets
      .map((bucket) => bucket.totalActiveTimeMs)
      .filter((durationMs) => durationMs > 0),
    [1_200_000, 2_400_000]
  );
});
