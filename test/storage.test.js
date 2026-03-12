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
