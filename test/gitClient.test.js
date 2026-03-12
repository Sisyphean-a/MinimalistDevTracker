const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGitEnv } = require('../src/core/gitClient');

test('buildGitEnv forces stable C locale for git output parsing', () => {
  const env = buildGitEnv({ LANG: 'zh_CN.UTF-8', LC_ALL: 'zh_CN.UTF-8', CUSTOM: 'ok' });
  assert.equal(env.LANG, 'C');
  assert.equal(env.LC_ALL, 'C');
  assert.equal(env.CUSTOM, 'ok');
});
