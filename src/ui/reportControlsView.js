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
    projectBranchOptions: Array.isArray(input.projectBranchOptions) ? input.projectBranchOptions : [],
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

function encodeProjectBranchValue(repoPath, branch) {
  return JSON.stringify({ repoPath, branch });
}

function groupProjectBranches(options) {
  const output = new Map();

  options.forEach((item) => {
    const repoPath = item?.repoPath ?? '';
    const branch = item?.branch ?? 'unknown';
    if (!repoPath) {
      return;
    }
    const branchSet = output.get(repoPath) ?? new Set();
    branchSet.add(branch);
    output.set(repoPath, branchSet);
  });

  return [...output.entries()]
    .map(([repoPath, branchSet]) => {
      return {
        repoPath,
        branches: [...branchSet].sort((left, right) => left.localeCompare(right))
      };
    })
    .sort((left, right) => left.repoPath.localeCompare(right.repoPath));
}

function renderProjectBranchMatrix(defaults) {
  const rows = groupProjectBranches(defaults.projectBranchOptions);
  if (rows.length === 0) {
    return '<div class="muted">当前时间范围没有可选项目分支。</div>';
  }

  const rowMarkup = rows.map((item, rowIndex) => {
    const branchMarkup = item.branches.map((branch, branchIndex) => {
      const value = encodeProjectBranchValue(item.repoPath, branch);
      const id = `export-custom-branch-${rowIndex}-${branchIndex}`;
      return [
        `<label class="project-branch-branch" for="${escapeHtml(id)}">`,
        `<input id="${escapeHtml(id)}" class="export-custom-branch-item" type="checkbox" value="${escapeHtml(value)}" checked>`,
        `<span>${escapeHtml(branch)}</span>`,
        '</label>'
      ].join('');
    }).join('');

    return [
      `<div class="project-branch-row" data-repo-path="${escapeHtml(item.repoPath)}">`,
      '<div class="project-branch-repo">',
      `<input id="export-custom-project-${escapeHtml(String(rowIndex))}" class="export-custom-project-enabled" type="checkbox" checked>`,
      `<label for="export-custom-project-${escapeHtml(String(rowIndex))}" class="project-branch-repo-label">${escapeHtml(item.repoPath)}</label>`,
      '</div>',
      `<div class="project-branch-branches">${branchMarkup}</div>`,
      '</div>'
    ].join('');
  }).join('');

  return [
    '<div class="project-branch-matrix-head">',
    '<span>项目</span>',
    '<span>分支（可多选）</span>',
    '</div>',
    `<div class="project-branch-matrix-body">${rowMarkup}</div>`
  ].join('');
}

function renderExportPanel(input) {
  const defaults = resolveExportDefaults(input);
  const branchDisabled = defaults.scopeType === 'currentProject' ? '' : ' disabled';
  const customHiddenClass = defaults.scopeType === 'custom' ? '' : ' hidden';

  return [
    '<section id="export-panel" class="panel export-panel hidden">',
    '<div class="panel-header"><h3>导出</h3><p class="muted">默认值已按“数据 + 可视化 HTML + 说明文档 / JSON / 当前项目 / 当前分支 / 最近一个月”预填。</p></div>',
    '<div class="export-grid">',
    `<label><span>导出类型</span><select id="export-type-select"><option value="dataOnly"${defaults.exportType === 'dataOnly' ? ' selected' : ''}>纯数据</option><option value="dataWithHtml"${defaults.exportType === 'dataWithHtml' ? ' selected' : ''}>数据 + 可视化 HTML + 说明文档</option></select></label>`,
    `<label><span>导出格式</span><select id="export-format-select"><option value="json"${defaults.format === 'json' ? ' selected' : ''}>JSON</option><option value="yaml"${defaults.format === 'yaml' ? ' selected' : ''}>YAML</option></select></label>`,
    `<label><span>导出目标</span><select id="export-scope-select"><option value="currentProject"${defaults.scopeType === 'currentProject' ? ' selected' : ''}>当前项目</option><option value="custom"${defaults.scopeType === 'custom' ? ' selected' : ''}>自定义（多选）</option><option value="all"${defaults.scopeType === 'all' ? ' selected' : ''}>全部</option></select></label>`,
    `<label><span>导出分支</span><select id="export-branch-select"${branchDisabled}>${renderBranchOptions(defaults)}</select></label>`,
    `<section id="export-custom-project-branch-wrap" class="project-branch-matrix ${customHiddenClass}"><h4>自定义项目 + 分支</h4>${renderProjectBranchMatrix(defaults)}</section>`,
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
    'const exportCustomProjectBranchWrap = document.getElementById("export-custom-project-branch-wrap");',
    'const exportStartDate = document.getElementById("export-start-date");',
    'const exportEndDate = document.getElementById("export-end-date");',
    'const exportSubmitBtn = document.getElementById("export-submit-btn");',
    'const exportError = document.getElementById("export-error");',
    'function setExportError(message){ if (exportError) { exportError.textContent = message || ""; } }',
    'function getCustomRows(){ return Array.from(document.querySelectorAll(".project-branch-row")); }',
    'function syncExportScopeState(){',
    '  if (!exportScopeSelect) { return; }',
    '  const scopeType = exportScopeSelect.value;',
    '  if (exportBranchSelect) { exportBranchSelect.disabled = scopeType !== "currentProject"; }',
    '  if (exportCustomProjectBranchWrap) {',
    '    if (scopeType === "custom") { exportCustomProjectBranchWrap.classList.remove("hidden"); }',
    '    else { exportCustomProjectBranchWrap.classList.add("hidden"); }',
    '  }',
    '  getCustomRows().forEach(function(row){',
    '    const repoToggle = row.querySelector(".export-custom-project-enabled");',
    '    const branchItems = Array.from(row.querySelectorAll(".export-custom-branch-item"));',
    '    const enabled = scopeType === "custom" && (!repoToggle || repoToggle.checked);',
    '    branchItems.forEach(function(item){ item.disabled = !enabled; });',
    '  });',
    '}',
    'function syncCustomRowState(row){',
    '  const repoToggle = row.querySelector(".export-custom-project-enabled");',
    '  const branchItems = Array.from(row.querySelectorAll(".export-custom-branch-item"));',
    '  const scopeType = exportScopeSelect ? exportScopeSelect.value : "currentProject";',
    '  const enabled = scopeType === "custom" && (!repoToggle || repoToggle.checked);',
    '  branchItems.forEach(function(item){ item.disabled = !enabled; });',
    '  if (enabled && branchItems.filter(function(item){ return item.checked; }).length === 0 && branchItems.length > 0) {',
    '    branchItems[0].checked = true;',
    '  }',
    '}',
    'if (refreshBtn && vscode) { refreshBtn.addEventListener("click", function(){ vscode.postMessage({ type: "refresh-report" }); }); }',
    'if (rangeSelect && vscode) { rangeSelect.addEventListener("change", function(){ vscode.postMessage({ type: "refresh-report", periodType: rangeSelect.value }); }); }',
    'if (exportToggleBtn && exportPanel) { exportToggleBtn.addEventListener("click", function(){ exportPanel.classList.toggle("hidden"); }); }',
    'if (exportScopeSelect) { exportScopeSelect.addEventListener("change", syncExportScopeState); syncExportScopeState(); }',
    'getCustomRows().forEach(function(row){',
    '  const repoToggle = row.querySelector(".export-custom-project-enabled");',
    '  if (repoToggle) { repoToggle.addEventListener("change", function(){ syncCustomRowState(row); }); }',
    '  Array.from(row.querySelectorAll(".export-custom-branch-item")).forEach(function(item){',
    '    item.addEventListener("change", function(){',
    '      const checkedItems = Array.from(row.querySelectorAll(".export-custom-branch-item")).filter(function(branchItem){ return branchItem.checked; });',
    '      if (checkedItems.length === 0) { item.checked = true; }',
    '    });',
    '  });',
    '  syncCustomRowState(row);',
    '});',
    'if (exportSubmitBtn && vscode) { exportSubmitBtn.addEventListener("click", function(){',
    '  setExportError("");',
    '  if (!exportStartDate || !exportEndDate || !exportStartDate.value || !exportEndDate.value) { setExportError("请选择完整的导出日期范围。"); return; }',
    '  if (exportStartDate.value > exportEndDate.value) { setExportError("开始日期不能晚于结束日期。"); return; }',
    '  const scopeType = exportScopeSelect ? exportScopeSelect.value : "currentProject";',
    '  let branchMode = "all";',
    '  let branchName = null;',
    '  let projectBranches = [];',
    '  if (scopeType === "currentProject" && exportBranchSelect) {',
    '    const rawBranchValue = exportBranchSelect.value;',
    '    if (rawBranchValue === "current" || rawBranchValue === "all") { branchMode = rawBranchValue; }',
    '    else if (rawBranchValue.indexOf("named:") === 0) { branchMode = "named"; branchName = rawBranchValue.slice(6); }',
    '  } else if (scopeType === "custom") {',
    '    branchMode = "custom";',
    '    projectBranches = getCustomRows().flatMap(function(row){',
    '      const repoToggle = row.querySelector(".export-custom-project-enabled");',
    '      if (repoToggle && !repoToggle.checked) { return []; }',
    '      return Array.from(row.querySelectorAll(".export-custom-branch-item:checked")).map(function(item){',
    '        try {',
    '          const parsed = JSON.parse(item.value);',
    '          return { repoPath: parsed && typeof parsed.repoPath === "string" ? parsed.repoPath : "", branch: parsed && typeof parsed.branch === "string" ? parsed.branch : "unknown" };',
    '        } catch (_error) {',
    '          return null;',
    '        }',
    '      });',
    '    }).filter(function(item){ return item && item.repoPath; });',
    '    if (projectBranches.length === 0) { setExportError("请至少选择一个项目 + 分支组合。"); return; }',
    '  }',
    '  vscode.postMessage({',
    '    type: "export-report",',
    '    exportType: exportTypeSelect ? exportTypeSelect.value : "dataWithHtml",',
    '    format: exportFormatSelect ? exportFormatSelect.value : "json",',
    '    scopeType: scopeType,',
    '    branchMode: branchMode,',
    '    branchName: branchName,',
    '    projectBranches: projectBranches,',
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
