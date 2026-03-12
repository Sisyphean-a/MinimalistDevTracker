const test = require('node:test');
const assert = require('node:assert/strict');

const { createTimeTracker } = require('../src/core/timeTracker');

const DIFF_ZERO = Object.freeze({ insertions: 0, deletions: 0 });

function createClock(start) {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    }
  };
}

test('maintains independent state per repository path', async () => {
  const clock = createClock(1_000);
  const sessionLogs = [];
  const tracker = createTimeTracker({
    debounceMs: 120_000,
    now: clock.now,
    getDiff: () => DIFF_ZERO,
    onSessionFinalized: (session) => sessionLogs.push(session)
  });

  await tracker.recordActivity('F:/repo-a');
  clock.advance(1_000);
  await tracker.recordActivity('F:/repo-b');
  clock.advance(121_000);
  await tracker.flushAll();

  assert.equal(sessionLogs.length, 2);
  assert.deepEqual(sessionLogs.map((s) => s.repoPath).sort(), ['F:/repo-a', 'F:/repo-b']);
});

test('calculates session loc by insertions/deletions diff independently', async () => {
  const clock = createClock(1_000);
  const sessionLogs = [];
  const snapshots = [
    { insertions: 10, deletions: 5 },
    { insertions: 18, deletions: 9 }
  ];

  const tracker = createTimeTracker({
    debounceMs: 120_000,
    now: clock.now,
    getDiff: () => snapshots.shift(),
    onSessionFinalized: (session) => sessionLogs.push(session)
  });

  await tracker.recordActivity('F:/repo-a');
  clock.advance(130_000);
  await tracker.flushAll();

  assert.equal(sessionLogs.length, 1);
  assert.equal(sessionLogs[0].locAdded, 8);
  assert.equal(sessionLogs[0].locDeleted, 4);
});

test('force flush finalizes active session immediately', async () => {
  const clock = createClock(1_000);
  const sessionLogs = [];
  const tracker = createTimeTracker({
    debounceMs: 120_000,
    now: clock.now,
    getDiff: () => DIFF_ZERO,
    onSessionFinalized: (session) => sessionLogs.push(session)
  });

  await tracker.recordActivity('F:/repo-a');
  clock.advance(10_000);
  await tracker.flushAll();

  assert.equal(sessionLogs.length, 1);
  assert.equal(sessionLogs[0].durationMs, 10_000);
});

test('commit event finalizes current chunk and keeps tracking active', async () => {
  const clock = createClock(1_000);
  const sessionLogs = [];
  const snapshots = [
    { insertions: 5, deletions: 1 },
    { insertions: 8, deletions: 3 },
    { insertions: 0, deletions: 0 },
    { insertions: 2, deletions: 1 }
  ];

  const tracker = createTimeTracker({
    debounceMs: 120_000,
    now: clock.now,
    getDiff: () => snapshots.shift(),
    onSessionFinalized: (session) => sessionLogs.push(session)
  });

  await tracker.recordActivity('F:/repo-a');
  clock.advance(5_000);
  await tracker.handleCommit('F:/repo-a');
  clock.advance(2_000);
  await tracker.flushAll();

  assert.equal(sessionLogs.length, 2);
  assert.equal(sessionLogs[0].locAdded, 3);
  assert.equal(sessionLogs[0].locDeleted, 2);
  assert.equal(sessionLogs[1].locAdded, 2);
  assert.equal(sessionLogs[1].locDeleted, 1);
});

test('never outputs negative loc when working-tree diff shrinks during a session', async () => {
  const clock = createClock(1_000);
  const sessionLogs = [];
  const snapshots = [
    { insertions: 227, deletions: 2 },
    { insertions: 0, deletions: 0 }
  ];
  const tracker = createTimeTracker({
    debounceMs: 120_000,
    now: clock.now,
    getDiff: () => snapshots.shift(),
    onSessionFinalized: (session) => sessionLogs.push(session)
  });

  await tracker.recordActivity('F:/repo-a');
  clock.advance(10_000);
  await tracker.flushAll();

  assert.equal(sessionLogs.length, 1);
  assert.equal(sessionLogs[0].locAdded, 0);
  assert.equal(sessionLogs[0].locDeleted, 0);
});

test('tracks loc by file type and keeps totals equal to per-type sum', async () => {
  const clock = createClock(1_000);
  const sessionLogs = [];
  const snapshots = [
    {
      insertions: 10,
      deletions: 1,
      byFileType: {
        js: { insertions: 8, deletions: 1 },
        vue: { insertions: 2, deletions: 0 }
      }
    },
    {
      insertions: 15,
      deletions: 4,
      byFileType: {
        js: { insertions: 9, deletions: 2 },
        vue: { insertions: 4, deletions: 2 },
        ts: { insertions: 2, deletions: 0 }
      }
    }
  ];
  const tracker = createTimeTracker({
    debounceMs: 120_000,
    now: clock.now,
    getDiff: () => snapshots.shift(),
    onSessionFinalized: (session) => sessionLogs.push(session)
  });

  await tracker.recordActivity('F:/repo-a');
  clock.advance(10_000);
  await tracker.flushAll();

  assert.equal(sessionLogs.length, 1);
  assert.deepEqual(sessionLogs[0].locByFileType, {
    js: { locAdded: 1, locDeleted: 1 },
    vue: { locAdded: 2, locDeleted: 2 },
    ts: { locAdded: 2, locDeleted: 0 }
  });
  assert.equal(sessionLogs[0].locAdded, 5);
  assert.equal(sessionLogs[0].locDeleted, 3);
});

test('commit compensation counts quick commit output when working-tree diff resets', async () => {
  const clock = createClock(1_000);
  const sessionLogs = [];
  const snapshots = [
    { insertions: 0, deletions: 0, byFileType: {} },
    { insertions: 0, deletions: 0, byFileType: {} },
    { insertions: 0, deletions: 0, byFileType: {} }
  ];
  const tracker = createTimeTracker({
    debounceMs: 120_000,
    now: clock.now,
    getDiff: () => snapshots.shift(),
    onSessionFinalized: (session) => sessionLogs.push(session)
  });

  await tracker.recordActivity('F:/repo-a');
  clock.advance(3_000);
  await tracker.handleCommit('F:/repo-a', {
    insertions: 12,
    deletions: 4,
    byFileType: {
      js: { insertions: 8, deletions: 2 },
      vue: { insertions: 4, deletions: 2 }
    }
  });

  assert.equal(sessionLogs.length, 1);
  assert.equal(sessionLogs[0].locAdded, 12);
  assert.equal(sessionLogs[0].locDeleted, 4);
  assert.deepEqual(sessionLogs[0].locByFileType, {
    js: { locAdded: 8, locDeleted: 2 },
    vue: { locAdded: 4, locDeleted: 2 }
  });
  await tracker.flushAll();
});

test('commit compensation does not overcount pre-session carryover', async () => {
  const clock = createClock(1_000);
  const sessionLogs = [];
  const snapshots = [
    {
      insertions: 20,
      deletions: 5,
      byFileType: { js: { insertions: 20, deletions: 5 } }
    },
    {
      insertions: 10,
      deletions: 2,
      byFileType: { js: { insertions: 10, deletions: 2 } }
    },
    {
      insertions: 0,
      deletions: 0,
      byFileType: {}
    }
  ];
  const tracker = createTimeTracker({
    debounceMs: 120_000,
    now: clock.now,
    getDiff: () => snapshots.shift(),
    onSessionFinalized: (session) => sessionLogs.push(session)
  });

  await tracker.recordActivity('F:/repo-a');
  clock.advance(2_000);
  await tracker.handleCommit('F:/repo-a', {
    insertions: 10,
    deletions: 3,
    byFileType: { js: { insertions: 10, deletions: 3 } }
  });

  assert.equal(sessionLogs.length, 1);
  assert.equal(sessionLogs[0].locAdded, 0);
  assert.equal(sessionLogs[0].locDeleted, 0);
  assert.deepEqual(sessionLogs[0].locByFileType, {});
  await tracker.flushAll();
});
