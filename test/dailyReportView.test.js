const test = require('node:test');
const assert = require('node:assert/strict');

const { renderDailyReportHtml } = require('../src/ui/dailyReportView');

test('renderDailyReportHtml includes project rows and totals', () => {
  const html = renderDailyReportHtml({
    date: '2026-03-12',
    projects: {
      'f:/repo/main||main': {
        repoPath: 'f:/repo/main',
        branch: 'main',
        totalActiveTimeMs: 7_200_000,
        totalLocAdded: 20,
        totalLocDeleted: 5,
        trackedLocAdded: 14,
        trackedLocDeleted: 5,
        untrackedLocAdded: 6,
        untrackedLocDeleted: 0,
        locByFileType: {
          js: { locAdded: 12, locDeleted: 3 },
          vue: { locAdded: 8, locDeleted: 2 }
        },
        sessions: [
          {
            branch: 'main',
            startTime: Date.parse('2026-03-12T01:00:00.000Z'),
            endTime: Date.parse('2026-03-12T02:00:00.000Z'),
            durationMs: 3_600_000
          }
        ]
      }
    }
  });

  assert.match(html, /2026-03-12/);
  assert.match(html, /f:\/repo\/main/);
  assert.match(html, /main/);
  assert.match(html, /新增代码行/);
  assert.match(html, /删除代码行/);
  assert.match(html, /总变更行/);
  assert.match(html, /已跟踪变更/);
  assert.match(html, /未跟踪新文件/);
  assert.match(html, /立即刷新/);
  assert.match(html, /按文件类型统计/);
  assert.match(html, /按天活跃时长对比/);
  assert.match(html, /day-bar-fill/);
  assert.match(html, /会话明细/);
  assert.match(html, /js/);
  assert.match(html, /vue/);
});

test('renderDailyReportHtml hides daily bar section when no valid day data', () => {
  const html = renderDailyReportHtml({
    date: '2026-03-12',
    projects: {
      'f:/repo/main||main': {
        repoPath: 'f:/repo/main',
        branch: 'main',
        totalActiveTimeMs: 7_200_000,
        totalLocAdded: 20,
        totalLocDeleted: 5,
        trackedLocAdded: 14,
        trackedLocDeleted: 5,
        untrackedLocAdded: 6,
        untrackedLocDeleted: 0,
        locByFileType: {
          js: { locAdded: 12, locDeleted: 3 }
        },
        sessions: [
          {
            branch: 'main',
            startTime: null,
            endTime: Date.parse('2026-03-12T02:00:00.000Z'),
            durationMs: 3_600_000
          }
        ]
      }
    }
  });

  assert.doesNotMatch(html, /按天活跃时长对比/);
});

test('renderDailyReportHtml handles empty data', () => {
  const html = renderDailyReportHtml(null);
  assert.match(html, /暂无统计数据/);
});

test('renderDailyReportHtml renders rolling 7 and 30 day trend panels', () => {
  const html = renderDailyReportHtml({
    date: '2026-03-12',
    projects: {
      'f:/repo/main||main': {
        repoPath: 'f:/repo/main',
        branch: 'main',
        totalActiveTimeMs: 7_200_000,
        totalLocAdded: 20,
        totalLocDeleted: 5,
        trackedLocAdded: 14,
        trackedLocDeleted: 5,
        untrackedLocAdded: 6,
        untrackedLocDeleted: 0,
        locByFileType: {
          js: { locAdded: 12, locDeleted: 3 }
        },
        sessions: []
      }
    }
  }, {
    trendData: {
      generatedAt: Date.parse('2026-03-31T10:00:00.000Z'),
      windows: {
        7: {
          days: [
            { date: '2026-03-25', totalActiveTimeMs: 0, totalLocAdded: 0, totalLocDeleted: 0, totalLoc: 0 },
            { date: '2026-03-26', totalActiveTimeMs: 3_600_000, totalLocAdded: 9, totalLocDeleted: 3, totalLoc: 12 }
          ],
          totals: { totalActiveTimeMs: 3_600_000, totalLocAdded: 9, totalLocDeleted: 3, totalLoc: 12 },
          fileTypeChanges: [
            { fileType: 'js', currentTotalLoc: 12, previousTotalLoc: 4, currentShare: 1, previousShare: 0.4, deltaShare: 0.6 }
          ]
        },
        30: {
          days: [
            { date: '2026-03-02', totalActiveTimeMs: 7_200_000, totalLocAdded: 20, totalLocDeleted: 5, totalLoc: 25 }
          ],
          totals: { totalActiveTimeMs: 7_200_000, totalLocAdded: 20, totalLocDeleted: 5, totalLoc: 25 },
          fileTypeChanges: [
            { fileType: 'ts', currentTotalLoc: 15, previousTotalLoc: 5, currentShare: 0.6, previousShare: 0.2, deltaShare: 0.4 }
          ]
        }
      }
    }
  });

  assert.match(html, /近7天趋势/);
  assert.match(html, /近30天趋势/);
  assert.match(html, /趋势活跃时长/);
  assert.match(html, /趋势总变更行/);
  assert.match(html, /文件类型分布变化/);
  assert.match(html, /js/);
  assert.match(html, /ts/);
});

test('renderDailyReportHtml hides file-type change list when trend data is empty', () => {
  const html = renderDailyReportHtml({
    date: '2026-03-12',
    projects: {
      'f:/repo/main||main': {
        repoPath: 'f:/repo/main',
        branch: 'main',
        totalActiveTimeMs: 7_200_000,
        totalLocAdded: 20,
        totalLocDeleted: 5,
        trackedLocAdded: 14,
        trackedLocDeleted: 5,
        untrackedLocAdded: 6,
        untrackedLocDeleted: 0,
        locByFileType: {
          js: { locAdded: 12, locDeleted: 3 }
        },
        sessions: []
      }
    }
  }, {
    trendData: {
      generatedAt: Date.parse('2026-03-31T10:00:00.000Z'),
      windows: {
        7: {
          days: [],
          totals: { totalActiveTimeMs: 0, totalLocAdded: 0, totalLocDeleted: 0, totalLoc: 0 },
          fileTypeChanges: []
        }
      }
    }
  });

  assert.doesNotMatch(html, /文件类型分布变化/);
});
