const test = require('node:test');
const assert = require('node:assert/strict');

const { renderDailyReportHtml } = require('../src/ui/dailyReportView');

function createProject(overrides = {}) {
  return {
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
    sessions: [],
    ...overrides
  };
}

test('renderDailyReportHtml renders a continuous heatline with range labels and no inline values', () => {
  const html = renderDailyReportHtml({
    periodType: 'rolling30',
    periodLabel: '最近30天',
    dateRangeStart: '2026-03-11',
    dateRangeEnd: '2026-04-09',
    projects: {
      'f:/repo/main||main': createProject({
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
      })
    },
    days: [
      { date: '2026-03-11', totalActiveTimeMs: 0, totalLocAdded: 0, totalLocDeleted: 0, totalLoc: 0 },
      { date: '2026-04-08', totalActiveTimeMs: 1_500, totalLocAdded: 2, totalLocDeleted: 1, totalLoc: 3 },
      { date: '2026-04-09', totalActiveTimeMs: 3_700, totalLocAdded: 5, totalLocDeleted: 2, totalLoc: 7 }
    ]
  });

  assert.match(html, /整体热力线/);
  assert.match(html, /活跃趋势/);
  assert.match(html, /2026-03-11/);
  assert.match(html, /2026-04-09/);
  assert.match(html, /linear-gradient\(90deg,/);
  assert.match(html, /heatline-track/);
  assert.doesNotMatch(html, /heat-cell/);
  assert.doesNotMatch(html, /1500秒/);
  assert.doesNotMatch(html, /3700秒/);
});

test('renderDailyReportHtml renders only non-zero day rows in the daily stats table', () => {
  const html = renderDailyReportHtml({
    periodType: 'month',
    periodLabel: '本月',
    dateRangeStart: '2026-04-01',
    dateRangeEnd: '2026-04-09',
    projects: {
      'f:/repo/main||main': createProject()
    },
    days: [
      { date: '2026-04-01', totalActiveTimeMs: 3_433_000, totalLocAdded: 10, totalLocDeleted: 2, totalLoc: 12 },
      { date: '2026-04-02', totalActiveTimeMs: 3_219_000, totalLocAdded: 6, totalLocDeleted: 4, totalLoc: 10 },
      { date: '2026-04-03', totalActiveTimeMs: 0, totalLocAdded: 0, totalLocDeleted: 0, totalLoc: 0 }
    ]
  });

  assert.match(html, /有值日期统计/);
  assert.match(html, /<th>日期<\/th><th>总时长<\/th><th>总行数<\/th>/);
  assert.match(html, /2026-04-02/);
  assert.match(html, /2026-04-01/);
  assert.match(html, /0小时53分39秒/);
  assert.match(html, /0小时57分13秒/);
  assert.match(html, /12<\/td>/);
  assert.doesNotMatch(html, /2026-04-03/);
});

test('renderDailyReportHtml limits session detail rows to the most recent entries', () => {
  const sessions = Array.from({ length: 25 }).map((_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return {
      branch: 'main',
      startTime: Date.parse(`2026-04-${day}T01:00:00.000Z`),
      endTime: Date.parse(`2026-04-${day}T02:00:00.000Z`),
      durationMs: 1_000 + index,
      locAdded: index + 1,
      locDeleted: 1
    };
  });

  const html = renderDailyReportHtml({
    periodType: 'month',
    periodLabel: '本月',
    dateRangeStart: '2026-04-01',
    dateRangeEnd: '2026-04-30',
    projects: {
      'f:/repo/main||main': createProject({
        sessions,
        totalActiveTimeMs: 50_000,
        totalLocAdded: 200,
        totalLocDeleted: 25
      })
    },
    days: [
      { date: '2026-04-25', totalActiveTimeMs: 2_000, totalLocAdded: 25, totalLocDeleted: 1, totalLoc: 26 }
    ]
  });

  const rowCount = (html.match(/<tr>/g) ?? []).length;
  assert.match(html, /最近会话/);
  assert.match(html, /2026-04-25/);
  assert.match(html, /2026-04-25 10:00:00/);
  assert.match(html, /2026-04-06/);
  assert.doesNotMatch(html, /2026-04-05/);
  assert.ok(rowCount >= 20);
});

test('renderDailyReportHtml handles empty data', () => {
  const html = renderDailyReportHtml(null);
  assert.match(html, /暂无统计数据/);
});
