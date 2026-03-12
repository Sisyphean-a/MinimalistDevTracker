const test = require('node:test');
const assert = require('node:assert/strict');

const { createOpenDailyReportHandler } = require('../src/core/extensionRuntime');

test('open report handler flushes tracker before rendering when enabled', async () => {
  const steps = [];
  const handler = createOpenDailyReportHandler({
    shouldFlushBeforeReport: () => true,
    tracker: {
      flushAll: async () => {
        steps.push('flush');
      }
    },
    showDailyReport: async () => {
      steps.push('show');
    }
  });

  await handler();

  assert.deepEqual(steps, ['flush', 'show']);
});

test('open report handler skips flush when feature is disabled', async () => {
  const steps = [];
  const handler = createOpenDailyReportHandler({
    shouldFlushBeforeReport: () => false,
    tracker: {
      flushAll: async () => {
        steps.push('flush');
      }
    },
    showDailyReport: async () => {
      steps.push('show');
    }
  });

  await handler();

  assert.deepEqual(steps, ['show']);
});
