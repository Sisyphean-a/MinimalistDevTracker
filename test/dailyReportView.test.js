const test = require('node:test');
const assert = require('node:assert/strict');

const { renderDailyReportHtml } = require('../src/ui/dailyReportView');

test('renderDailyReportHtml includes project rows and totals', () => {
  const html = renderDailyReportHtml({
    date: '2026-03-12',
    projects: {
      'f:/repo/main': {
        totalActiveTimeMs: 7_200_000,
        totalLocAdded: 20,
        totalLocDeleted: 5,
        sessions: []
      }
    }
  });

  assert.match(html, /2026-03-12/);
  assert.match(html, /f:\/repo\/main/);
  assert.match(html, /20/);
  assert.match(html, /5/);
});

test('renderDailyReportHtml handles empty data', () => {
  const html = renderDailyReportHtml(null);
  assert.match(html, /暂无统计数据/);
});
