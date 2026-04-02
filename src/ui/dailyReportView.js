const { toLocalDateKey } = require('../core/dateKey');

const MIN_BAR_PERCENT = 4;
const MAX_FILE_TYPE_CHANGES = 8;

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
    .filter((project) => (project.totalLocAdded + project.totalLocDeleted) > 0 || project.sessions.some((s) => ((s.locAdded ?? 0) + (s.locDeleted ?? 0)) > 0));
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

function buildDayBuckets(projects) {
  const bucketMap = new Map();
  projects.forEach((project) => {
    project.sessions.forEach((session) => {
      if (session.startTime === null || session.startTime === undefined) {
        return;
      }
      const start = new Date(session.startTime);
      const durationMs = session.durationMs ?? 0;
      if (Number.isNaN(start.getTime()) || durationMs <= 0) {
        return;
      }
      const dayKey = toLocalDateKey(start.getTime());
      const existing = bucketMap.get(dayKey) ?? { day: dayKey, durationMs: 0, sessions: 0 };
      bucketMap.set(dayKey, {
        day: dayKey,
        durationMs: existing.durationMs + durationMs,
        sessions: existing.sessions + 1
      });
    });
  });
  return [...bucketMap.values()].sort((left, right) => left.day.localeCompare(right.day));
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

function renderDayBarRows(dayBuckets) {
  const maxDurationMs = dayBuckets.reduce((maxValue, bucket) => Math.max(maxValue, bucket.durationMs), 0);
  return dayBuckets
    .map((bucket) => {
      const ratio = maxDurationMs === 0 ? 0 : (bucket.durationMs / maxDurationMs);
      const percent = Math.min(100, Math.max(MIN_BAR_PERCENT, Math.round(ratio * 100)));
      return [
        '<div class="day-bar-row">',
        `<div class="day-bar-day">${escapeHtml(bucket.day)}</div>`,
        `<div class="day-bar-duration">${escapeHtml(formatDuration(bucket.durationMs))}</div>`,
        '<div class="day-bar-track">',
        `<div class="day-bar-fill" style="width:${escapeHtml(percent)}%"></div>`,
        '</div>',
        `<div class="day-bar-count">${escapeHtml(bucket.sessions)} 会话</div>`,
        '</div>'
      ].join('');
    })
    .join('');
}

function renderDailyDurationSection(projects) {
  const dayBuckets = buildDayBuckets(projects);
  if (dayBuckets.length === 0) {
    return '';
  }
  return [
    '<section class="panel"><h3>按天活跃时长对比</h3>',
    '<div class="day-bars">',
    renderDayBarRows(dayBuckets),
    '</div>',
    '</section>'
  ].join('');
}

function formatShare(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function buildTrendBarRows(days, maxValue, valueKey) {
  return days.map((day) => {
    const value = day[valueKey] ?? 0;
    const ratio = maxValue === 0 ? 0 : value / maxValue;
    const percent = Math.min(100, Math.max(MIN_BAR_PERCENT, Math.round(ratio * 100)));
    return [
      '<div class="trend-row">',
      `<div class="trend-date">${escapeHtml(day.date)}</div>`,
      '<div class="trend-track">',
      `<div class="trend-fill" style="width:${escapeHtml(percent)}%"></div>`,
      '</div>',
      `<div class="trend-value">${escapeHtml(String(value))}</div>`,
      '</div>'
    ].join('');
  }).join('');
}

function renderTrendFileTypeChanges(fileTypeChanges) {
  if (!Array.isArray(fileTypeChanges) || fileTypeChanges.length === 0) {
    return '';
  }
  const rows = fileTypeChanges
    .slice(0, MAX_FILE_TYPE_CHANGES)
    .map((item) => {
      const deltaClass = item.deltaShare >= 0 ? 'trend-up' : 'trend-down';
      return [
        '<tr>',
        `<td>${escapeHtml(item.fileType)}</td>`,
        `<td>${escapeHtml(item.currentTotalLoc)}</td>`,
        `<td>${escapeHtml(formatShare(item.currentShare))}</td>`,
        `<td>${escapeHtml(formatShare(item.previousShare))}</td>`,
        `<td class="${deltaClass}">${escapeHtml(formatShare(item.deltaShare))}</td>`,
        '</tr>'
      ].join('');
    })
    .join('');
  return [
    '<div class="trend-filetype"><h4>文件类型分布变化</h4>',
    '<table><thead><tr><th>类型</th><th>当前总变更行</th><th>当前占比</th><th>上一窗口占比</th><th>变化</th></tr></thead>',
    `<tbody>${rows}</tbody></table></div>`
  ].join('');
}

function renderTrendWindowPanel(windowDays, windowData) {
  if (!windowData || !Array.isArray(windowData.days) || windowData.days.length === 0) {
    return '';
  }
  const maxActive = windowData.days.reduce((maxValue, day) => Math.max(maxValue, day.totalActiveTimeMs ?? 0), 0);
  const maxLoc = windowData.days.reduce((maxValue, day) => Math.max(maxValue, day.totalLoc ?? 0), 0);
  const activeRows = buildTrendBarRows(windowData.days, maxActive, 'totalActiveTimeMs');
  const locRows = buildTrendBarRows(windowData.days, maxLoc, 'totalLoc');
  const fileTypeSection = renderTrendFileTypeChanges(windowData.fileTypeChanges);
  return [
    `<section class="panel"><h3>近${escapeHtml(windowDays)}天趋势</h3>`,
    '<div class="trend-grid">',
    '<div><h4>趋势活跃时长</h4>',
    `<p class="muted">总计 ${escapeHtml(formatDuration(windowData.totals?.totalActiveTimeMs ?? 0))}</p>`,
    `<div class="trend-bars">${activeRows}</div></div>`,
    '<div><h4>趋势总变更行</h4>',
    `<p class="muted">+${escapeHtml(windowData.totals?.totalLocAdded ?? 0)} / -${escapeHtml(windowData.totals?.totalLocDeleted ?? 0)} / ${escapeHtml(windowData.totals?.totalLoc ?? 0)}</p>`,
    `<div class="trend-bars">${locRows}</div></div>`,
    '</div>',
    fileTypeSection,
    '</section>'
  ].join('');
}

function renderTrendPanels(trendData) {
  if (!trendData?.windows || typeof trendData.windows !== 'object') {
    return '';
  }
  const windows = Object.entries(trendData.windows)
    .sort((left, right) => Number(left[0]) - Number(right[0]));
  return windows
    .map(([windowDays, windowData]) => renderTrendWindowPanel(windowDays, windowData))
    .join('');
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
  const sessions = flattenSessions(projects).slice(0, 120);
  return sessions.map((session) => {
    const totalLoc = session.locAdded + session.locDeleted;
    return [
      '<tr>',
      `<td>${escapeHtml(session.repoPath)}</td>`,
      `<td>${escapeHtml(session.branch)}</td>`,
      `<td>${escapeHtml(formatTime(session.startTime))}</td>`,
      `<td>${escapeHtml(formatTime(session.endTime))}</td>`,
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
    'if (btn && vscode) { btn.addEventListener("click", function(){ vscode.postMessage({ type: "refresh-report" }); }); }',
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
  const projects = toProjectList(dailyData.projects);
  if (projects.length === 0) {
    return renderEmptyHtml();
  }
  const summary = aggregateSummary(projects);
  const fileTypeStats = aggregateByFileType(projects);
  const projectRows = renderProjectRows(projects);
  const fileTypeRows = renderFileTypeRows(fileTypeStats);
  const dailyDurationSection = renderDailyDurationSection(projects);
  const trendPanels = renderTrendPanels(options.trendData);
  const sessionRows = renderSessionRows(projects);

  return [
    '<html>',
    '<head><meta charset="utf-8"><style>',
    ':root{--bg:#f6f7f3;--panel:#ffffff;--line:#d7ddd4;--text:#1d3430;--muted:#5a6f69;--accent:#0f7b62;}',
    'body{margin:0;background:linear-gradient(180deg,#e8f3ef,#f6f7f3);font-family:"Segoe UI",Arial,sans-serif;color:var(--text);padding:16px;}',
    '.header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;}',
    '.title{font-size:30px;font-weight:700;margin:0;}',
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
    '.day-bars{display:flex;flex-direction:column;gap:8px;}',
    '.day-bar-row{display:grid;grid-template-columns:120px 120px 1fr 80px;align-items:center;gap:10px;}',
    '.day-bar-day,.day-bar-duration,.day-bar-count{font-size:13px;}',
    '.day-bar-track{height:12px;background:#e4ece9;border-radius:999px;overflow:hidden;}',
    '.day-bar-fill{height:100%;background:linear-gradient(90deg,#27a37d,#0f7b62);border-radius:999px;}',
    '.trend-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;}',
    '.trend-bars{display:flex;flex-direction:column;gap:6px;}',
    '.trend-row{display:grid;grid-template-columns:96px 1fr 80px;align-items:center;gap:8px;}',
    '.trend-date,.trend-value{font-size:12px;color:var(--muted);}',
    '.trend-track{height:10px;background:#e8efed;border-radius:999px;overflow:hidden;}',
    '.trend-fill{height:100%;background:linear-gradient(90deg,#66b89f,#0f7b62);border-radius:999px;}',
    '.trend-filetype{margin-top:10px;}',
    '.trend-filetype h4{margin:0 0 8px 0;}',
    '.trend-up{color:#117a37;font-weight:700;}',
    '.trend-down{color:#b83a3a;font-weight:700;}',
    '</style></head>',
    '<body>',
    '<div class="header">',
    `<h2 class="title">Minimalist Dev Tracker - ${escapeHtml(dailyData.date)}</h2>`,
    '<div><button id="refresh-btn" class="btn">立即刷新</button></div>',
    '</div>',
    `<p class="muted">自动刷新间隔：${escapeHtml(Math.floor(refreshIntervalMs / 1000))} 秒</p>`,
    renderSummaryCards(summary),
    '<section class="panel"><h3>仓库 + 分支统计</h3>',
    '<table><thead><tr><th>仓库</th><th>分支</th><th>活跃时长</th><th>已跟踪变更</th><th>未跟踪新文件</th><th>总变更行</th><th>会话数</th></tr></thead>',
    `<tbody>${projectRows}</tbody></table></section>`,
    '<section class="panel"><h3>按文件类型统计</h3>',
    '<table><thead><tr><th>文件类型</th><th>新增代码行</th><th>删除代码行</th><th>总变更行</th></tr></thead>',
    `<tbody>${fileTypeRows || '<tr><td colspan="4">暂无按类型统计数据</td></tr>'}</tbody></table></section>`,
    trendPanels,
    dailyDurationSection,
    '<section class="panel"><h3>会话明细</h3>',
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
