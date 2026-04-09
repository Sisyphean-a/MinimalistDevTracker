const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openDatabase, SCHEMA_VERSION } = require('../src/core/sqliteDatabase');

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-sqlite-db-'));
  return {
    dir,
    dbPath: path.join(dir, 'storage.db')
  };
}

test('openDatabase initializes schema and default metadata', async () => {
  const { dir, dbPath } = await createTempDbPath();
  const database = await openDatabase(dbPath);

  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('meta', 'sessions') ORDER BY name")
    .all()
    .map((row) => row.name);
  const schemaVersion = database.getMeta('schema_version');

  assert.deepEqual(tables, ['meta', 'sessions']);
  assert.equal(schemaVersion, String(SCHEMA_VERSION));

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test('openDatabase reuses an existing database without changing schema metadata', async () => {
  const { dir, dbPath } = await createTempDbPath();
  const first = await openDatabase(dbPath);
  first.setMeta('custom-key', 'custom-value');
  first.close();

  const second = await openDatabase(dbPath);

  assert.equal(second.getMeta('schema_version'), String(SCHEMA_VERSION));
  assert.equal(second.getMeta('custom-key'), 'custom-value');

  second.close();
  await fs.rm(dir, { recursive: true, force: true });
});
