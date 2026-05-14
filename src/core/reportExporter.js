const fs = require('node:fs/promises');
const path = require('node:path');

const { toYaml } = require('./yamlSerializer');

const EMPTY_ARRAY_JSON = '[]';
const HTML_FILE_NAME = 'index.html';
const TRACKED_REPORT_FILE_NAME = 'report-git-tracked.html';
const TOTAL_REPORT_FILE_NAME = 'report-total.html';
const README_FILE_NAME = 'README.md';
const REPORT_DATA_FILE_NAME = 'report-data.js';
const REPORT_STYLES_FILE_NAME = 'report.css';
const ECHARTS_FILE_NAME = 'echarts.min.js';

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

function buildDataFileName(format) {
  return format === 'yaml' ? 'data.yaml' : 'data.json';
}

function serializeExportPayload(payload, format) {
  if (format === 'yaml') {
    return toYaml(payload);
  }
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function buildReportDataScript(payload) {
  return `window.__MINIMAL_TRACKER_EXPORT__ = ${JSON.stringify(payload)};\n`;
}

function buildReadme(input) {
  const metadata = input.payload.metadata ?? {};
  const scopeLabel = metadata.scopeType === 'currentProject' ? '当前项目' : '全部项目';
  const branchLabel = metadata.branchMode === 'current'
    ? `当前分支（${metadata.branchName ?? 'unknown'}）`
    : (metadata.branchMode === 'named' ? `指定分支（${metadata.branchName ?? 'unknown'}）` : '全部分支');
  const exportLabel = input.exportType === 'dataWithHtml' ? '数据 + 可视化 HTML + 说明文档' : '纯数据';
  const effectiveRange = `${metadata.startDate ?? '-'} ~ ${metadata.endDate ?? '-'}`;
  const requestedRange = `${metadata.requestedStartDate ?? '-'} ~ ${metadata.requestedEndDate ?? '-'}`;
  const includeRequestedRange = effectiveRange !== requestedRange;

  return [
    '# Minimalist Dev Tracker 导出说明',
    '',
    '## 导出范围',
    `- 导出类型：${exportLabel}`,
    `- 导出格式：${String(input.format).toUpperCase()}`,
    `- 导出目标：${scopeLabel}`,
    `- 导出分支：${branchLabel}`,
    `- 展示日期范围：${effectiveRange}`,
    ...(includeRequestedRange ? [`- 原始筛选范围：${requestedRange}`] : []),
    `- 导出时间：${metadata.exportedAtIso ?? '-'}`,
    '',
    '## 文件说明',
    `- \`${buildDataFileName(input.format)}\`：结构化原始数据`,
    '- `README.md`：本说明文件',
    ...(input.exportType === 'dataWithHtml'
      ? [
        '- `index.html`：报告入口页（可在两份报告间切换）',
        '- `report-git-tracked.html`：纯 Git 跟踪口径报告',
        '- `report-total.html`：包含未跟踪文件的总量口径报告',
        '- `report-data.js`：供 HTML 离线加载的数据桥接文件',
        '- `assets/echarts.min.js`：本地图表库',
        '- `assets/report.css`：分析页样式文件'
      ]
      : [])
  ].join('\n');
}

function buildOfflineStyles() {
  return [
    ':root{--bg:#f2f6f4;--panel:#ffffff;--line:#d1dad4;--text:#16322d;--muted:#4f6761;--accent:#0f7b62;--accent-2:#c67b2d;}',
    'body{margin:0;background:linear-gradient(180deg,#e4efe9,#f8faf8);color:var(--text);font-family:"Segoe UI",Arial,sans-serif;}',
    '.page{max-width:1360px;margin:0 auto;padding:24px;}',
    '.hero{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px;}',
    '.hero h1{margin:0;font-size:30px;line-height:1.2;}',
    '.hero p{margin:8px 0 0 0;color:var(--muted);font-size:14px;}',
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;}',
    '.card,.panel,.entry-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 24px rgba(16,48,40,0.06);}',
    '.card{padding:14px;}',
    '.card h2{margin:0 0 8px 0;font-size:13px;color:var(--muted);font-weight:600;}',
    '.card strong{font-size:24px;line-height:1.2;display:block;}',
    '.panel-stack{display:grid;grid-template-columns:1fr;gap:16px;}',
    '.panel{padding:16px;}',
    '.panel h2{margin:0 0 10px 0;font-size:21px;line-height:1.2;}',
    '.chart-single{height:420px;}',
    '.chart-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:stretch;}',
    '.chart-main,.chart-pie{height:420px;}',
    '.table-wrap{overflow:auto;}',
    'table{width:100%;border-collapse:collapse;}',
    'th,td{border:1px solid var(--line);padding:8px;text-align:left;font-size:13px;white-space:nowrap;}',
    'th{background:#eef4f1;}',
    '.muted{color:var(--muted);font-size:13px;}',
    '.empty-note{padding:14px;border-radius:10px;background:#f5f8f6;color:var(--muted);}',
    '.entry-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;}',
    '.entry-card{padding:18px;}',
    '.entry-card h2{margin:0 0 8px 0;font-size:20px;}',
    '.entry-card p{margin:0 0 12px 0;color:var(--muted);}',
    '.entry-card a{display:inline-block;padding:8px 12px;border-radius:10px;background:#0f7b62;color:#fff;text-decoration:none;}',
    '@media (max-width:900px){.page{padding:16px;}.hero{flex-direction:column;}.chart-row{grid-template-columns:1fr;}.chart-single,.chart-main,.chart-pie{height:340px;}}'
  ].join('\n');
}

function buildSummaryCards(payload, mode) {
  const summary = payload.summary ?? {};
  const cards = [
    { label: '总活跃时长', value: formatDuration(summary.totalActiveTimeMs ?? 0) },
    { label: '会话数', value: String(summary.sessionCount ?? 0) }
  ];
  if (mode === 'tracked') {
    cards.push(
      { label: 'Git 已跟踪总变更', value: String(summary.totalTrackedLoc ?? 0) },
      { label: '包含未跟踪文件的总变更', value: String(summary.totalLoc ?? 0) },
      { label: '未跟踪文件总变更', value: String(summary.totalUntrackedLoc ?? 0) }
    );
  } else {
    cards.push(
      { label: '包含未跟踪文件的总变更', value: String(summary.totalLoc ?? 0) },
      { label: 'Git 已跟踪总变更', value: String(summary.totalTrackedLoc ?? 0) },
      { label: '未跟踪文件总变更', value: String(summary.totalUntrackedLoc ?? 0) }
    );
  }
  cards.push({ label: '活跃日期数', value: String(summary.activeDayCount ?? 0) });

  return cards.map((item) => {
    return `<article class="card"><h2>${escapeHtml(item.label)}</h2><strong>${escapeHtml(item.value)}</strong></article>`;
  }).join('');
}

function buildSingleChartPanel(id, title) {
  return [
    '<section class="panel">',
    `<h2>${escapeHtml(title)}</h2>`,
    `<div id="${escapeHtml(id)}" class="chart-single"></div>`,
    '</section>'
  ].join('');
}

function buildDualChartPanel(mainId, pieId, title) {
  return [
    '<section class="panel">',
    `<h2>${escapeHtml(title)}</h2>`,
    '<div class="chart-row">',
    `<div id="${escapeHtml(mainId)}" class="chart-main"></div>`,
    `<div id="${escapeHtml(pieId)}" class="chart-pie"></div>`,
    '</div>',
    '</section>'
  ].join('');
}

function buildSessionTableMarkup(mode) {
  const totalLabel = mode === 'tracked' ? 'Git 已跟踪总变更' : '总变更行数';
  return [
    '<section class="panel">',
    '<h2>单次代码改动明细</h2>',
    '<div class="table-wrap">',
    '<table>',
    `<thead><tr><th>仓库</th><th>分支</th><th>开始时间</th><th>结束时间</th><th>时长</th><th>${escapeHtml(totalLabel)}</th><th>区间</th></tr></thead>`,
    '<tbody id="session-table-body"></tbody>',
    '</table>',
    '</div>',
    '</section>'
  ].join('');
}

function buildInlineScript(mode) {
  return [
    '(function(){',
    `const mode = ${JSON.stringify(mode)};`,
    'const payload = window.__MINIMAL_TRACKER_EXPORT__ || { days: [], sessions: [], projects: [], branches: [], fileTypes: [] };',
    'const metadata = payload.metadata || {};',
    'const dayList = Array.isArray(payload.days) ? payload.days : [];',
    'const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];',
    'const projectList = Array.isArray(payload.projects) ? payload.projects : [];',
    'const branchList = Array.isArray(payload.branches) ? payload.branches : [];',
    'const fileTypeList = Array.isArray(payload.fileTypes) ? payload.fileTypes : [];',
    'const threshold = Number(metadata.sessionSizeThreshold || 50);',
    'const hasEcharts = typeof window.echarts === "object" && window.echarts;',
    'const metricName = mode === "tracked" ? "Git 已跟踪口径" : "包含未跟踪文件总量";',
    'function sumLoc(added, deleted){ return (added || 0) + (deleted || 0); }',
    'function trackedLoc(item){ return item && item.trackedTotalLoc != null ? item.trackedTotalLoc : sumLoc(item && item.trackedLocAdded, item && item.trackedLocDeleted); }',
    'function totalLoc(item){ return item && item.totalLoc != null ? item.totalLoc : sumLoc(item && item.totalLocAdded, item && item.totalLocDeleted); }',
    'function metricLoc(item){ return mode === "tracked" ? trackedLoc(item) : totalLoc(item); }',
    'function dayMetricLoc(day){ return mode === "tracked" ? (day.trackedTotalLoc != null ? day.trackedTotalLoc : sumLoc(day.trackedLocAdded, day.trackedLocDeleted)) : totalLoc(day); }',
    'function toHours(ms){ return Number(((ms || 0) / 3600000).toFixed(2)); }',
    'function formatDuration(ms){ const sec = Math.floor((ms || 0) / 1000); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60; return h + "小时" + m + "分" + s + "秒"; }',
    'function formatDateTime(ts){ if (!ts) return "-"; return new Date(ts).toLocaleString(); }',
    'function safeChart(id){ const el = document.getElementById(id); return hasEcharts && el ? window.echarts.init(el) : null; }',
    'function mount(id, option){ const chart = safeChart(id); if (!chart) return; chart.setOption(option); window.addEventListener("resize", function(){ chart.resize(); }); }',
    'function baseGrid(){ return { left: 92, right: 24, top: 64, bottom: 56, containLabel: true }; }',
    'function axisLabel(){ return { formatter: function(v){ return Number(v || 0).toLocaleString("zh-CN"); } }; }',
    'function bucketEdges(){',
    '  return [',
    '    { label: "0-" + threshold, min: 0, max: threshold },',
    '    { label: (threshold + 1) + "-100", min: threshold + 1, max: 100 },',
    '    { label: "101-200", min: 101, max: 200 },',
    '    { label: "201-500", min: 201, max: 500 },',
    '    { label: "501-1000", min: 501, max: 1000 },',
    '    { label: "1000+", min: 1001, max: Number.POSITIVE_INFINITY }',
    '  ];',
    '}',
    'function bucketLabel(value){',
    '  const edges = bucketEdges();',
    '  for (let index = 0; index < edges.length; index += 1) {',
    '    const edge = edges[index];',
    '    if (value >= edge.min && value <= edge.max) return edge.label;',
    '  }',
    '  return edges[edges.length - 1].label;',
    '}',
    'function buildBuckets(){',
    '  const map = new Map();',
    '  bucketEdges().forEach(function(edge){ map.set(edge.label, { label: edge.label, count: 0, loc: 0, durationMs: 0 }); });',
    '  sessions.forEach(function(session){',
    '    const loc = metricLoc(session);',
    '    const label = bucketLabel(loc);',
    '    const bucket = map.get(label);',
    '    bucket.count += 1;',
    '    bucket.loc += loc;',
    '    bucket.durationMs += session.durationMs || 0;',
    '  });',
    '  return Array.from(map.values());',
    '}',
    'function buildHourBuckets(){',
    '  const buckets = Array.from({ length: 24 }, function(_, hour){ return { label: String(hour).padStart(2, "0") + ":00", value: 0 }; });',
    '  sessions.forEach(function(session){',
    '    const start = new Date(session.startTime); const end = new Date(session.endTime);',
    '    let cursor = start.getTime(); const limit = Math.max(end.getTime(), cursor);',
    '    while (cursor < limit) {',
    '      const current = new Date(cursor);',
    '      const bucketEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), current.getHours() + 1, 0, 0, 0).getTime();',
    '      const next = Math.min(bucketEnd, limit);',
    '      buckets[current.getHours()].value += Math.max(0, next - cursor);',
    '      if (next === cursor) break;',
    '      cursor = next;',
    '    }',
    '  });',
    '  return buckets.map(function(item){ return { label: item.label, value: toHours(item.value) }; });',
    '}',
    'function buildWeekdayBuckets(){',
    '  const labels = ["周日","周一","周二","周三","周四","周五","周六"];',
    '  const buckets = labels.map(function(label){ return { label: label, value: 0 }; });',
    '  dayList.forEach(function(day){ const index = new Date(day.date + "T00:00:00").getDay(); buckets[index].value += toHours(day.totalActiveTimeMs); });',
    '  return buckets;',
    '}',
    'function toPieData(items){ return items.filter(function(item){ return item.value > 0; }).map(function(item){ return { name: item.label, value: item.value }; }); }',
    'function mountBarPie(mainId, pieId, title, items, unit){',
    '  mount(mainId, {',
    '    tooltip: { trigger: "axis", valueFormatter: function(v){ return unit === "hours" ? Number(v || 0).toFixed(2) + " 小时" : Number(v || 0).toLocaleString("zh-CN"); } },',
    '    grid: baseGrid(), xAxis: { type: "category", data: items.map(function(item){ return item.label; }) },',
    '    yAxis: { type: "value", axisLabel: unit === "hours" ? { formatter: function(v){ return Number(v || 0).toFixed(1); } } : axisLabel() },',
    '    series: [{ type: "bar", data: items.map(function(item){ return item.value; }), itemStyle: { color: "#0f7b62" } }]',
    '  });',
    '  const pieData = toPieData(items);',
    '  mount(pieId, {',
    '    legend: { type: "scroll", orient: "vertical", top: 10, right: 4, bottom: 10 },',
    '    tooltip: { trigger: "item", valueFormatter: function(v){ return unit === "hours" ? Number(v || 0).toFixed(2) + " 小时" : Number(v || 0).toLocaleString("zh-CN"); } },',
    '    series: [{ type: "pie", radius: ["34%","62%"], center: ["34%","50%"], avoidLabelOverlap: true, label: { show: false }, labelLine: { show: false }, data: pieData }]',
    '  });',
    '}',
    'function toMetricSeries(items, key){',
    '  return items.map(function(item){ return { label: item.label, value: item[key] || 0 }; });',
    '}',
    'function mountSessionDistributionCharts(){',
    '  const buckets = buildBuckets();',
    '  mountBarPie("session-count-main-chart", "session-count-pie-chart", "单次代码改动行数分布（区间次数）", toMetricSeries(buckets, "count"), "loc");',
    '  mountBarPie("session-loc-main-chart", "session-loc-pie-chart", "单次代码改动行数分布（区间总代码行数）", toMetricSeries(buckets, "loc"), "loc");',
    '  mountBarPie("session-time-main-chart", "session-time-pie-chart", "单次代码改动行数分布（区间总花费时间）", toMetricSeries(buckets.map(function(item){ return { label: item.label, durationHours: toHours(item.durationMs) }; }), "durationHours"), "hours");',
    '}',
    'function mountDailyTrend(){',
    '  mount("daily-trend-chart", {',
    '    tooltip: {',
    '      trigger: "axis",',
    '      formatter: function(params){',
    '        if (!Array.isArray(params) || params.length === 0) return "";',
    '        const lines = [params[0].axisValueLabel || ""];',
    '        params.forEach(function(item){',
    '          const marker = item.marker || "";',
    '          const value = item.seriesName === "活跃时长(小时)"',
    '            ? Number(item.value || 0).toFixed(2) + " 小时"',
    '            : Number(item.value || 0).toLocaleString("zh-CN");',
    '          lines.push(marker + item.seriesName + " " + value);',
    '        });',
    '        return lines.join("<br/>");',
    '      }',
    '    }, legend: { top: 20 }, grid: baseGrid(),',
    '    xAxis: { type: "category", data: dayList.map(function(day){ return day.date; }) },',
    '    yAxis: [{ type: "value", name: "行数", axisLabel: axisLabel() }, { type: "value", name: "活跃时长(小时)", axisLabel: { formatter: function(v){ return Number(v || 0).toFixed(2); } } }],',
    '    series: [',
    '      { name: metricName + "总变更", type: "bar", data: dayList.map(function(day){ return dayMetricLoc(day); }), itemStyle: { color: "#0f7b62" } },',
    '      { name: "活跃时长(小时)", type: "line", yAxisIndex: 1, smooth: true, data: dayList.map(function(day){ return toHours(day.totalActiveTimeMs); }), itemStyle: { color: "#466f95" } }',
    '    ]',
    '  });',
    '}',
    'function mountProjectBranchCharts(){',
    '  if (metadata.showProjectContribution) {',
    '    mountBarPie("project-main-chart", "project-pie-chart", "项目贡献占比", projectList.map(function(item){ return { label: item.repoPath || "-", value: metricLoc(item) }; }), "loc");',
    '  }',
    '  if (metadata.showBranchContribution) {',
    '    mountBarPie("branch-main-chart", "branch-pie-chart", "分支贡献占比", branchList.map(function(item){ return { label: item.branch || "-", value: metricLoc(item) }; }), "loc");',
    '  }',
    '}',
    'mountDailyTrend();',
    'mountSessionDistributionCharts();',
    'mountProjectBranchCharts();',
    'mountBarPie("file-main-chart", "file-pie-chart", "文件类型分布", fileTypeList.map(function(item){ return { label: item.fileType || "-", value: mode === "tracked" ? sumLoc(item.trackedLocAdded, item.trackedLocDeleted) : sumLoc(item.locAdded, item.locDeleted) }; }), "loc");',
    'mountBarPie("weekday-main-chart", "weekday-pie-chart", "工作日分布", buildWeekdayBuckets(), "hours");',
    'mountBarPie("hour-main-chart", "hour-pie-chart", "每日代码总时段区段分析", buildHourBuckets(), "hours");',
    'const tbody = document.getElementById("session-table-body");',
    'if (tbody) {',
    '  if (!sessions.length) {',
    '    tbody.innerHTML = "<tr><td colspan=\\"7\\" class=\\"empty-note\\">当前导出范围内没有会话数据</td></tr>";',
    '  } else {',
    '    tbody.innerHTML = sessions.slice().sort(function(a, b){ return (b.endTime || 0) - (a.endTime || 0); }).map(function(session){',
    '      const value = metricLoc(session);',
    '      return "<tr>" +',
    '        "<td>" + (session.repoPath || "-") + "</td>" +',
    '        "<td>" + (session.branch || "-") + "</td>" +',
    '        "<td>" + formatDateTime(session.startTime) + "</td>" +',
    '        "<td>" + formatDateTime(session.endTime) + "</td>" +',
    '        "<td>" + formatDuration(session.durationMs || 0) + "</td>" +',
    '        "<td>" + Number(value || 0).toLocaleString("zh-CN") + "</td>" +',
    '        "<td>" + bucketLabel(value) + "</td>" +',
    '      "</tr>";',
    '    }).join("");',
    '  }',
    '}',
    '})();'
  ].join('');
}

function buildLandingHtml(payload) {
  const metadata = payload.metadata ?? {};
  const rangeLabel = `${metadata.startDate ?? '-'} ~ ${metadata.endDate ?? '-'}`;
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>导出报告入口</title><link rel="stylesheet" href="assets/report.css"></head>',
    '<body>',
    '<main class="page">',
    '<section class="hero"><div><h1>导出报告入口</h1><p>展示范围：' + escapeHtml(rangeLabel) + '</p></div><p class="muted">导出时间：' + escapeHtml(metadata.exportedAtIso ?? '-') + '</p></section>',
    '<section class="entry-grid">',
    '<article class="entry-card"><h2>纯 Git 跟踪口径</h2><p>仅统计 Git 已跟踪范围内的改动。</p><a href="./' + TRACKED_REPORT_FILE_NAME + '">打开报告</a></article>',
    '<article class="entry-card"><h2>包含未跟踪文件总量口径</h2><p>统计总改动，包含未跟踪文件影响。</p><a href="./' + TOTAL_REPORT_FILE_NAME + '">打开报告</a></article>',
    '</section>',
    '</main>',
    '</body></html>'
  ].join('');
}

function buildOfflineHtml(payload, mode) {
  const metadata = payload.metadata ?? {};
  const modeLabel = mode === 'tracked' ? '纯 Git 跟踪口径' : '包含未跟踪文件总量口径';
  const summaryLabel = `${metadata.startDate ?? '-'} ~ ${metadata.endDate ?? '-'}`;
  const requestedLabel = `${metadata.requestedStartDate ?? '-'} ~ ${metadata.requestedEndDate ?? '-'}`;
  const showRequestedLabel = summaryLabel !== requestedLabel;
  const projectPanel = metadata.showProjectContribution
    ? buildDualChartPanel('project-main-chart', 'project-pie-chart', '项目贡献占比')
    : '';
  const branchPanel = metadata.showBranchContribution
    ? buildDualChartPanel('branch-main-chart', 'branch-pie-chart', '分支贡献占比')
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Minimalist Dev Tracker Export</title>',
    '<link rel="stylesheet" href="assets/report.css">',
    '</head>',
    '<body>',
    '<main class="page">',
    '<section class="hero">',
    '<div>',
    '<h1>Minimalist Dev Tracker 导出分析</h1>',
    `<p>${escapeHtml(modeLabel)}</p>`,
    `<p>展示范围：${escapeHtml(summaryLabel)}</p>`,
    ...(showRequestedLabel ? [`<p>原始筛选：${escapeHtml(requestedLabel)}</p>`] : []),
    '</div>',
    `<p class="muted">导出时间：${escapeHtml(metadata.exportedAtIso ?? '-')}</p>`,
    '</section>',
    `<section class="cards">${buildSummaryCards(payload, mode)}</section>`,
    '<section class="panel-stack">',
    buildSingleChartPanel('daily-trend-chart', '每日代码行数变化趋势'),
    buildDualChartPanel('session-count-main-chart', 'session-count-pie-chart', '单次代码改动行数分布（区间次数）'),
    buildDualChartPanel('session-loc-main-chart', 'session-loc-pie-chart', '单次代码改动行数分布（区间总代码行数）'),
    buildDualChartPanel('session-time-main-chart', 'session-time-pie-chart', '单次代码改动行数分布（区间总花费时间）'),
    projectPanel,
    branchPanel,
    buildDualChartPanel('file-main-chart', 'file-pie-chart', '文件类型分布'),
    buildDualChartPanel('weekday-main-chart', 'weekday-pie-chart', '工作日分布'),
    buildDualChartPanel('hour-main-chart', 'hour-pie-chart', '每日代码总时段区段分析'),
    '</section>',
    buildSessionTableMarkup(mode),
    '</main>',
    '<script src="assets/echarts.min.js"></script>',
    '<script src="report-data.js"></script>',
    `<script>${buildInlineScript(mode)}</script>`,
    '</body>',
    '</html>'
  ].join('');
}

async function loadDefaultEchartsSource() {
  const sourcePath = path.join(__dirname, '..', '..', 'assets', 'echarts.min.js');
  return fs.readFile(sourcePath, 'utf8');
}

function createReportExporter(options = {}) {
  const mkdir = options.mkdir ?? fs.mkdir;
  const writeFile = options.writeFile ?? fs.writeFile;

  async function writeHtmlBundle(outputDir, payload) {
    const assetsDir = path.join(outputDir, 'assets');
    const echartsSource = options.echartsSource ?? await loadDefaultEchartsSource();
    await mkdir(assetsDir, { recursive: true });
    await writeFile(path.join(assetsDir, ECHARTS_FILE_NAME), echartsSource, 'utf8');
    await writeFile(path.join(assetsDir, REPORT_STYLES_FILE_NAME), buildOfflineStyles(), 'utf8');
    await writeFile(path.join(outputDir, REPORT_DATA_FILE_NAME), buildReportDataScript(payload), 'utf8');
    await writeFile(path.join(outputDir, HTML_FILE_NAME), buildLandingHtml(payload), 'utf8');
    await writeFile(path.join(outputDir, TRACKED_REPORT_FILE_NAME), buildOfflineHtml(payload, 'tracked'), 'utf8');
    await writeFile(path.join(outputDir, TOTAL_REPORT_FILE_NAME), buildOfflineHtml(payload, 'total'), 'utf8');
  }

  async function exportToDirectory(input) {
    await mkdir(input.outputDir, { recursive: true });
    const dataFilePath = path.join(input.outputDir, buildDataFileName(input.format));
    await writeFile(dataFilePath, serializeExportPayload(input.payload, input.format), 'utf8');
    await writeFile(path.join(input.outputDir, README_FILE_NAME), buildReadme(input), 'utf8');
    if (input.exportType === 'dataWithHtml') {
      await writeHtmlBundle(input.outputDir, input.payload);
    }
    return {
      outputDir: input.outputDir,
      dataFilePath,
      htmlFilePath: input.exportType === 'dataWithHtml' ? path.join(input.outputDir, HTML_FILE_NAME) : null
    };
  }

  return Object.freeze({
    exportToDirectory,
    _internals: {
      buildDataFileName,
      buildOfflineHtml,
      buildReadme,
      buildReportDataScript
    }
  });
}

module.exports = {
  createReportExporter,
  EMPTY_ARRAY_JSON
};
