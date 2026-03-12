function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(durationMs) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function renderRows(projects) {
  return Object.entries(projects)
    .map(([repoPath, metrics]) => {
      return [
        '<tr>',
        `<td>${escapeHtml(repoPath)}</td>`,
        `<td>${escapeHtml(formatDuration(metrics.totalActiveTimeMs))}</td>`,
        `<td>${escapeHtml(metrics.totalLocAdded)}</td>`,
        `<td>${escapeHtml(metrics.totalLocDeleted)}</td>`,
        `<td>${escapeHtml(metrics.sessions.length)}</td>`,
        '</tr>'
      ].join('');
    })
    .join('');
}

function renderDailyReportHtml(dailyData) {
  if (!dailyData || !dailyData.projects || Object.keys(dailyData.projects).length === 0) {
    return '<html><body><h2>Minimalist Dev Tracker</h2><p>暂无统计数据</p></body></html>';
  }

  const rows = renderRows(dailyData.projects);
  const title = `Minimalist Dev Tracker - ${escapeHtml(dailyData.date)}`;

  return [
    '<html>',
    '<head><meta charset="utf-8"><style>',
    'body{font-family:Segoe UI,Arial,sans-serif;padding:16px;} ',
    'table{width:100%;border-collapse:collapse;} ',
    'th,td{border:1px solid #ddd;padding:8px;text-align:left;} ',
    'th{background:#f4f4f4;}',
    '</style></head>',
    '<body>',
    `<h2>${title}</h2>`,
    '<table>',
    '<thead><tr><th>项目/工作树</th><th>活跃时长</th><th>新增 LOC</th><th>删除 LOC</th><th>会话数</th></tr></thead>',
    `<tbody>${rows}</tbody>`,
    '</table>',
    '</body>',
    '</html>'
  ].join('');
}

module.exports = {
  renderDailyReportHtml,
  formatDuration
};
