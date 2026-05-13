const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.join(__dirname, '..');

test('package.json does not ship echarts as a runtime dependency', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.dependencies?.echarts, undefined);
  assert.ok(packageJson.dependencies?.['sql.js']);
});

test('packaging keeps a vendored echarts runtime asset in the repository', () => {
  const assetPath = path.join(workspaceRoot, 'assets', 'echarts.min.js');
  assert.equal(fs.existsSync(assetPath), true);
  assert.ok(fs.statSync(assetPath).size > 100_000);
});

test('.vscodeignore excludes large dependency artifacts that are not needed at runtime', () => {
  const ignoreFile = fs.readFileSync(path.join(workspaceRoot, '.vscodeignore'), 'utf8');
  assert.match(ignoreFile, /\.codexpotter\/\*\*/);
  assert.match(ignoreFile, /node_modules\/\*\*\/\*\.map/);
  assert.match(ignoreFile, /node_modules\/sql\.js\/dist\/\*debug\*/);
  assert.match(ignoreFile, /node_modules\/sql\.js\/dist\/\*asm\*/);
  assert.match(ignoreFile, /node_modules\/sql\.js\/dist\/worker\.\*/);
});
