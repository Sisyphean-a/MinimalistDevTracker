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

test('appendSession splits same repository by branch', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-branch-'));
  const storage = createStorage(dir);

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2026-03-12T01:00:00.000Z'),
    endTime: Date.parse('2026-03-12T02:00:00.000Z'),
    durationMs: 3_600_000,
    locAdded: 7,
    locDeleted: 1
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'feature/a',
    startTime: Date.parse('2026-03-12T02:00:00.000Z'),
    endTime: Date.parse('2026-03-12T03:00:00.000Z'),
    durationMs: 1_800_000,
    locAdded: 3,
    locDeleted: 0
  });

  const latest = await storage.readLatestDaily();
  const keys = Object.keys(latest.projects).sort();
  assert.equal(keys.length, 2);
  assert.match(keys[0], /f:\/repo\/main\|\|feature\/a/);
  assert.match(keys[1], /f:\/repo\/main\|\|main/);

  const mainBranch = latest.projects[keys[1]];
  const featureBranch = latest.projects[keys[0]];
  assert.equal(mainBranch.branch, 'main');
  assert.equal(featureBranch.branch, 'feature/a');

  await fs.rm(dir, { recursive: true, force: true });
});

test('appendSession skips zero-loc session records', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-zero-loc-'));
  const storage = createStorage(dir);

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2026-03-12T01:00:00.000Z'),
    endTime: Date.parse('2026-03-12T01:05:00.000Z'),
    durationMs: 300_000,
    locAdded: 0,
    locDeleted: 0
  });

  const latest = await storage.readLatestDaily();
  assert.equal(latest, null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('readTrendData returns rolling 7/30 day metrics with zero-filled days', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-trend-'));
  const storage = createStorage(dir, {
    now: () => Date.parse('2026-03-31T10:00:00.000Z')
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-30T01:00:00.000Z'),
    endTime: Date.parse('2026-03-30T02:00:00.000Z'),
    durationMs: 3_600_000,
    locAdded: 12,
    locDeleted: 3,
    locByFileType: { js: { locAdded: 12, locDeleted: 3 } }
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-29T01:00:00.000Z'),
    endTime: Date.parse('2026-03-29T02:00:00.000Z'),
    durationMs: 1_800_000,
    locAdded: 4,
    locDeleted: 1,
    locByFileType: { ts: { locAdded: 4, locDeleted: 1 } }
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-15T01:00:00.000Z'),
    endTime: Date.parse('2026-03-15T02:00:00.000Z'),
    durationMs: 2_400_000,
    locAdded: 6,
    locDeleted: 2,
    locByFileType: { vue: { locAdded: 6, locDeleted: 2 } }
  });

  const trend = await storage.readTrendData([7, 30]);
  const sevenDays = trend.windows['7'];
  const thirtyDays = trend.windows['30'];

  assert.equal(sevenDays.days.length, 7);
  assert.equal(sevenDays.totals.totalActiveTimeMs, 5_400_000);
  assert.equal(sevenDays.totals.totalLocAdded, 16);
  assert.equal(sevenDays.totals.totalLocDeleted, 4);
  assert.equal(sevenDays.days[6].date, '2026-03-31');
  assert.equal(sevenDays.days[6].totalLoc, 0);

  assert.equal(thirtyDays.days.length, 30);
  assert.equal(thirtyDays.totals.totalLocAdded, 22);
  assert.equal(thirtyDays.totals.totalLocDeleted, 6);
  assert.equal(thirtyDays.fileTypeChanges[0].fileType, 'js');

  await fs.rm(dir, { recursive: true, force: true });
});

test('readTrendData computes file type share delta versus previous window', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-trend-share-'));
  const storage = createStorage(dir, {
    now: () => Date.parse('2026-03-31T10:00:00.000Z')
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-30T01:00:00.000Z'),
    endTime: Date.parse('2026-03-30T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 8,
    locDeleted: 2,
    locByFileType: { js: { locAdded: 8, locDeleted: 2 } }
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    startTime: Date.parse('2026-03-24T01:00:00.000Z'),
    endTime: Date.parse('2026-03-24T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 2,
    locDeleted: 8,
    locByFileType: { py: { locAdded: 2, locDeleted: 8 } }
  });

  const trend = await storage.readTrendData([7]);
  const changes = trend.windows['7'].fileTypeChanges;
  const js = changes.find((item) => item.fileType === 'js');
  const py = changes.find((item) => item.fileType === 'py');

  assert.equal(js.currentTotalLoc, 10);
  assert.equal(js.previousTotalLoc, 0);
  assert.equal(js.deltaShare, 1);
  assert.equal(py.currentTotalLoc, 0);
  assert.equal(py.previousTotalLoc, 10);
  assert.equal(py.deltaShare, -1);

  await fs.rm(dir, { recursive: true, force: true });
});
