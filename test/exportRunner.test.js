const test = require('node:test');
const assert = require('node:assert/strict');

const { createExportReportRunner } = require('../src/core/exportRunner');

function createReportData() {
  return {
    dateRangeStart: '2026-04-14',
    dateRangeEnd: '2026-05-13',
    totalActiveTimeMs: 1_000,
    totalLocAdded: 7,
    totalLocDeleted: 2,
    trackedLocAdded: 7,
    trackedLocDeleted: 2,
    untrackedLocAdded: 0,
    untrackedLocDeleted: 0,
    projects: {
      'f:/repo/main||main': {
        repoPath: 'f:/repo/main',
        branch: 'main',
        totalActiveTimeMs: 1_000,
        totalLocAdded: 7,
        totalLocDeleted: 2,
        trackedLocAdded: 7,
        trackedLocDeleted: 2,
        untrackedLocAdded: 0,
        untrackedLocDeleted: 0,
        locByFileType: { js: { locAdded: 7, locDeleted: 2 } },
        sessions: [
          {
            branch: 'main',
            startTime: Date.parse('2026-05-13T01:00:00.000Z'),
            endTime: Date.parse('2026-05-13T02:00:00.000Z'),
            durationMs: 1_000,
            trackedLocAdded: 7,
            trackedLocDeleted: 2,
            untrackedLocAdded: 0,
            untrackedLocDeleted: 0,
            locAdded: 7,
            locDeleted: 2
          }
        ]
      }
    },
    days: [
      { date: '2026-05-13', totalActiveTimeMs: 1_000, totalLocAdded: 7, totalLocDeleted: 2, totalLoc: 9 }
    ]
  };
}

test('export runner skips export when user cancels folder selection', async () => {
  const calls = [];
  const runner = createExportReportRunner({
    selectFolder: async () => null,
    storage: {
      readReportData: async () => {
        calls.push('storage');
        return createReportData();
      }
    },
    reportExporter: {
      exportToDirectory: async () => {
        calls.push('export');
      }
    },
    showInfoMessage: async () => {},
    showWarningMessage: async () => {}
  });

  const result = await runner({
    exportType: 'dataWithHtml',
    format: 'json',
    scopeType: 'currentProject',
    repoPaths: ['f:/repo/main'],
    branchMode: 'current',
    branch: 'main',
    startDate: '2026-04-14',
    endDate: '2026-05-13'
  });

  assert.equal(result, null);
  assert.deepEqual(calls, []);
});

test('export runner warns instead of writing an empty export', async () => {
  const warnings = [];
  const runner = createExportReportRunner({
    selectFolder: async () => 'C:/exports',
    storage: {
      readReportData: async () => ({
        dateRangeStart: '2026-04-14',
        dateRangeEnd: '2026-05-13',
        projects: {},
        days: []
      })
    },
    reportExporter: {
      exportToDirectory: async () => {
        throw new Error('should not write');
      }
    },
    showInfoMessage: async () => {},
    showWarningMessage: async (message) => {
      warnings.push(message);
    }
  });

  const result = await runner({
    exportType: 'dataOnly',
    format: 'json',
    scopeType: 'currentProject',
    repoPaths: ['f:/repo/main'],
    branchMode: 'current',
    branch: 'main',
    startDate: '2026-04-14',
    endDate: '2026-05-13'
  });

  assert.equal(result, null);
  assert.match(warnings[0], /没有可导出的数据/);
});

test('export runner builds payload and delegates to report exporter with a timestamped output directory', async () => {
  const requests = [];
  const infoMessages = [];
  const now = Date.parse('2026-05-13T08:00:00.000Z');
  const localDate = new Date(now);
  const expectedStamp = `${localDate.getFullYear()}${String(localDate.getMonth() + 1).padStart(2, '0')}${String(localDate.getDate()).padStart(2, '0')}-${String(localDate.getHours()).padStart(2, '0')}${String(localDate.getMinutes()).padStart(2, '0')}${String(localDate.getSeconds()).padStart(2, '0')}`;
  const runner = createExportReportRunner({
    now: () => now,
    selectFolder: async () => 'C:/exports',
    storage: {
      readReportData: async (input) => {
        requests.push(input);
        return createReportData();
      }
    },
    reportExporter: {
      exportToDirectory: async (input) => {
        requests.push(input);
        return { outputDir: input.outputDir };
      }
    },
    showInfoMessage: async (message) => {
      infoMessages.push(message);
    },
    showWarningMessage: async () => {}
  });

  const result = await runner({
    exportType: 'dataWithHtml',
    format: 'json',
    scopeType: 'currentProject',
    repoPaths: ['f:/repo/main'],
    branchMode: 'current',
    branch: 'main',
    startDate: '2026-04-14',
    endDate: '2026-05-13'
  });

  assert.deepEqual(requests[0], {
    repoPaths: ['f:/repo/main'],
    branch: 'main',
    startDate: '2026-04-14',
    endDate: '2026-05-13'
  });
  assert.match(requests[1].outputDir, new RegExp(`minimalist-dev-tracker-export-${expectedStamp.replace('-', '\\-')}$`));
  assert.equal(requests[1].payload.summary.totalLoc, 9);
  assert.match(infoMessages[0], /导出完成/);
  assert.equal(result.outputDir, requests[1].outputDir);
});
