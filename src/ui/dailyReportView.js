const RECENT_SESSION_LIMIT = 20;
const LONG_RANGE_DAY_THRESHOLD = 60;
const HEATLINE_COLORS = ['#edf3f1', '#d4e8df', '#8ecdb6', '#2fa17f', '#0f7b62'];
const {
  aggregateByFileType,
  aggregateSummary,
  buildHourlyBuckets,
  collectSessions,
  getActiveDays,
  sortSessionsByEndTime,
  toProjectList
} = require('./reportViewModel');
const {
  createClientScript,
  renderExportPanel,
  renderPeriodSelector
} = require('./reportControlsView');
const { REPORT_PAGE_STYLES } = require('./reportStyles');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(durationMs) {
  const totalSeconds = Math.floor((durationMs ?? 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}小时${minutes}分${seconds}秒`;
}

function formatTime(timestamp) {
  if (!timestamp) {
    return '-';
  }
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return '-';
  }
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${formatTime(timestamp)}`;
}

function renderSummaryCards(summary) {
  const totalLoc = summary.totalLocAdded + summary.totalLocDeleted;
  return [
    '<section class="cards">',
    `<article class="card"><h4>总活跃时长</h4><p>${escapeHtml(formatDuration(summary.totalActiveTimeMs))}</p></article>`,
    `<article class="card"><h4>会话数</h4><p>${escapeHtml(summary.sessionCount)}</p></article>`,
    `<article class="card"><h4>总变更行</h4><p>${escapeHtml(totalLoc)}</p></article>`,
    `<article class="card"><h4>已跟踪变更</h4><p>+${escapeHtml(summary.trackedLocAdded)} / -${escapeHtml(summary.trackedLocDeleted)}</p></article>`,
    `<article class="card"><h4>未纳入 Git 的文件</h4><p>+${escapeHtml(summary.untrackedLocAdded)} / -${escapeHtml(summary.untrackedLocDeleted)}</p></article>`,
    '</section>'
  ].join('');
}

function renderUntrackedExplanation() {
  return '<p class="muted note">“未纳入 Git 的文件”统计的是未纳入 Git 文件的当前总行数，以及后续编辑带来的增量；不包含已纳入 Git 文件的未提交 diff。</p>';
}

function renderProjectRows(projects) {
  return projects
    .sort((left, right) => right.totalActiveTimeMs - left.totalActiveTimeMs)
    .map((project) => {
      const totalLoc = project.totalLocAdded + project.totalLocDeleted;
      return [
        '<tr>',
        `<td>${escapeHtml(project.repoPath)}</td>`,
        `<td>${escapeHtml(project.branch)}</td>`,
        `<td>${escapeHtml(formatDuration(project.totalActiveTimeMs))}</td>`,
        `<td>+${escapeHtml(project.trackedLocAdded)} / -${escapeHtml(project.trackedLocDeleted)}</td>`,
        `<td>+${escapeHtml(project.untrackedLocAdded)} / -${escapeHtml(project.untrackedLocDeleted)}</td>`,
        `<td>${escapeHtml(totalLoc)}</td>`,
        `<td>${escapeHtml(project.sessions.length)}</td>`,
        '</tr>'
      ].join('');
    })
    .join('');
}

function renderFileTypeRows(fileTypeStats) {
  return Object.entries(fileTypeStats)
    .sort((left, right) => {
      const leftTotal = left[1].locAdded + left[1].locDeleted;
      const rightTotal = right[1].locAdded + right[1].locDeleted;
      return rightTotal - leftTotal;
    })
    .map(([fileType, metrics]) => {
      const totalLoc = metrics.locAdded + metrics.locDeleted;
      return [
        '<tr>',
        `<td>${escapeHtml(fileType)}</td>`,
        `<td>${escapeHtml(metrics.locAdded)}</td>`,
        `<td>${escapeHtml(metrics.locDeleted)}</td>`,
        `<td>${escapeHtml(totalLoc)}</td>`,
        '</tr>'
      ].join('');
    })
    .join('');
}

function getHeatlineColor(ratio) {
  if (ratio <= 0) {
    return HEATLINE_COLORS[0];
  }
  const index = Math.min(HEATLINE_COLORS.length - 1, Math.floor(ratio * HEATLINE_COLORS.length));
  return HEATLINE_COLORS[index];
}

function renderHeatlineCells(buckets) {
  const maxDurationMs = buckets.reduce((maxValue, bucket) => Math.max(maxValue, bucket.totalActiveTimeMs ?? 0), 0);
  return buckets
    .map((bucket) => {
      const ratio = maxDurationMs === 0 ? 0 : (bucket.totalActiveTimeMs ?? 0) / maxDurationMs;
      return `<span class="heatline-cell" style="background:${escapeHtml(getHeatlineColor(ratio))}"></span>`;
    })
    .join('');
}

function renderHeatlineDayCells(days) {
  const maxDurationMs = days.reduce((maxValue, day) => Math.max(maxValue, day.totalActiveTimeMs ?? 0), 0);
  return days
    .map((day) => {
      const ratio = maxDurationMs === 0 ? 0 : (day.totalActiveTimeMs ?? 0) / maxDurationMs;
      return `<span class="heatline-cell" style="background:${escapeHtml(getHeatlineColor(ratio))}"></span>`;
    })
    .join('');
}

function renderHeatLineSection(sessions, days, dateRangeStart, dateRangeEnd) {
  const useDayBuckets = Array.isArray(days) && days.length > LONG_RANGE_DAY_THRESHOLD;
  const buckets = useDayBuckets ? days : buildHourlyBuckets(sessions, dateRangeStart, dateRangeEnd);
  if (buckets.length === 0) {
    return '';
  }
  const caption = useDayBuckets ? '按天切分，颜色越深表示活跃越高' : '按小时切分，颜色越深表示活跃越高';
  const cells = useDayBuckets ? renderHeatlineDayCells(days) : renderHeatlineCells(buckets);

  return [
    '<section class="panel"><h3>整体热力线</h3>',
    `<p class="muted">${caption}</p>`,
    '<div class="heatline-labels">',
    `<span>${escapeHtml(dateRangeStart ?? '')}</span>`,
    `<span>${escapeHtml(dateRangeEnd ?? '')}</span>`,
    '</div>',
    `<div class="heatline-track"><div class="heatline-grid" style="grid-template-columns:repeat(${escapeHtml(buckets.length)}, minmax(0, 1fr));">${cells}</div></div>`,
    '</section>'
  ].join('');
}

function renderActiveDayRows(days) {
  return days.map((day) => {
    const totalLoc = day.totalLoc ?? ((day.totalLocAdded ?? 0) + (day.totalLocDeleted ?? 0));
    return [
      '<tr>',
      `<td>${escapeHtml(day.date)}</td>`,
      `<td>${escapeHtml(formatDuration(day.totalActiveTimeMs ?? 0))}</td>`,
      `<td>${escapeHtml(totalLoc)}</td>`,
      `<td>+${escapeHtml(day.totalLocAdded ?? 0)}/-${escapeHtml(day.totalLocDeleted ?? 0)}</td>`,
      '</tr>'
    ].join('');
  }).join('');
}

function renderActiveDaysSection(days) {
  const activeDays = getActiveDays(days);
  const rows = activeDays.length > 0
    ? renderActiveDayRows(activeDays)
    : '<tr><td colspan="4">当前范围内暂无活跃日期数据</td></tr>';

  return [
    '<section class="panel"><h3>有值日期统计</h3>',
    '<table><thead><tr><th>日期</th><th>总时长</th><th>总行数</th><th>变更行数</th></tr></thead>',
    `<tbody>${rows}</tbody></table></section>`
  ].join('');
}

function renderSessionRows(sessions) {
  return sessions.map((session) => {
    const totalLoc = session.locAdded + session.locDeleted;
    return [
      '<tr>',
      `<td>${escapeHtml(session.repoPath)}</td>`,
      `<td>${escapeHtml(session.branch)}</td>`,
      `<td>${escapeHtml(formatDateTime(session.startTime))}</td>`,
      `<td>${escapeHtml(formatDateTime(session.endTime))}</td>`,
      `<td>${escapeHtml(formatDuration(session.durationMs))}</td>`,
      `<td>+${escapeHtml(session.trackedLocAdded)} / -${escapeHtml(session.trackedLocDeleted)}</td>`,
      `<td>+${escapeHtml(session.untrackedLocAdded)} / -${escapeHtml(session.untrackedLocDeleted)}</td>`,
      `<td>${escapeHtml(totalLoc)}</td>`,
      '</tr>'
    ].join('');
  }).join('');
}

function renderEmptyHtml() {
  return '<html><body><h2>Minimalist Dev Tracker</h2><p>暂无统计数据</p></body></html>';
}

function buildReportSections(dailyData) {
  const projects = toProjectList(dailyData.projects);
  if (projects.length === 0) {
    return null;
  }

  const sessions = collectSessions(projects);
  return {
    activeDaysSection: renderActiveDaysSection(dailyData.days),
    fileTypeRows: renderFileTypeRows(aggregateByFileType(projects)),
    heatLineSection: renderHeatLineSection(sessions, dailyData.days, dailyData.dateRangeStart, dailyData.dateRangeEnd),
    projectRows: renderProjectRows(projects),
    sessionRows: renderSessionRows(sortSessionsByEndTime(sessions).slice(0, RECENT_SESSION_LIMIT)),
    summary: aggregateSummary(projects)
  };
}

function renderReportHtml(dailyData, options, sections) {
  const refreshIntervalMs = options.refreshIntervalMs ?? 30_000;
  const periodType = dailyData.periodType ?? 'rolling30';
  const exportDefaults = options.exportDefaults ?? dailyData.exportDefaults ?? {};
  const rangeLabel = dailyData.dateRangeStart && dailyData.dateRangeEnd
    ? `${escapeHtml(dailyData.dateRangeStart)} ~ ${escapeHtml(dailyData.dateRangeEnd)}`
    : '';
  return [
    '<html>',
    `<head><meta charset="utf-8"><style>${REPORT_PAGE_STYLES}</style></head>`,
    '<body>',
    '<div class="header">',
    `<div><h2 class="title">Minimalist Dev Tracker</h2><div class="muted">${escapeHtml(dailyData.periodLabel ?? periodType)}${rangeLabel ? ` · ${rangeLabel}` : ''}</div></div>`,
    `<div class="toolbar-actions">${renderPeriodSelector(periodType)}<button id="export-toggle-btn" class="btn btn-secondary">导出</button><button id="refresh-btn" class="btn">立即刷新</button></div>`,
    '</div>',
    `<p class="muted">自动刷新间隔：${escapeHtml(Math.floor(refreshIntervalMs / 1000))} 秒</p>`,
    renderExportPanel(exportDefaults),
    renderSummaryCards(sections.summary),
    renderUntrackedExplanation(),
    sections.heatLineSection,
    sections.activeDaysSection,
    '<section class="panel"><h3>仓库 + 分支统计</h3>',
    '<table><thead><tr><th>仓库</th><th>分支</th><th>活跃时长</th><th>已跟踪变更</th><th>未纳入 Git 的文件</th><th>总变更行</th><th>会话数</th></tr></thead>',
    `<tbody>${sections.projectRows}</tbody></table></section>`,
    '<section class="panel"><h3>按文件类型统计</h3>',
    '<table><thead><tr><th>文件类型</th><th>新增代码行</th><th>删除代码行</th><th>总变更行</th></tr></thead>',
    `<tbody>${sections.fileTypeRows || '<tr><td colspan="4">暂无按类型统计数据</td></tr>'}</tbody></table></section>`,
    '<section class="panel"><h3>最近会话</h3>',
    '<table><thead><tr><th>仓库</th><th>分支</th><th>开始</th><th>结束</th><th>时长</th><th>已跟踪变更</th><th>未纳入 Git 的文件</th><th>总变更行</th></tr></thead>',
    `<tbody>${sections.sessionRows || '<tr><td colspan="8">暂无会话数据</td></tr>'}</tbody></table></section>`,
    createClientScript(),
    '</body>',
    '</html>'
  ].join('');
}

function renderDailyReportHtml(dailyData, options = {}) {
  if (!dailyData || !dailyData.projects || Object.keys(dailyData.projects).length === 0) {
    return renderEmptyHtml();
  }

  const sections = buildReportSections(dailyData);
  if (!sections) {
    return renderEmptyHtml();
  }
  return renderReportHtml(dailyData, options, sections);
}

module.exports = {
  renderDailyReportHtml,
  formatDuration
};
