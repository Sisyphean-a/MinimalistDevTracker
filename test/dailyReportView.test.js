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

test('renderDailyReportHtml renders an hour-bucket heat band with range labels', () => {
  const html = renderDailyReportHtml({
    periodType: 'rolling30',
    periodLabel: '最近30天',
    dateRangeStart: '2026-04-08',
    dateRangeEnd: '2026-04-09',
    projects: {
      'f:/repo/main||main': createProject({
        sessions: [
          {
            branch: 'main',
            startTime: Date.parse('2026-04-08T01:15:00.000Z'),
            endTime: Date.parse('2026-04-08T03:15:00.000Z'),
            durationMs: 7_200_000,
            locAdded: 2,
            locDeleted: 1
          },
          {
            branch: 'main',
            startTime: Date.parse('2026-04-09T00:00:00.000Z'),
            endTime: Date.parse('2026-04-09T01:00:00.000Z'),
            durationMs: 3_600_000,
            locAdded: 5,
            locDeleted: 2
          }
        ]
      })
    },
    days: [
      { date: '2026-04-08', totalActiveTimeMs: 7_200_000, totalLocAdded: 2, totalLocDeleted: 1, totalLoc: 3 },
      { date: '2026-04-09', totalActiveTimeMs: 3_600_000, totalLocAdded: 5, totalLocDeleted: 2, totalLoc: 7 }
    ]
  });

  assert.match(html, /整体热力线/);
  assert.match(html, /按小时切分/);
  assert.match(html, /2026-04-08/);
  assert.match(html, /2026-04-09/);
  assert.match(html, /heatline-grid/);
  assert.equal((html.match(/class="heatline-cell"/g) ?? []).length, 48);
  assert.doesNotMatch(html, /linear-gradient\(90deg,/);
});

test('renderDailyReportHtml renders only non-zero day rows with change summary in the daily stats table', () => {
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
  assert.match(html, /<th>日期<\/th><th>总时长<\/th><th>总行数<\/th><th>变更行数<\/th>/);
  assert.match(html, /2026-04-02/);
  assert.match(html, /2026-04-01/);
  assert.match(html, /0小时53分39秒/);
  assert.match(html, /0小时57分13秒/);
  assert.match(html, /12<\/td>/);
  assert.match(html, /\+6\/-4/);
  assert.match(html, /\+10\/-2/);
  assert.doesNotMatch(html, /2026-04-03/);
});

test('renderDailyReportHtml clarifies untracked metrics and avoids duplicate auto refresh in webview script', () => {
  const html = renderDailyReportHtml({
    periodType: 'month',
    periodLabel: '本月',
    dateRangeStart: '2026-04-01',
    dateRangeEnd: '2026-04-09',
    projects: {
      'f:/repo/main||main': createProject()
    },
    days: [
      { date: '2026-04-01', totalActiveTimeMs: 3_433_000, totalLocAdded: 10, totalLocDeleted: 2, totalLoc: 12 }
    ]
  });

  assert.match(html, /未纳入 Git 的文件/);
  assert.match(html, /统计的是未纳入 Git 文件的当前总行数，以及后续编辑带来的增量/);
  assert.match(html, /不包含已纳入 Git 文件的未提交 diff/);
  assert.doesNotMatch(html, /未跟踪新文件/);
  assert.doesNotMatch(html, /setInterval\(/);
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
