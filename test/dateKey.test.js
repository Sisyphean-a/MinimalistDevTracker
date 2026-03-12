const test = require('node:test');
const assert = require('node:assert/strict');

const { toLocalDateKey } = require('../src/core/dateKey');

function pad(value) {
  return String(value).padStart(2, '0');
}

function buildExpectedLocalDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test('toLocalDateKey uses local calendar day instead of UTC day', () => {
  const timestamp = Date.UTC(2026, 2, 12, 20, 0, 0);
  const expected = buildExpectedLocalDateKey(timestamp);
  assert.equal(toLocalDateKey(timestamp), expected);
});
