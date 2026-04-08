const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveStorageRootPath } = require('../src/core/storagePathResolver');

test('resolveStorageRootPath uses shared absolute path when configured', () => {
  const output = resolveStorageRootPath({
    sharedStoragePath: 'F:/Common/MinimalTrackerData',
    defaultStoragePath: 'F:/Users/me/AppData/Roaming/Code/default'
  });

  assert.equal(output, 'F:/Common/MinimalTrackerData');
});

test('resolveStorageRootPath falls back to default path when config is empty', () => {
  const output = resolveStorageRootPath({
    sharedStoragePath: '   ',
    defaultStoragePath: 'F:/Users/me/AppData/Roaming/Code/default',
    defaultSharedStoragePath: 'F:/Users/me/.minimalist-dev-tracker'
  });

  assert.equal(output, 'F:/Users/me/.minimalist-dev-tracker');
});

test('resolveStorageRootPath falls back to default IDE path when default shared path is missing', () => {
  const output = resolveStorageRootPath({
    sharedStoragePath: '',
    defaultStoragePath: 'F:/Users/me/AppData/Roaming/Code/default'
  });

  assert.equal(output, 'F:/Users/me/AppData/Roaming/Code/default');
});

test('resolveStorageRootPath throws explicit error for relative shared path', () => {
  assert.throws(() => resolveStorageRootPath({
    sharedStoragePath: './tracker-data',
    defaultStoragePath: 'F:/Users/me/AppData/Roaming/Code/default'
  }), /must be an absolute path/);
});
