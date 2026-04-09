const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { migrateLegacyStorageData } = require('../src/core/storageMigration');
const { openDatabase } = require('../src/core/sqliteDatabase');

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function countSessions(databasePath) {
  const database = await openDatabase(databasePath);
  const count = database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
  database.close();
  return count;
}

test('migrateLegacyStorageData imports legacy sessions into SQLite and marks completion', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-migrate-import-'));
  const sourceDir = path.join(root, 'source');
  const targetDir = path.join(root, 'target');
  await writeJson(path.join(sourceDir, '2026-04-01.json'), {
    date: '2026-04-01',
    projects: {
      'f:/repo/main||main': {
        repoPath: 'f:/repo/main',
        branch: 'main',
        sessions: [
          {
            startTime: Date.parse('2026-04-01T01:00:00.000Z'),
            endTime: Date.parse('2026-04-01T02:00:00.000Z'),
            durationMs: 3_600_000,
            locAdded: 4,
            locDeleted: 1,
            locByFileType: { js: { locAdded: 4, locDeleted: 1 } }
          }
        ]
      }
    }
  });

  const summary = await migrateLegacyStorageData({ sourceDir, targetDir });
  const databasePath = path.join(targetDir, 'storage.db');
  const database = await openDatabase(databasePath);

  assert.equal(summary.scannedFiles, 1);
  assert.equal(summary.importedSessions, 1);
  assert.equal(summary.ignoredExistingSessions, 0);
  assert.equal(summary.skippedSessions, 0);
  assert.deepEqual(summary.failedFiles, []);
  assert.equal(await countSessions(databasePath), 1);
  assert.match(database.getMeta('legacy_import_completed_at') ?? '', /\d{4}-\d{2}-\d{2}T/);

  database.close();
  await fs.rm(root, { recursive: true, force: true });
});

test('migrateLegacyStorageData is idempotent when rerun against the same legacy files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-migrate-idempotent-'));
  const storageDir = path.join(root, 'storage');
  await writeJson(path.join(storageDir, '2026-04-02.json'), {
    date: '2026-04-02',
    projects: {
      'f:/repo/main||main': {
        repoPath: 'f:/repo/main',
        branch: 'main',
        sessions: [
          {
            startTime: Date.parse('2026-04-02T01:00:00.000Z'),
            endTime: Date.parse('2026-04-02T02:00:00.000Z'),
            durationMs: 1_000,
            locAdded: 3,
            locDeleted: 1
          }
        ]
      }
    }
  });

  const first = await migrateLegacyStorageData({ sourceDir: storageDir, targetDir: storageDir });
  const second = await migrateLegacyStorageData({ sourceDir: storageDir, targetDir: storageDir });

  assert.equal(first.importedSessions, 1);
  assert.equal(second.importedSessions, 0);
  assert.equal(second.ignoredExistingSessions, 1);
  assert.equal(await countSessions(path.join(storageDir, 'storage.db')), 1);

  await fs.rm(root, { recursive: true, force: true });
});

test('migrateLegacyStorageData fails on invalid JSON without writing completion metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-migrate-invalid-'));
  const sourceDir = path.join(root, 'source');
  const targetDir = path.join(root, 'target');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, '2026-04-03.json'), '{ invalid json', 'utf8');

  await assert.rejects(() => migrateLegacyStorageData({ sourceDir, targetDir }), /JSON|Unexpected token|Expected property name/);

  const databasePath = path.join(targetDir, 'storage.db');
  const database = await openDatabase(databasePath);
  assert.equal(database.getMeta('legacy_import_completed_at'), null);
  database.close();

  await fs.rm(root, { recursive: true, force: true });
});

test('migrateLegacyStorageData skips malformed or zero-loc session rows and reports them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-migrate-skipped-'));
  const storageDir = path.join(root, 'storage');
  await writeJson(path.join(storageDir, '2026-04-04.json'), {
    date: '2026-04-04',
    projects: {
      'f:/repo/main||main': {
        repoPath: 'f:/repo/main',
        branch: 'main',
        sessions: [
          {
            startTime: Date.parse('2026-04-04T01:00:00.000Z'),
            endTime: Date.parse('2026-04-04T02:00:00.000Z'),
            durationMs: 1_000,
            locAdded: 0,
            locDeleted: 0
          },
          {
            endTime: Date.parse('2026-04-04T03:00:00.000Z'),
            durationMs: 1_000,
            locAdded: 3,
            locDeleted: 1
          },
          {
            startTime: Date.parse('2026-04-04T04:00:00.000Z'),
            endTime: Date.parse('2026-04-04T05:00:00.000Z'),
            durationMs: 1_000,
            locAdded: 5,
            locDeleted: 2
          }
        ]
      }
    }
  });

  const summary = await migrateLegacyStorageData({ sourceDir: storageDir, targetDir: storageDir });

  assert.equal(summary.importedSessions, 1);
  assert.equal(summary.skippedSessions, 2);
  assert.equal(await countSessions(path.join(storageDir, 'storage.db')), 1);

  await fs.rm(root, { recursive: true, force: true });
});

test('migrateLegacyStorageData treats a missing legacy source directory as an empty import', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-migrate-missing-source-'));
  const sourceDir = path.join(root, 'missing-source');
  const targetDir = path.join(root, 'target');

  const summary = await migrateLegacyStorageData({ sourceDir, targetDir });
  const databasePath = path.join(targetDir, 'storage.db');
  const database = await openDatabase(databasePath);

  assert.equal(summary.scannedFiles, 0);
  assert.equal(summary.importedSessions, 0);
  assert.equal(summary.skippedSessions, 0);
  assert.equal(summary.ignoredExistingSessions, 0);
  assert.deepEqual(summary.failedFiles, []);
  assert.equal(database.getMeta('legacy_import_completed_at') !== null, true);

  database.close();
  await fs.rm(root, { recursive: true, force: true });
});
