const RECENT_SESSION_LIMIT = 20;
const REPORT_PERIOD_OPTIONS = [
  { value: 'rolling30', label: '最近30天' },
  { value: 'month', label: '本月' }
];
const HEATLINE_COLORS = ['#edf3f1', '#d4e8df', '#8ecdb6', '#2fa17f', '#0f7b62'];

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

function parseProjectKey(projectKey) {
  const [repoPath, branch] = String(projectKey).split('||');
  return {
    repoPath: repoPath || projectKey,
    branch: branch || 'unknown'
  };
}

function normalizeProject(projectKey, project) {
  const keyParts = parseProjectKey(projectKey);
  return {
    repoPath: project?.repoPath ?? keyParts.repoPath,
    branch: project?.branch ?? keyParts.branch,
    totalActiveTimeMs: project?.totalActiveTimeMs ?? 0,
    trackedLocAdded: project?.trackedLocAdded ?? project?.totalLocAdded ?? 0,
    trackedLocDeleted: project?.trackedLocDeleted ?? project?.totalLocDeleted ?? 0,
    untrackedLocAdded: project?.untrackedLocAdded ?? 0,
    untrackedLocDeleted: project?.untrackedLocDeleted ?? 0,
    totalLocAdded: project?.totalLocAdded ?? 0,
    totalLocDeleted: project?.totalLocDeleted ?? 0,
    locByFileType: project?.locByFileType ?? {},
    sessions: Array.isArray(project?.sessions) ? project.sessions : []
  };
}

function toProjectList(projects) {
  return Object.entries(projects ?? {})
    .map(([projectKey, project]) => normalizeProject(projectKey, project))
    .filter((project) => {
      return (project.totalLocAdded + project.totalLocDeleted) > 0
        || project.sessions.some((session) => ((session.locAdded ?? 0) + (session.locDeleted ?? 0)) > 0);
    });
}

function mergeByFileType(output, locByFileType) {
  Object.entries(locByFileType ?? {}).forEach(([fileType, metrics]) => {
    const existing = output[fileType] ?? { locAdded: 0, locDeleted: 0 };
    output[fileType] = {
      locAdded: existing.locAdded + (metrics.locAdded ?? 0),
      locDeleted: existing.locDeleted + (metrics.locDeleted ?? 0)
    };
  });
}

function aggregateSummary(projects) {
  return projects.reduce((acc, project) => {
    return {
      totalActiveTimeMs: acc.totalActiveTimeMs + project.totalActiveTimeMs,
      trackedLocAdded: acc.trackedLocAdded + project.trackedLocAdded,
      trackedLocDeleted: acc.trackedLocDeleted + project.trackedLocDeleted,
      untrackedLocAdded: acc.untrackedLocAdded + project.untrackedLocAdded,
      untrackedLocDeleted: acc.untrackedLocDeleted + project.untrackedLocDeleted,
      totalLocAdded: acc.totalLocAdded + project.totalLocAdded,
      totalLocDeleted: acc.totalLocDeleted + project.totalLocDeleted,
      sessionCount: acc.sessionCount + project.sessions.length
    };
  }, {
    totalActiveTimeMs: 0,
    trackedLocAdded: 0,
    trackedLocDeleted: 0,
    untrackedLocAdded: 0,
    untrackedLocDeleted: 0,
    totalLocAdded: 0,
    totalLocDeleted: 0,
    sessionCount: 0
  });
}

function aggregateByFileType(projects) {
  const output = {};
  projects.forEach((project) => {
    mergeByFileType(output, project.locByFileType);
  });
  return output;
}

function renderSummaryCards(summary) {
  const totalLoc = summary.totalLocAdded + summary.totalLocDeleted;
  return [
    '<section class="cards">',
    `<article class="card"><h4>总活跃时长</h4><p>${escapeHtml(formatDuration(summary.totalActiveTimeMs))}</p></article>`,
    `<article class="card"><h4>会话数</h4><p>${escapeHtml(summary.sessionCount)}</p></article>`,
    `<article class="card"><h4>总变更行</h4><p>${escapeHtml(totalLoc)}</p></article>`,
    `<article class="card"><h4>已跟踪变更</h4><p>+${escapeHtml(summary.trackedLocAdded)} / -${escapeHtml(summary.trackedLocDeleted)}</p></article>`,
    `<article class="card"><h4>未跟踪新文件</h4><p>+${escapeHtml(summary.untrackedLocAdded)} / -${escapeHtml(summary.untrackedLocDeleted)}</p></article>`,
    '</section>'
  ].join('');
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

function renderPeriodSelector(periodType) {
  const options = REPORT_PERIOD_OPTIONS.map((option) => {
    const selected = option.value === periodType ? ' selected' : '';
    return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
  }).join('');
  return [
    '<label class="range-picker">',
    '<span>时间范围</span>',
    `<select id="range-select">${options}</select>`,
    '</label>'
  ].join('');
}

function getHeatlineColor(ratio) {
  if (ratio <= 0) {
    return HEATLINE_COLORS[0];
  }
  const index = Math.min(HEATLINE_COLORS.length - 1, Math.floor(ratio * HEATLINE_COLORS.length));
  return HEATLINE_COLORS[index];
}

function buildHeatlineGradient(days) {
  const maxDurationMs = days.reduce((maxValue, day) => Math.max(maxValue, day.totalActiveTimeMs ?? 0), 0);
  const totalDays = days.length;
  const stops = days.flatMap((day, index) => {
    const start = ((index / totalDays) * 100).toFixed(2);
    const end = (((index + 1) / totalDays) * 100).toFixed(2);
    const durationMs = day.totalActiveTimeMs ?? 0;
    const ratio = maxDurationMs === 0 ? 0 : durationMs / maxDurationMs;
    const color = getHeatlineColor(ratio);
    return [`${color} ${start}%`, `${color} ${end}%`];
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function renderHeatLineSection(days, dateRangeStart, dateRangeEnd) {
  if (!Array.isArray(days) || days.length === 0) {
    return '';
  }

  return [
    '<section class="panel"><h3>整体热力线</h3>',
    '<p class="muted">活跃趋势</p>',
    '<div class="heatline-labels">',
    `<span>${escapeHtml(dateRangeStart ?? days[0]?.date ?? '')}</span>`,
    `<span>${escapeHtml(dateRangeEnd ?? days[days.length - 1]?.date ?? '')}</span>`,
    '</div>',
    `<div class="heatline-track" style="background:${escapeHtml(buildHeatlineGradient(days))}"></div>`,
    '</section>'
  ].join('');
}

function getActiveDays(days) {
  if (!Array.isArray(days)) {
    return [];
  }
  return days
    .filter((day) => ((day.totalActiveTimeMs ?? 0) > 0) || ((day.totalLoc ?? ((day.totalLocAdded ?? 0) + (day.totalLocDeleted ?? 0))) > 0))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function renderActiveDayRows(days) {
  return days.map((day) => {
    const totalLoc = day.totalLoc ?? ((day.totalLocAdded ?? 0) + (day.totalLocDeleted ?? 0));
    return [
      '<tr>',
      `<td>${escapeHtml(day.date)}</td>`,
      `<td>${escapeHtml(formatDuration(day.totalActiveTimeMs ?? 0))}</td>`,
      `<td>${escapeHtml(totalLoc)}</td>`,
      '</tr>'
    ].join('');
  }).join('');
}

function renderActiveDaysSection(days) {
  const activeDays = getActiveDays(days);
  const rows = activeDays.length > 0
    ? renderActiveDayRows(activeDays)
    : '<tr><td colspan="3">当前范围内暂无活跃日期数据</td></tr>';

  return [
    '<section class="panel"><h3>有值日期统计</h3>',
    '<table><thead><tr><th>日期</th><th>总时长</th><th>总行数</th></tr></thead>',
    `<tbody>${rows}</tbody></table></section>`
  ].join('');
}

function flattenSessions(projects) {
  const output = [];
  projects.forEach((project) => {
    project.sessions.forEach((session) => {
      output.push({
        repoPath: project.repoPath,
        branch: session.branch ?? project.branch,
        startTime: session.startTime,
        endTime: session.endTime,
        durationMs: session.durationMs ?? 0,
        trackedLocAdded: session.trackedLocAdded ?? session.locAdded ?? 0,
        trackedLocDeleted: session.trackedLocDeleted ?? session.locDeleted ?? 0,
        untrackedLocAdded: session.untrackedLocAdded ?? 0,
        untrackedLocDeleted: session.untrackedLocDeleted ?? 0,
        locAdded: session.locAdded ?? 0,
        locDeleted: session.locDeleted ?? 0
      });
    });
  });
  return output.sort((left, right) => (right.endTime ?? 0) - (left.endTime ?? 0));
}

function renderSessionRows(projects) {
  const sessions = flattenSessions(projects).slice(0, RECENT_SESSION_LIMIT);
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

function createRefreshScript(refreshIntervalMs) {
  return [
    '<script>',
    '(function(){',
    'const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;',
    'const btn = document.getElementById("refresh-btn");',
    'const select = document.getElementById("range-select");',
    'if (btn && vscode) { btn.addEventListener("click", function(){ vscode.postMessage({ type: "refresh-report" }); }); }',
    'if (select && vscode) { select.addEventListener("change", function(){ vscode.postMessage({ type: "refresh-report", periodType: select.value }); }); }',
    `if (vscode) { setInterval(function(){ vscode.postMessage({ type: "refresh-report" }); }, ${refreshIntervalMs}); }`,
    '})();',
    '</script>'
  ].join('');
}

function renderEmptyHtml() {
  return '<html><body><h2>Minimalist Dev Tracker</h2><p>暂无统计数据</p></body></html>';
}

function renderDailyReportHtml(dailyData, options = {}) {
  if (!dailyData || !dailyData.projects || Object.keys(dailyData.projects).length === 0) {
    return renderEmptyHtml();
  }

  const refreshIntervalMs = options.refreshIntervalMs ?? 30_000;
  const periodType = dailyData.periodType ?? 'rolling30';
  const projects = toProjectList(dailyData.projects);
  if (projects.length === 0) {
    return renderEmptyHtml();
  }

  const summary = aggregateSummary(projects);
  const fileTypeStats = aggregateByFileType(projects);
  const projectRows = renderProjectRows(projects);
  const fileTypeRows = renderFileTypeRows(fileTypeStats);
  const heatLineSection = renderHeatLineSection(dailyData.days, dailyData.dateRangeStart, dailyData.dateRangeEnd);
  const activeDaysSection = renderActiveDaysSection(dailyData.days);
  const sessionRows = renderSessionRows(projects);
  const rangeLabel = dailyData.dateRangeStart && dailyData.dateRangeEnd
    ? `${escapeHtml(dailyData.dateRangeStart)} ~ ${escapeHtml(dailyData.dateRangeEnd)}`
    : '';

  return [
    '<html>',
    '<head><meta charset="utf-8"><style>',
    ':root{--panel:#ffffff;--line:#d7ddd4;--text:#1d3430;--muted:#5a6f69;--accent:#0f7b62;}',
    'body{margin:0;background:linear-gradient(180deg,#e8f3ef,#f6f7f3);font-family:"Segoe UI",Arial,sans-serif;color:var(--text);padding:16px;}',
    '.header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;}',
    '.title{font-size:30px;font-weight:700;margin:0;}',
    '.range-picker{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);}',
    '.range-picker select{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 10px;color:var(--text);font:inherit;}',
    '.muted{color:var(--muted);font-size:12px;}',
    '.btn{border:0;background:var(--accent);color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer;font-weight:600;}',
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px;}',
    '.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;}',
    '.card h4{margin:0 0 6px 0;color:var(--muted);font-size:12px;}',
    '.card p{margin:0;font-size:20px;font-weight:700;}',
    '.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:12px;}',
    'h3{margin:0 0 8px 0;font-size:20px;}',
    'table{width:100%;border-collapse:collapse;}',
    'th,td{border:1px solid var(--line);padding:8px;text-align:left;font-size:13px;}',
    'th{background:#eef3f2;}',
    '.heatline-labels{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--muted);margin-bottom:10px;}',
    '.heatline-track{height:28px;border-radius:999px;border:1px solid rgba(15,123,98,0.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.25);}',
    '</style></head>',
    '<body>',
    '<div class="header">',
    `<div><h2 class="title">Minimalist Dev Tracker</h2><div class="muted">${escapeHtml(dailyData.periodLabel ?? periodType)}${rangeLabel ? ` · ${rangeLabel}` : ''}</div></div>`,
    `<div style="display:flex;align-items:center;gap:10px;">${renderPeriodSelector(periodType)}<button id="refresh-btn" class="btn">立即刷新</button></div>`,
    '</div>',
    `<p class="muted">自动刷新间隔：${escapeHtml(Math.floor(refreshIntervalMs / 1000))} 秒</p>`,
    renderSummaryCards(summary),
    heatLineSection,
    activeDaysSection,
    '<section class="panel"><h3>仓库 + 分支统计</h3>',
    '<table><thead><tr><th>仓库</th><th>分支</th><th>活跃时长</th><th>已跟踪变更</th><th>未跟踪新文件</th><th>总变更行</th><th>会话数</th></tr></thead>',
    `<tbody>${projectRows}</tbody></table></section>`,
    '<section class="panel"><h3>按文件类型统计</h3>',
    '<table><thead><tr><th>文件类型</th><th>新增代码行</th><th>删除代码行</th><th>总变更行</th></tr></thead>',
    `<tbody>${fileTypeRows || '<tr><td colspan="4">暂无按类型统计数据</td></tr>'}</tbody></table></section>`,
    '<section class="panel"><h3>最近会话</h3>',
    '<table><thead><tr><th>仓库</th><th>分支</th><th>开始</th><th>结束</th><th>时长</th><th>已跟踪变更</th><th>未跟踪新文件</th><th>总变更行</th></tr></thead>',
    `<tbody>${sessionRows || '<tr><td colspan="8">暂无会话数据</td></tr>'}</tbody></table></section>`,
    createRefreshScript(refreshIntervalMs),
    '</body>',
    '</html>'
  ].join('');
}

module.exports = {
  renderDailyReportHtml,
  formatDuration
};
