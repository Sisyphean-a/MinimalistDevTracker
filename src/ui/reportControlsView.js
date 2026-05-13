const REPORT_PERIOD_OPTIONS = [
  { value: 'rolling30', label: '最近30天' },
  { value: 'month', label: '本月' },
  { value: 'rolling90', label: '最近3个月' },
  { value: 'rolling180', label: '最近半年' },
  { value: 'rolling365', label: '最近1年' },
  { value: 'all', label: '全部' }
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveExportDefaults(input = {}) {
  return {
    exportType: input.exportType ?? 'dataWithHtml',
    format: input.format ?? 'json',
    scopeType: input.scopeType ?? 'currentProject',
    branchMode: input.branchMode ?? 'current',
    branchName: input.branchName ?? null,
    currentBranch: input.currentBranch ?? null,
    branchOptions: Array.isArray(input.branchOptions) ? input.branchOptions : [],
    startDate: input.startDate ?? '',
    endDate: input.endDate ?? ''
  };
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

function renderBranchOptions(defaults) {
  const options = [];
  const currentLabel = defaults.currentBranch
    ? `当前分支（${defaults.currentBranch}）`
    : '当前分支';
  const selectedNamedBranch = defaults.branchMode === 'named' ? defaults.branchName : null;

  options.push(`<option value="current"${defaults.branchMode === 'current' ? ' selected' : ''}>${escapeHtml(currentLabel)}</option>`);
  options.push(`<option value="all"${defaults.branchMode === 'all' ? ' selected' : ''}>全部分支</option>`);

  defaults.branchOptions
    .filter((branch) => branch && branch !== defaults.currentBranch)
    .forEach((branch) => {
      const selected = selectedNamedBranch === branch ? ' selected' : '';
      options.push(`<option value="named:${escapeHtml(branch)}"${selected}>${escapeHtml(branch)}</option>`);
    });

  return options.join('');
}

function renderExportPanel(input) {
  const defaults = resolveExportDefaults(input);
  const branchDisabled = defaults.scopeType === 'currentProject' ? '' : ' disabled';

  return [
    '<section id="export-panel" class="panel export-panel hidden">',
    '<div class="panel-header"><h3>导出</h3><p class="muted">默认值已按“数据 + 可视化 HTML + 说明文档 / JSON / 当前项目 / 当前分支 / 最近一个月”预填。</p></div>',
    '<div class="export-grid">',
    `<label><span>导出类型</span><select id="export-type-select"><option value="dataOnly"${defaults.exportType === 'dataOnly' ? ' selected' : ''}>纯数据</option><option value="dataWithHtml"${defaults.exportType === 'dataWithHtml' ? ' selected' : ''}>数据 + 可视化 HTML + 说明文档</option></select></label>`,
    `<label><span>导出格式</span><select id="export-format-select"><option value="json"${defaults.format === 'json' ? ' selected' : ''}>JSON</option><option value="yaml"${defaults.format === 'yaml' ? ' selected' : ''}>YAML</option></select></label>`,
    `<label><span>导出目标</span><select id="export-scope-select"><option value="currentProject"${defaults.scopeType === 'currentProject' ? ' selected' : ''}>当前项目</option><option value="all"${defaults.scopeType === 'all' ? ' selected' : ''}>全部</option></select></label>`,
    `<label><span>导出分支</span><select id="export-branch-select"${branchDisabled}>${renderBranchOptions(defaults)}</select></label>`,
    `<label><span>开始日期</span><input id="export-start-date" type="date" value="${escapeHtml(defaults.startDate)}"></label>`,
    `<label><span>结束日期</span><input id="export-end-date" type="date" value="${escapeHtml(defaults.endDate)}"></label>`,
    '</div>',
    '<div id="export-error" class="muted export-error"></div>',
    '<div class="toolbar-actions"><button id="export-submit-btn" class="btn">导出到文件夹</button></div>',
    '</section>'
  ].join('');
}

function createClientScript() {
  return [
    '<script>',
    '(function(){',
    'const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;',
    'const refreshBtn = document.getElementById("refresh-btn");',
    'const rangeSelect = document.getElementById("range-select");',
    'const exportToggleBtn = document.getElementById("export-toggle-btn");',
    'const exportPanel = document.getElementById("export-panel");',
    'const exportTypeSelect = document.getElementById("export-type-select");',
    'const exportFormatSelect = document.getElementById("export-format-select");',
    'const exportScopeSelect = document.getElementById("export-scope-select");',
    'const exportBranchSelect = document.getElementById("export-branch-select");',
    'const exportStartDate = document.getElementById("export-start-date");',
    'const exportEndDate = document.getElementById("export-end-date");',
    'const exportSubmitBtn = document.getElementById("export-submit-btn");',
    'const exportError = document.getElementById("export-error");',
    'function setExportError(message){ if (exportError) { exportError.textContent = message || ""; } }',
    'function syncBranchState(){ if (exportScopeSelect && exportBranchSelect) { exportBranchSelect.disabled = exportScopeSelect.value !== "currentProject"; } }',
    'if (refreshBtn && vscode) { refreshBtn.addEventListener("click", function(){ vscode.postMessage({ type: "refresh-report" }); }); }',
    'if (rangeSelect && vscode) { rangeSelect.addEventListener("change", function(){ vscode.postMessage({ type: "refresh-report", periodType: rangeSelect.value }); }); }',
    'if (exportToggleBtn && exportPanel) { exportToggleBtn.addEventListener("click", function(){ exportPanel.classList.toggle("hidden"); }); }',
    'if (exportScopeSelect) { exportScopeSelect.addEventListener("change", syncBranchState); syncBranchState(); }',
    'if (exportSubmitBtn && vscode) { exportSubmitBtn.addEventListener("click", function(){',
    '  setExportError("");',
    '  if (!exportStartDate || !exportEndDate || !exportStartDate.value || !exportEndDate.value) { setExportError("请选择完整的导出日期范围。"); return; }',
    '  if (exportStartDate.value > exportEndDate.value) { setExportError("开始日期不能晚于结束日期。"); return; }',
    '  let branchMode = "all";',
    '  let branchName = null;',
    '  if (exportScopeSelect && exportScopeSelect.value === "currentProject" && exportBranchSelect) {',
    '    const rawBranchValue = exportBranchSelect.value;',
    '    if (rawBranchValue === "current" || rawBranchValue === "all") { branchMode = rawBranchValue; }',
    '    else if (rawBranchValue.indexOf("named:") === 0) { branchMode = "named"; branchName = rawBranchValue.slice(6); }',
    '  }',
    '  vscode.postMessage({',
    '    type: "export-report",',
    '    exportType: exportTypeSelect ? exportTypeSelect.value : "dataWithHtml",',
    '    format: exportFormatSelect ? exportFormatSelect.value : "json",',
    '    scopeType: exportScopeSelect ? exportScopeSelect.value : "currentProject",',
    '    branchMode: branchMode,',
    '    branchName: branchName,',
    '    startDate: exportStartDate.value,',
    '    endDate: exportEndDate.value',
    '  });',
    '}); }',
    '})();',
    '</script>'
  ].join('');
}

module.exports = {
  REPORT_PERIOD_OPTIONS,
  createClientScript,
  renderExportPanel,
  renderPeriodSelector
};
