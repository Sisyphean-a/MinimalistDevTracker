const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createStorage } = require('../src/core/storage');

test('appendSession aggregates data and readLatestDaily returns newest file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-'));
  const storage = createStorage(dir);

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-12T01:00:00.000Z'),
    endTime: Date.parse('2026-03-12T02:00:00.000Z'),
    durationMs: 3_600_000,
    locAdded: 10,
    locDeleted: 2
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-13T01:00:00.000Z'),
    endTime: Date.parse('2026-03-13T02:00:00.000Z'),
    durationMs: 3_600_000,
    locAdded: 5,
    locDeleted: 1
  });

  const latest = await storage.readLatestDaily();
  assert.equal(latest.date, '2026-03-13');
  assert.equal(latest.projects['f:/repo/main'].totalLocAdded, 5);

  await fs.rm(dir, { recursive: true, force: true });
});

test('appendSession keeps all sessions when writing concurrently to same day file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-concurrency-'));
  const storage = createStorage(dir);
  const sessionCount = 12;

  await Promise.all(
    Array.from({ length: sessionCount }).map((_, index) => {
      return storage.appendSession({
        repoPath: 'f:/repo/main',
        startTime: Date.parse('2026-03-14T01:00:00.000Z') + index,
        endTime: Date.parse('2026-03-14T02:00:00.000Z') + index,
        durationMs: 1_000,
        locAdded: 2,
        locDeleted: 1
      });
    })
  );

  const latest = await storage.readLatestDaily();
  const project = latest.projects['f:/repo/main'];
  assert.equal(project.sessions.length, sessionCount);
  assert.equal(project.totalActiveTimeMs, sessionCount * 1_000);
  assert.equal(project.totalLocAdded, sessionCount * 2);
  assert.equal(project.totalLocDeleted, sessionCount * 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('appendSession aggregates locByFileType and keeps project totals', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-by-type-'));
  const storage = createStorage(dir);

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-12T01:00:00.000Z'),
    endTime: Date.parse('2026-03-12T02:00:00.000Z'),
    durationMs: 3_600_000,
    locAdded: 7,
    locDeleted: 3,
    locByFileType: {
      js: { locAdded: 5, locDeleted: 2 },
      vue: { locAdded: 2, locDeleted: 1 }
    }
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-12T02:00:00.000Z'),
    endTime: Date.parse('2026-03-12T03:00:00.000Z'),
    durationMs: 3_600_000,
    locAdded: 4,
    locDeleted: 2,
    locByFileType: {
      js: { locAdded: 1, locDeleted: 1 },
      ts: { locAdded: 3, locDeleted: 1 }
    }
  });

  const latest = await storage.readLatestDaily();
  const project = latest.projects['f:/repo/main'];
  assert.equal(project.totalLocAdded, 11);
  assert.equal(project.totalLocDeleted, 5);
  assert.deepEqual(project.locByFileType, {
    js: { locAdded: 6, locDeleted: 3 },
    vue: { locAdded: 2, locDeleted: 1 },
    ts: { locAdded: 3, locDeleted: 1 }
  });

  await fs.rm(dir, { recursive: true, force: true });
});
