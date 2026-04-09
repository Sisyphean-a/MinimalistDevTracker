const test = require('node:test');
const assert = require('node:assert/strict');

const { createStorageBootstrapper } = require('../src/core/extensionRuntime');
const { registerExtensionCommands } = require('../src/core/extensionCommands');

test('storage bootstrapper migrates legacy JSON before creating storage when import marker is missing', async () => {
  const actions = [];
  const storageInstance = { appendSession: async () => {} };
  const bootstrap = createStorageBootstrapper({
    storageRootPath: 'F:/tracker',
    legacyStoragePath: 'F:/legacy',
    readLegacyImportCompletedAt: async () => null,
    migrateLegacyStorageData: async (input) => {
      actions.push(['migrate', input]);
    },
    createStorage: (storageRootPath) => {
      actions.push(['createStorage', storageRootPath]);
      return storageInstance;
    }
  });

  const storage = await bootstrap();

  assert.equal(storage, storageInstance);
  assert.deepEqual(actions, [
    ['migrate', { sourceDir: 'F:/legacy', targetDir: 'F:/tracker' }],
    ['createStorage', 'F:/tracker']
  ]);
});

test('storage bootstrapper skips migration when import marker already exists', async () => {
  const actions = [];
  const bootstrap = createStorageBootstrapper({
    storageRootPath: 'F:/tracker',
    legacyStoragePath: 'F:/legacy',
    readLegacyImportCompletedAt: async () => '2026-04-09T08:00:00.000Z',
    migrateLegacyStorageData: async () => {
      actions.push('migrate');
    },
    createStorage: (storageRootPath) => {
      actions.push(['createStorage', storageRootPath]);
      return { storageRootPath };
    }
  });

  const storage = await bootstrap();

  assert.deepEqual(actions, [['createStorage', 'F:/tracker']]);
  assert.equal(storage.storageRootPath, 'F:/tracker');
});

test('storage bootstrapper retries legacy import when the database is empty but source JSON still exists', async () => {
  const actions = [];
  const bootstrap = createStorageBootstrapper({
    storageRootPath: 'F:/tracker',
    legacyStoragePath: 'F:/legacy',
    migrationSourceDirs: ['F:/tracker', 'F:/legacy', 'F:/tracker'],
    readStorageSnapshot: async () => ({
      legacyImportCompletedAt: '2026-04-09T08:28:48.000Z',
      sessionCount: 0
    }),
    migrateLegacyStorageData: async (input) => {
      actions.push(['migrate', input]);
    },
    createStorage: (storageRootPath) => {
      actions.push(['createStorage', storageRootPath]);
      return { storageRootPath };
    }
  });

  await bootstrap();

  assert.deepEqual(actions, [
    ['migrate', { sourceDir: 'F:/tracker', targetDir: 'F:/tracker' }],
    ['migrate', { sourceDir: 'F:/legacy', targetDir: 'F:/tracker' }],
    ['createStorage', 'F:/tracker']
  ]);
});

test('manual migration command reports imported and skipped session counts', async () => {
  const messages = [];
  const commands = {};
  const subscriptions = [];
  registerExtensionCommands({
    vscode: {
      commands: {
        registerCommand: (commandId, handler) => {
          commands[commandId] = handler;
          return { dispose: () => {} };
        }
      },
      window: {
        showInformationMessage: async (message) => {
          messages.push(message);
        }
      }
    },
    context: { subscriptions },
    reportCommandId: 'report',
    migrateCommandId: 'migrate',
    reportPanelController: {
      open: async () => {}
    },
    migrateLegacyStorageData: async () => ({
      importedSessions: 3,
      skippedSessions: 2,
      ignoredExistingSessions: 5
    }),
    storageRootPath: 'F:/tracker',
    legacyStoragePath: 'F:/legacy'
  });

  await commands.migrate();

  assert.equal(subscriptions.length, 2);
  assert.equal(messages[0], '迁移完成：导入 3 条会话，跳过 2 条无效会话，忽略 5 条已存在会话。');
});
