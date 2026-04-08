const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { migrateLegacyStorageData } = require('../src/core/storageMigration');

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

test('migrateLegacyStorageData copies daily files and skips existing target files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-migrate-'));
  const sourceDir = path.join(root, 'source');
  const targetDir = path.join(root, 'target');
  await writeJson(path.join(sourceDir, '2026-04-01.json'), {
    date: '2026-04-01',
    projects: { 'f:/repo/main': { totalLocAdded: 1 } }
  });
  await writeJson(path.join(sourceDir, '2026-04-02.json'), {
    date: '2026-04-02',
    projects: { 'f:/repo/main': { totalLocAdded: 2 } }
  });
  await writeJson(path.join(targetDir, '2026-04-02.json'), {
    date: '2026-04-02',
    projects: { 'f:/repo/main': { totalLocAdded: 99 } }
  });

  const summary = await migrateLegacyStorageData({ sourceDir, targetDir });
  const copiedFile = JSON.parse(await fs.readFile(path.join(targetDir, '2026-04-01.json'), 'utf8'));
  const keptFile = JSON.parse(await fs.readFile(path.join(targetDir, '2026-04-02.json'), 'utf8'));

  assert.equal(summary.copiedFiles, 1);
  assert.equal(summary.skippedFiles, 1);
  assert.equal(copiedFile.projects['f:/repo/main'].totalLocAdded, 1);
  assert.equal(keptFile.projects['f:/repo/main'].totalLocAdded, 99);

  await fs.rm(root, { recursive: true, force: true });
});

test('migrateLegacyStorageData deletes target trend index for rebuild after copy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-migrate-trend-'));
  const sourceDir = path.join(root, 'source');
  const targetDir = path.join(root, 'target');
  await writeJson(path.join(sourceDir, '2026-04-01.json'), { date: '2026-04-01', projects: {} });
  await writeJson(path.join(targetDir, 'trend-index.json'), { version: 1, byDate: { '2026-04-01': {} } });

  await migrateLegacyStorageData({ sourceDir, targetDir });
  await assert.rejects(() => fs.readFile(path.join(targetDir, 'trend-index.json'), 'utf8'), /ENOENT/);

  await fs.rm(root, { recursive: true, force: true });
});

test('migrateLegacyStorageData throws when source and target are the same directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-migrate-same-'));

  await assert.rejects(() => migrateLegacyStorageData({
    sourceDir: root,
    targetDir: root
  }), /cannot be the same/);

  await fs.rm(root, { recursive: true, force: true });
});

