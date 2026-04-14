const test = require('node:test');
const assert = require('node:assert/strict');

const { createTrackerConfigReader } = require('../src/core/trackerConfig');

function createMockVscode(overrides = {}) {
  return {
    workspace: {
      getConfiguration: (section) => {
        assert.equal(section, 'minimalTracker');
        return {
          get: (key, fallback) => {
            if (Object.prototype.hasOwnProperty.call(overrides, key)) {
              return overrides[key];
            }
            return fallback;
          }
        };
      }
    }
  };
}

test('tracker config reader returns exclude globs and flush flag', () => {
  const reader = createTrackerConfigReader(createMockVscode({
    'fileWatch.excludeGlobs': ['**/*.tmp'],
    flushBeforeReport: false
  }));

  assert.deepEqual(reader.getExcludeGlobs(), ['**/*.tmp']);
  assert.equal(reader.shouldFlushBeforeReport(), false);
});

test('tracker config reader validates shared storage path type', () => {
  const reader = createTrackerConfigReader(createMockVscode({
    sharedStoragePath: 42
  }));

  assert.throws(() => reader.getSharedStoragePath(), /must be a string/);
});
