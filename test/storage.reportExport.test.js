const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createStorage } = require('../src/core/storage');

test('readReportData supports extended preset ranges including all', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-report-extended-'));
  const storage = createStorage(dir, {
    now: () => Date.parse('2026-04-09T10:00:00.000Z')
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2025-05-01T01:00:00.000Z'),
    endTime: Date.parse('2025-05-01T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 2,
    locDeleted: 1
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2026-02-01T01:00:00.000Z'),
    endTime: Date.parse('2026-02-01T02:00:00.000Z'),
    durationMs: 2_000,
    locAdded: 4,
    locDeleted: 0
  });

  const ninetyDays = await storage.readReportData({ periodType: 'rolling90' });
  const halfYear = await storage.readReportData({ periodType: 'rolling180' });
  const year = await storage.readReportData({ periodType: 'rolling365' });
  const all = await storage.readReportData({ periodType: 'all' });

  assert.equal(ninetyDays.periodType, 'rolling90');
  assert.equal(ninetyDays.periodLabel, '最近3个月');
  assert.equal(ninetyDays.dateRangeStart, '2026-01-10');
  assert.equal(ninetyDays.totalLocAdded, 4);
  assert.equal(halfYear.periodType, 'rolling180');
  assert.equal(halfYear.periodLabel, '最近半年');
  assert.equal(halfYear.totalLocAdded, 4);
  assert.equal(year.periodType, 'rolling365');
  assert.equal(year.periodLabel, '最近1年');
  assert.equal(year.totalLocAdded, 6);
  assert.equal(all.periodType, 'all');
  assert.equal(all.periodLabel, '全部');
  assert.equal(all.dateRangeStart, '2025-05-01');
  assert.equal(all.totalLocAdded, 6);
  assert.equal(all.totalLocDeleted, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('readReportData supports explicit date range and branch filters', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-report-filtered-export-'));
  const storage = createStorage(dir, {
    now: () => Date.parse('2026-04-09T10:00:00.000Z')
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2026-04-02T01:00:00.000Z'),
    endTime: Date.parse('2026-04-02T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 3,
    locDeleted: 1
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'feature/a',
    startTime: Date.parse('2026-04-03T01:00:00.000Z'),
    endTime: Date.parse('2026-04-03T02:00:00.000Z'),
    durationMs: 2_000,
    locAdded: 7,
    locDeleted: 2
  });

  const report = await storage.readReportData({
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    repoPaths: ['f:/repo/main'],
    branch: 'feature/a'
  });

  assert.equal(report.dateRangeStart, '2026-04-01');
  assert.equal(report.dateRangeEnd, '2026-04-03');
  assert.equal(report.days.length, 3);
  assert.deepEqual(Object.keys(report.projects), ['f:/repo/main||feature/a']);
  assert.equal(report.totalLocAdded, 7);
  assert.equal(report.totalLocDeleted, 2);
  assert.equal(report.days[0].date, '2026-04-01');
  assert.equal(report.days[2].date, '2026-04-03');

  await fs.rm(dir, { recursive: true, force: true });
});

test('readReportData keeps tracked and untracked totals on each exported day', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-report-day-splits-'));
  const storage = createStorage(dir, {
    now: () => Date.parse('2026-04-09T10:00:00.000Z')
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2026-04-02T01:00:00.000Z'),
    endTime: Date.parse('2026-04-02T02:00:00.000Z'),
    durationMs: 1_000,
    trackedLocAdded: 3,
    trackedLocDeleted: 1,
    untrackedLocAdded: 2,
    untrackedLocDeleted: 0,
    locAdded: 5,
    locDeleted: 1
  });

  const report = await storage.readReportData({
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    repoPaths: ['f:/repo/main']
  });

  assert.equal(report.days[1].date, '2026-04-02');
  assert.equal(report.days[1].trackedLocAdded, 3);
  assert.equal(report.days[1].trackedLocDeleted, 1);
  assert.equal(report.days[1].untrackedLocAdded, 2);
  assert.equal(report.days[1].untrackedLocDeleted, 0);
  assert.equal(report.days[1].totalLocAdded, 5);
  assert.equal(report.days[1].totalLocDeleted, 1);
  assert.equal(report.days[1].totalLoc, 6);

  await fs.rm(dir, { recursive: true, force: true });
});

test('readReportData filters by custom project-branch pairs without cross-branch contamination', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-report-custom-project-branch-'));
  const storage = createStorage(dir, {
    now: () => Date.parse('2026-04-09T10:00:00.000Z')
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2026-04-02T01:00:00.000Z'),
    endTime: Date.parse('2026-04-02T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 3,
    locDeleted: 1
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'feature/a',
    startTime: Date.parse('2026-04-03T01:00:00.000Z'),
    endTime: Date.parse('2026-04-03T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 4,
    locDeleted: 1
  });
  await storage.appendSession({
    repoPath: 'f:/repo/other',
    branch: 'main',
    startTime: Date.parse('2026-04-04T01:00:00.000Z'),
    endTime: Date.parse('2026-04-04T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 5,
    locDeleted: 1
  });

  const report = await storage.readReportData({
    startDate: '2026-04-01',
    endDate: '2026-04-05',
    projectBranches: [
      { repoPath: 'f:/repo/main', branch: 'main' },
      { repoPath: 'f:/repo/other', branch: 'main' }
    ]
  });

  const projectKeys = Object.keys(report.projects).sort();
  assert.deepEqual(projectKeys, ['f:/repo/main||main', 'f:/repo/other||main']);
  assert.equal(report.totalLocAdded, 8);
  assert.equal(report.totalLocDeleted, 2);

  await fs.rm(dir, { recursive: true, force: true });
});
