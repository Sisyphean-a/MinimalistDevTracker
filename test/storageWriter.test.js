const test = require('node:test');
const assert = require('node:assert/strict');

const { createStorageWriter } = require('../src/core/storageWriter');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('serializes writes for the same file key', async () => {
  const writer = createStorageWriter();
  const timeline = [];

  await Promise.all([
    writer.run('same-file', async () => {
      timeline.push('a-start');
      await delay(10);
      timeline.push('a-end');
      return 'a';
    }),
    writer.run('same-file', async () => {
      timeline.push('b-start');
      timeline.push('b-end');
      return 'b';
    })
  ]);

  assert.deepEqual(timeline, ['a-start', 'a-end', 'b-start', 'b-end']);
});

test('continues queue after a failed write task', async () => {
  const writer = createStorageWriter();
  const timeline = [];

  await assert.rejects(
    writer.run('same-file', async () => {
      timeline.push('fail-start');
      throw new Error('intentional');
    }),
    /intentional/
  );

  await writer.run('same-file', async () => {
    timeline.push('recover-start');
    timeline.push('recover-end');
  });

  assert.deepEqual(timeline, ['fail-start', 'recover-start', 'recover-end']);
});
