const test = require('node:test');
const assert = require('node:assert/strict');

const { createPathNormalizer, isCaseSensitivePlatform } = require('../src/core/pathKey');

test('isCaseSensitivePlatform returns false on win32', () => {
  assert.equal(isCaseSensitivePlatform('win32'), false);
});

test('isCaseSensitivePlatform returns true on linux', () => {
  assert.equal(isCaseSensitivePlatform('linux'), true);
});

test('createPathNormalizer lowercases path when case-sensitive is disabled', () => {
  const normalizer = createPathNormalizer({ caseSensitive: false });
  assert.equal(normalizer.normalize('F:/Repo/Main\\Src/A.js'), 'f:/repo/main/src/a.js');
});

test('createPathNormalizer preserves case when case-sensitive is enabled', () => {
  const normalizer = createPathNormalizer({ caseSensitive: true });
  assert.equal(normalizer.normalize('F:/Repo/Main\\Src/A.js'), 'F:/Repo/Main/Src/A.js');
});
