const test = require('node:test');
const assert = require('node:assert/strict');

const { renderDailyReportHtml } = require('../src/ui/dailyReportView');

test('renderDailyReportHtml includes project rows and totals', () => {
  const html = renderDailyReportHtml({
    periodType: 'rolling30',
    periodLabel: '最近30天',
    dateRangeStart: '2026-03-01',
    dateRangeEnd: '2026-03-12',
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
    },
    days: [
      { date: '2026-03-12', totalActiveTimeMs: 3_600_000, totalLocAdded: 20, totalLocDeleted: 5, totalLoc: 25 }
    ]
  });

  assert.match(html, /最近30天/);
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
  assert.match(html, /整体热力线/);
  assert.match(html, /2026-03-12/);
  assert.match(html, /会话明细/);
  assert.match(html, /js/);
  assert.match(html, /vue/);
  assert.match(html, /3600秒/);
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

  assert.doesNotMatch(html, /整体热力线/);
});

test('renderDailyReportHtml handles empty data', () => {
  const html = renderDailyReportHtml(null);
  assert.match(html, /暂无统计数据/);
});

test('renderDailyReportHtml renders the selected range with a heat line', () => {
  const html = renderDailyReportHtml({
    periodType: 'rolling30',
    periodLabel: '最近30天',
    dateRangeStart: '2026-03-11',
    dateRangeEnd: '2026-04-09',
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
            startTime: Date.parse('2026-04-08T01:00:00.000Z'),
            endTime: Date.parse('2026-04-08T02:00:00.000Z'),
            durationMs: 1_500,
            locAdded: 2,
            locDeleted: 1
          }
        ]
      }
    },
    days: [
      { date: '2026-03-11', totalActiveTimeMs: 0, totalLocAdded: 0, totalLocDeleted: 0, totalLoc: 0 },
      { date: '2026-04-08', totalActiveTimeMs: 1_500, totalLocAdded: 2, totalLocDeleted: 1, totalLoc: 3 }
    ]
  });

  assert.match(html, /最近30天/);
  assert.match(html, /时间范围/);
  assert.match(html, /热力线/);
  assert.match(html, /2秒/);
  assert.doesNotMatch(html, /近7天趋势/);
  assert.doesNotMatch(html, /近30天趋势/);
});

test('renderDailyReportHtml hides the heat line when there is no day data', () => {
  const html = renderDailyReportHtml({
    periodType: 'month',
    periodLabel: '本月',
    dateRangeStart: '2026-04-01',
    dateRangeEnd: '2026-04-09',
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
    },
    days: []
  });

  assert.doesNotMatch(html, /热力线/);
});
