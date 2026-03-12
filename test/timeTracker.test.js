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
