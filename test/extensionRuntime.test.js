const test = require('node:test');
const assert = require('node:assert/strict');

const extensionRuntime = require('../src/core/extensionRuntime');

test('extension runtime exports only active runtime helpers', () => {
  assert.equal(typeof extensionRuntime.createTrackedRuntimeReloader, 'function');
  assert.equal(typeof extensionRuntime.createStorageBootstrapper, 'function');
  assert.equal(extensionRuntime.createOpenDailyReportHandler, undefined);
});
