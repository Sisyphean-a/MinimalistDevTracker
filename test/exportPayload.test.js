const test = require('node:test');
const assert = require('node:assert/strict');

const { buildExportPayload } = require('../src/core/exportPayload');

function createReportData() {
  return {
    dateRangeStart: '2026-04-14',
    dateRangeEnd: '2026-05-13',
    totalActiveTimeMs: 7_200_000,
    trackedLocAdded: 110,
    trackedLocDeleted: 20,
    untrackedLocAdded: 50,
    untrackedLocDeleted: 0,
    totalLocAdded: 160,
    totalLocDeleted: 20,
    projects: {
      'f:/repo/main||feature/a': {
        repoPath: 'f:/repo/main',
        branch: 'feature/a',
        totalActiveTimeMs: 7_200_000,
        trackedLocAdded: 110,
        trackedLocDeleted: 20,
        untrackedLocAdded: 50,
        untrackedLocDeleted: 0,
        totalLocAdded: 160,
        totalLocDeleted: 20,
        trackedLocByFileType: {
          js: { locAdded: 100, locDeleted: 20 }
        },
        untrackedLocByFileType: {
          md: { locAdded: 50, locDeleted: 0 }
        },
        locByFileType: {
          js: { locAdded: 100, locDeleted: 20 },
          md: { locAdded: 50, locDeleted: 0 }
        },
        sessions: [
          {
            branch: 'feature/a',
            startTime: Date.parse('2026-05-10T01:00:00.000Z'),
            endTime: Date.parse('2026-05-10T02:00:00.000Z'),
            durationMs: 3_600_000,
            trackedLocAdded: 20,
            trackedLocDeleted: 10,
            untrackedLocAdded: 0,
            untrackedLocDeleted: 0,
            locAdded: 20,
            locDeleted: 10,
            trackedLocByFileType: {
              js: { locAdded: 20, locDeleted: 10 }
            },
            untrackedLocByFileType: {},
            locByFileType: {
              js: { locAdded: 20, locDeleted: 10 }
            }
          },
          {
            branch: 'feature/a',
            startTime: Date.parse('2026-05-11T01:00:00.000Z'),
            endTime: Date.parse('2026-05-11T02:00:00.000Z'),
            durationMs: 1_800_000,
            trackedLocAdded: 60,
            trackedLocDeleted: 10,
            untrackedLocAdded: 0,
            untrackedLocDeleted: 0,
            locAdded: 60,
            locDeleted: 10,
            trackedLocByFileType: {
              js: { locAdded: 60, locDeleted: 10 }
            },
            untrackedLocByFileType: {},
            locByFileType: {
              js: { locAdded: 60, locDeleted: 10 }
            }
          },
          {
            branch: 'feature/a',
            startTime: Date.parse('2026-05-12T01:00:00.000Z'),
            endTime: Date.parse('2026-05-12T02:00:00.000Z'),
            durationMs: 1_800_000,
            trackedLocAdded: 30,
            trackedLocDeleted: 0,
            untrackedLocAdded: 50,
            untrackedLocDeleted: 0,
            locAdded: 80,
            locDeleted: 0,
            trackedLocByFileType: {
              js: { locAdded: 20, locDeleted: 0 }
            },
            untrackedLocByFileType: {
              md: { locAdded: 50, locDeleted: 0 }
            },
            locByFileType: {
              js: { locAdded: 30, locDeleted: 0 },
              md: { locAdded: 50, locDeleted: 0 }
            }
          }
        ]
      }
    },
    days: [
      {
        date: '2026-05-10',
        totalActiveTimeMs: 3_600_000,
        trackedLocAdded: 20,
        trackedLocDeleted: 10,
        untrackedLocAdded: 0,
        untrackedLocDeleted: 0,
        totalLocAdded: 20,
        totalLocDeleted: 10,
        totalLoc: 30
      }
    ]
  };
}

test('buildExportPayload keeps tracked/untracked splits and visibility flags for export charts', () => {
  const payload = buildExportPayload(
    createReportData(),
    {
      exportType: 'dataWithHtml',
      format: 'json',
      scopeType: 'currentProject',
      repoPaths: ['f:/repo/main'],
      branchMode: 'current',
      branch: 'feature/a',
      startDate: '2026-04-14',
      endDate: '2026-05-13'
    },
    Date.parse('2026-05-13T08:00:00.000Z')
  );

  assert.equal(payload.metadata.showProjectContribution, false);
  assert.equal(payload.metadata.showBranchContribution, false);
  assert.equal(payload.metadata.sessionSizeThreshold, 50);
  assert.equal(payload.summary.totalTrackedLoc, 130);
  assert.equal(payload.summary.totalUntrackedLoc, 50);
  assert.equal(payload.summary.totalLoc, 180);
  assert.equal(payload.sessions[2].trackedTotalLoc, 30);
  assert.equal(payload.sessions[2].untrackedTotalLoc, 50);
  assert.equal(payload.sessions[2].totalLoc, 80);
  assert.deepEqual(payload.fileTypes, [
    {
      fileType: 'js',
      trackedLocAdded: 100,
      trackedLocDeleted: 20,
      untrackedLocAdded: 0,
      untrackedLocDeleted: 0,
      locAdded: 100,
      locDeleted: 20
    },
    {
      fileType: 'md',
      trackedLocAdded: 0,
      trackedLocDeleted: 0,
      untrackedLocAdded: 50,
      untrackedLocDeleted: 0,
      locAdded: 50,
      locDeleted: 0
    }
  ]);
});

test('buildExportPayload trims leading empty days while preserving the originally requested range', () => {
  const payload = buildExportPayload(
    {
      ...createReportData(),
      dateRangeStart: '2026-02-01',
      dateRangeEnd: '2026-05-13',
      days: [
        {
          date: '2026-02-01',
          totalActiveTimeMs: 0,
          trackedLocAdded: 0,
          trackedLocDeleted: 0,
          untrackedLocAdded: 0,
          untrackedLocDeleted: 0,
          totalLocAdded: 0,
          totalLocDeleted: 0,
          totalLoc: 0
        },
        {
          date: '2026-03-20',
          totalActiveTimeMs: 3_600_000,
          trackedLocAdded: 20,
          trackedLocDeleted: 10,
          untrackedLocAdded: 0,
          untrackedLocDeleted: 0,
          totalLocAdded: 20,
          totalLocDeleted: 10,
          totalLoc: 30
        }
      ]
    },
    {
      exportType: 'dataWithHtml',
      format: 'json',
      scopeType: 'currentProject',
      repoPaths: ['f:/repo/main'],
      branchMode: 'current',
      branch: 'feature/a',
      startDate: '2026-02-01',
      endDate: '2026-05-13'
    },
    Date.parse('2026-05-13T08:00:00.000Z')
  );

  assert.equal(payload.metadata.requestedStartDate, '2026-02-01');
  assert.equal(payload.metadata.startDate, '2026-03-20');
  assert.equal(payload.days[0].date, '2026-03-20');
  assert.equal(payload.days.length, 1);
});
