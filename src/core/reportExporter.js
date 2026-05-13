const fs = require('node:fs/promises');
const path = require('node:path');

const { toYaml } = require('./yamlSerializer');

const EMPTY_ARRAY_JSON = '[]';
const HTML_FILE_NAME = 'index.html';
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

  return [
    '# Minimalist Dev Tracker 导出说明',
    '',
    '## 导出范围',
    `- 导出类型：${exportLabel}`,
    `- 导出格式：${String(input.format).toUpperCase()}`,
    `- 导出目标：${scopeLabel}`,
    `- 导出分支：${branchLabel}`,
    `- 导出日期：${metadata.startDate ?? '-'} ~ ${metadata.endDate ?? '-'}`,
    `- 导出时间：${metadata.exportedAtIso ?? '-'}`,
    '',
    '## 文件说明',
    `- \`${buildDataFileName(input.format)}\`：结构化原始数据`,
    '- `README.md`：本说明文件',
    ...(input.exportType === 'dataWithHtml'
      ? [
        '- `index.html`：离线分析报告，Windows 下可直接双击打开',
        '- `report-data.js`：供 HTML 离线加载的数据桥接文件',
        '- `assets/echarts.min.js`：本地图表库',
        '- `assets/report.css`：分析页样式文件'
      ]
      : []),
    '',
    '## 图表说明',
    '- 每日代码行数变化趋势：按天展示新增、删除和总变更量。',
    '- 每日代码总时段区段分析：统计所有会话在 24 小时内的活跃分布。',
    '- 单次代码改动表格：列出每次会话的时段、时长和变更量级。',
    '- 其他辅助图表：项目贡献、分支贡献、文件类型分布、工作日分布。',
    '',
    '## 指标限制',
    '- 数据来自本地跟踪到的编码会话，不代表完整 Git 历史。',
    '- 未纳入 Git 的文件会单独计入未纳入 Git 的变更统计。',
    '- HTML 报告使用导出时刻的快照，不会自动刷新。'
  ].join('\n');
}

function buildOfflineStyles() {
  return [
    ':root{--bg:#f4f6f4;--panel:#ffffff;--line:#d7ddd4;--text:#1d3430;--muted:#5a6f69;--accent:#0f7b62;}',
    'body{margin:0;background:linear-gradient(180deg,#e6efe9,#f8f9f6);color:var(--text);font-family:"Segoe UI",Arial,sans-serif;}',
    '.page{max-width:1280px;margin:0 auto;padding:24px;}',
    '.hero{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:16px;}',
    '.hero h1{margin:0;font-size:32px;}',
    '.hero p{margin:8px 0 0 0;color:var(--muted);font-size:14px;}',
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;}',
    '.card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 26px rgba(16,48,40,0.06);}',
    '.card{padding:14px;}',
    '.card h2{margin:0 0 8px 0;font-size:13px;color:var(--muted);}',
    '.card strong{font-size:24px;}',
    '.panel{padding:16px;margin-bottom:16px;}',
    '.panel h2{margin:0 0 12px 0;font-size:20px;}',
    '.panel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;}',
    '.chart{height:320px;}',
    '.table-wrap{overflow:auto;}',
    'table{width:100%;border-collapse:collapse;}',
    'th,td{border:1px solid var(--line);padding:8px;text-align:left;font-size:13px;white-space:nowrap;}',
    'th{background:#eef3f2;}',
    '.muted{color:var(--muted);font-size:13px;}',
    '.empty-note{padding:16px;border-radius:12px;background:#f4f8f6;color:var(--muted);}',
    '@media (max-width:720px){.page{padding:16px;}.hero{flex-direction:column;}.panel-grid{grid-template-columns:1fr;}}'
  ].join('\n');
}

function buildSummaryCards(payload) {
  const summary = payload.summary ?? {};
  return [
    { label: '总活跃时长', value: formatDuration(summary.totalActiveTimeMs ?? 0) },
    { label: '会话数', value: String(summary.sessionCount ?? 0) },
    { label: '总变更行', value: String(summary.totalLoc ?? 0) },
    { label: '活跃日期数', value: String(summary.activeDayCount ?? 0) }
  ].map((item) => {
    return `<article class="card"><h2>${escapeHtml(item.label)}</h2><strong>${escapeHtml(item.value)}</strong></article>`;
  }).join('');
}

function buildChartPanel(id, title, description) {
  return [
    '<section class="panel">',
    `<h2>${escapeHtml(title)}</h2>`,
    `<p class="muted">${escapeHtml(description)}</p>`,
    `<div id="${escapeHtml(id)}" class="chart"></div>`,
    '</section>'
  ].join('');
}

function buildSessionTableMarkup() {
  return [
    '<section class="panel">',
    '<h2>单次代码改动明细</h2>',
    '<p class="muted">按会话列出开始/结束时段、时长、变更量与量级区间。</p>',
    '<div class="table-wrap">',
    '<table>',
    '<thead><tr><th>仓库</th><th>分支</th><th>开始时间</th><th>结束时间</th><th>时长</th><th>已跟踪新增</th><th>已跟踪删除</th><th>未纳入 Git 新增</th><th>未纳入 Git 删除</th><th>总变更行数</th><th>变更量级区间</th></tr></thead>',
    '<tbody id="session-table-body"></tbody>',
    '</table>',
    '</div>',
    '</section>'
  ].join('');
}

function buildOfflineHtml(payload) {
  const metadata = payload.metadata ?? {};
  const filterSummary = `${metadata.startDate ?? '-'} ~ ${metadata.endDate ?? '-'} · ${metadata.scopeType === 'currentProject' ? '当前项目' : '全部项目'}`;

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
    `<p>${escapeHtml(filterSummary)}</p>`,
    '</div>',
    `<p class="muted">导出时间：${escapeHtml(metadata.exportedAtIso ?? '-')}</p>`,
    '</section>',
    `<section class="cards">${buildSummaryCards(payload)}</section>`,
    '<section class="panel-grid">',
    buildChartPanel('daily-loc-chart', '每日代码行数变化趋势', '按天展示新增、删除、总变更行数，并附带活跃时长线。'),
    buildChartPanel('hour-distribution-chart', '每日代码总时段区段分析', '汇总所有会话在 24 小时内的活跃时长分布。'),
    buildChartPanel('project-contribution-chart', '项目贡献占比', '展示导出范围内各项目的总变更量。'),
    buildChartPanel('branch-contribution-chart', '分支贡献占比', '展示导出范围内各分支的总变更量。'),
    buildChartPanel('file-type-chart', '文件类型分布', '按文件类型汇总新增与删除行数。'),
    buildChartPanel('weekday-chart', '工作日分布', '查看一周七天内的活跃时长分布。'),
    '</section>',
    buildSessionTableMarkup(),
    '<section class="panel"><h2>说明</h2><div class="muted">本报告基于导出时刻的数据快照生成，可离线打开，不会自动刷新。</div></section>',
    '</main>',
    '<script src="assets/echarts.min.js"></script>',
    '<script src="report-data.js"></script>',
    '<script>',
    '(function(){',
    'const payload = window.__MINIMAL_TRACKER_EXPORT__ || { days: [], sessions: [], projects: [], branches: [] };',
    'const dayList = Array.isArray(payload.days) ? payload.days : [];',
    'const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];',
    'const projectList = Array.isArray(payload.projects) ? payload.projects : [];',
    'const branchList = Array.isArray(payload.branches) ? payload.branches : [];',
    'const hasEcharts = typeof window.echarts === "object" && window.echarts;',
    'function safeChart(id){ const el = document.getElementById(id); return hasEcharts && el ? window.echarts.init(el) : null; }',
    'function totalLoc(item){ return (item.totalLoc ?? ((item.totalLocAdded ?? item.totalLocAdded) + (item.totalLocDeleted ?? item.totalLocDeleted))) || 0; }',
    'function hourBuckets(){',
    '  const buckets = Array.from({ length: 24 }, function(_, hour){ return { label: String(hour).padStart(2, "0") + ":00", value: 0 }; });',
    '  sessions.forEach(function(session){',
    '    const start = new Date(session.startTime);',
    '    const end = new Date(session.endTime);',
    '    let cursor = start.getTime();',
    '    const limit = Math.max(end.getTime(), cursor);',
    '    while (cursor < limit) {',
    '      const current = new Date(cursor);',
    '      const bucketEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), current.getHours() + 1, 0, 0, 0).getTime();',
    '      const next = Math.min(bucketEnd, limit);',
    '      buckets[current.getHours()].value += Math.max(0, next - cursor);',
    '      if (next === cursor) break;',
    '      cursor = next;',
    '    }',
    '  });',
    '  return buckets;',
    '}',
    'function weekdayBuckets(){',
    '  const labels = ["周日","周一","周二","周三","周四","周五","周六"];',
    '  const buckets = labels.map(function(label){ return { label: label, value: 0 }; });',
    '  dayList.forEach(function(day){ buckets[new Date(day.date + "T00:00:00").getDay()].value += day.totalActiveTimeMs || 0; });',
    '  return buckets;',
    '}',
    'function mountBarChart(id, title, labels, values){',
    '  const chart = safeChart(id);',
    '  if (!chart) return;',
    '  chart.setOption({ tooltip: {}, title: { text: title, left: "center" }, grid: { left: 50, right: 20, top: 50, bottom: 40 }, xAxis: { type: "category", data: labels }, yAxis: { type: "value" }, series: [{ type: "bar", data: values, itemStyle: { color: "#0f7b62" } }] });',
    '  window.addEventListener("resize", function(){ chart.resize(); });',
    '};',
    'function mountDailyTrend(){',
    '  const chart = safeChart("daily-loc-chart");',
    '  if (!chart) return;',
    '  chart.setOption({',
    '    tooltip: { trigger: "axis" },',
    '    legend: { top: 24 },',
    '    grid: { left: 50, right: 50, top: 60, bottom: 40 },',
    '    xAxis: { type: "category", data: dayList.map(function(day){ return day.date; }) },',
    '    yAxis: [{ type: "value", name: "行数" }, { type: "value", name: "时长(ms)" }],',
    '    series: [',
    '      { name: "总变更", type: "bar", data: dayList.map(function(day){ return day.totalLoc || 0; }), itemStyle: { color: "#8ecdb6" } },',
    '      { name: "新增", type: "line", smooth: true, data: dayList.map(function(day){ return day.totalLocAdded || 0; }), itemStyle: { color: "#0f7b62" } },',
    '      { name: "删除", type: "line", smooth: true, data: dayList.map(function(day){ return day.totalLocDeleted || 0; }), itemStyle: { color: "#b65f4a" } },',
    '      { name: "活跃时长", type: "line", smooth: true, yAxisIndex: 1, data: dayList.map(function(day){ return day.totalActiveTimeMs || 0; }), itemStyle: { color: "#334e68" } }',
    '    ]',
    '  });',
    '  window.addEventListener("resize", function(){ chart.resize(); });',
    '}',
    'function mountSessionTable(){',
    '  const tbody = document.getElementById("session-table-body");',
    '  if (!tbody) return;',
    '  if (!sessions.length) { tbody.innerHTML = "<tr><td colspan=\\"11\\" class=\\"empty-note\\">当前导出范围内没有会话数据</td></tr>"; return; }',
    '  function bucket(total){ if (total >= 1000) return "1000+"; if (total >= 500) return "500-999"; if (total >= 200) return "200-499"; if (total >= 50) return "50-199"; return "0-49"; }',
    '  function format(ts){ if (!ts) return "-"; return new Date(ts).toLocaleString(); }',
    '  function duration(ms){ const totalSeconds = Math.floor((ms || 0) / 1000); const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60; return hours + "小时" + minutes + "分" + seconds + "秒"; }',
    '  tbody.innerHTML = sessions.map(function(session){',
    '    const total = (session.locAdded || 0) + (session.locDeleted || 0);',
    '    return "<tr>" +',
    '      "<td>" + (session.repoPath || "-") + "</td>" +',
    '      "<td>" + (session.branch || "-") + "</td>" +',
    '      "<td>" + format(session.startTime) + "</td>" +',
    '      "<td>" + format(session.endTime) + "</td>" +',
    '      "<td>" + duration(session.durationMs) + "</td>" +',
    '      "<td>" + (session.trackedLocAdded || 0) + "</td>" +',
    '      "<td>" + (session.trackedLocDeleted || 0) + "</td>" +',
    '      "<td>" + (session.untrackedLocAdded || 0) + "</td>" +',
    '      "<td>" + (session.untrackedLocDeleted || 0) + "</td>" +',
    '      "<td>" + total + "</td>" +',
    '      "<td>" + bucket(total) + "</td>" +',
    '    "</tr>";',
    '  }).join("");',
    '}',
    'mountDailyTrend();',
    'const hourData = hourBuckets();',
    'mountBarChart("hour-distribution-chart", "24 小时活跃分布", hourData.map(function(item){ return item.label; }), hourData.map(function(item){ return item.value; }));',
    'mountBarChart("project-contribution-chart", "项目总变更行数", projectList.map(function(item){ return item.repoPath || item.name || "-"; }), projectList.map(function(item){ return totalLoc(item); }));',
    'mountBarChart("branch-contribution-chart", "分支总变更行数", branchList.map(function(item){ return item.branch || "-"; }), branchList.map(function(item){ return totalLoc(item); }));',
    'mountBarChart("file-type-chart", "文件类型总变更行数", (payload.fileTypes || []).map(function(item){ return item.fileType || "-"; }), (payload.fileTypes || []).map(function(item){ return (item.locAdded || 0) + (item.locDeleted || 0); }));',
    'const weekdayData = weekdayBuckets();',
    'mountBarChart("weekday-chart", "工作日活跃分布", weekdayData.map(function(item){ return item.label; }), weekdayData.map(function(item){ return item.value; }));',
    'mountSessionTable();',
    '})();',
    '</script>',
    '</body>',
    '</html>'
  ].join('');
}

async function loadDefaultEchartsSource() {
  const sourcePath = require.resolve('echarts/dist/echarts.min.js');
  return fs.readFile(sourcePath, 'utf8');
}

function createReportExporter(options = {}) {
  const mkdir = options.mkdir ?? fs.mkdir;
  const readFile = options.readFile ?? fs.readFile;
  const writeFile = options.writeFile ?? fs.writeFile;

  async function writeHtmlBundle(outputDir, payload, format) {
    const assetsDir = path.join(outputDir, 'assets');
    const echartsSource = options.echartsSource ?? await loadDefaultEchartsSource();
    await mkdir(assetsDir, { recursive: true });
    await writeFile(path.join(assetsDir, ECHARTS_FILE_NAME), echartsSource, 'utf8');
    await writeFile(path.join(assetsDir, REPORT_STYLES_FILE_NAME), buildOfflineStyles(), 'utf8');
    await writeFile(path.join(outputDir, REPORT_DATA_FILE_NAME), buildReportDataScript(payload), 'utf8');
    await writeFile(path.join(outputDir, HTML_FILE_NAME), buildOfflineHtml(payload), 'utf8');
    const dataFilePath = path.join(outputDir, buildDataFileName(format));
    await writeFile(dataFilePath, serializeExportPayload(payload, format), 'utf8');
  }

  async function exportToDirectory(input) {
    await mkdir(input.outputDir, { recursive: true });
    const dataFilePath = path.join(input.outputDir, buildDataFileName(input.format));
    await writeFile(dataFilePath, serializeExportPayload(input.payload, input.format), 'utf8');
    await writeFile(path.join(input.outputDir, README_FILE_NAME), buildReadme(input), 'utf8');
    if (input.exportType === 'dataWithHtml') {
      await writeHtmlBundle(input.outputDir, input.payload, input.format);
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
      buildReportDataScript,
      readFile
    }
  });
}

module.exports = {
  createReportExporter,
  EMPTY_ARRAY_JSON
};
