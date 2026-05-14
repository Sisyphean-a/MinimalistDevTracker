const { addDaysToDateKey } = require('../core/sqliteStoragePeriods');

const VALID_PERIOD_TYPES = new Set([
  'rolling30',
  'month',
  'rolling90',
  'rolling180',
  'rolling365',
  'all'
]);

function normalizePeriodType(periodType) {
  return VALID_PERIOD_TYPES.has(periodType) ? periodType : 'rolling30';
}

function resolveCurrentProjectRepoPath(repoPaths) {
  return Array.isArray(repoPaths) && repoPaths.length > 0 ? repoPaths[0] : null;
}

function collectProjectBranchOptions(projects) {
  const seen = new Set();
  const options = [];

  Object.entries(projects ?? {}).forEach(([projectKey, project]) => {
    const repoPath = project?.repoPath ?? String(projectKey).split('||')[0] ?? '';
    const branch = project?.branch ?? String(projectKey).split('||')[1] ?? 'unknown';
    if (!repoPath) {
      return;
    }
    const key = `${repoPath}||${branch}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push({ repoPath, branch });
  });

  return options.sort((left, right) => {
    const repoCompare = left.repoPath.localeCompare(right.repoPath);
    if (repoCompare !== 0) {
      return repoCompare;
    }
    return left.branch.localeCompare(right.branch);
  });
}

function collectBranchOptions(projects, repoPath, currentBranch) {
  const branchSet = new Set();

  Object.values(projects ?? {}).forEach((project) => {
    if (project?.repoPath === repoPath && project.branch) {
      branchSet.add(project.branch);
    }
  });
  if (currentBranch) {
    branchSet.add(currentBranch);
  }

  return [...branchSet].sort((left, right) => left.localeCompare(right));
}

function buildExportDefaults(data, repoPaths, currentBranch) {
  const currentProjectRepoPath = resolveCurrentProjectRepoPath(repoPaths);
  const endDate = data.dateRangeEnd ?? data.date ?? '';
  const startDate = endDate ? addDaysToDateKey(endDate, -29) : '';

  return {
    exportType: 'dataWithHtml',
    format: 'json',
    scopeType: 'currentProject',
    branchMode: currentBranch ? 'current' : 'all',
    currentProjectRepoPath,
    currentBranch,
    branchOptions: collectBranchOptions(data.projects, currentProjectRepoPath, currentBranch),
    projectBranchOptions: collectProjectBranchOptions(data.projects),
    startDate,
    endDate
  };
}

async function resolveCurrentBranch(options, repoPaths) {
  const repoPath = resolveCurrentProjectRepoPath(repoPaths);
  if (!repoPath || typeof options.getCurrentBranchName !== 'function') {
    return null;
  }
  return Promise.resolve(options.getCurrentBranchName(repoPath));
}

function normalizeCustomProjectBranches(rawProjectBranches) {
  if (!Array.isArray(rawProjectBranches)) {
    return [];
  }

  const seen = new Set();
  const output = [];
  rawProjectBranches.forEach((item) => {
    const repoPath = typeof item?.repoPath === 'string' ? item.repoPath.trim() : '';
    const branch = typeof item?.branch === 'string' && item.branch.trim() ? item.branch.trim() : 'unknown';
    if (!repoPath) {
      return;
    }
    const key = `${repoPath}||${branch}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push({ repoPath, branch });
  });
  return output;
}

function normalizeExportRequest(message, repoPaths, currentBranch) {
  const scopeType = message?.scopeType === 'all'
    ? 'all'
    : (message?.scopeType === 'custom' ? 'custom' : 'currentProject');
  const exportType = message?.exportType === 'dataOnly' ? 'dataOnly' : 'dataWithHtml';
  const format = message?.format === 'yaml' ? 'yaml' : 'json';
  const currentProjectRepoPath = resolveCurrentProjectRepoPath(repoPaths);
  const customProjectBranches = scopeType === 'custom'
    ? normalizeCustomProjectBranches(message?.projectBranches)
    : [];
  const selectedRepoPaths = scopeType === 'currentProject' && currentProjectRepoPath
    ? [currentProjectRepoPath]
    : (scopeType === 'custom'
      ? [...new Set(customProjectBranches.map((item) => item.repoPath))]
      : null);
  let branchMode = scopeType === 'currentProject' ? (message?.branchMode ?? 'current') : (scopeType === 'custom' ? 'custom' : 'all');
  let branch = null;

  if (scopeType === 'all') {
    branchMode = 'all';
  } else if (scopeType === 'custom') {
    branchMode = 'custom';
  } else if (branchMode === 'current') {
    branch = currentBranch ?? null;
    if (!branch) {
      branchMode = 'all';
    }
  } else if (branchMode === 'named') {
    branch = typeof message?.branchName === 'string' && message.branchName ? message.branchName : null;
  } else {
    branchMode = 'all';
  }

  return {
    exportType,
    format,
    scopeType,
    repoPaths: selectedRepoPaths,
    branchMode,
    branch,
    projectBranches: customProjectBranches,
    startDate: message?.startDate ?? null,
    endDate: message?.endDate ?? null
  };
}

function createReportPanelController(options) {
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  let panel = null;
  let panelSubscriptions = [];
  let timerHandle = null;
  let selectedPeriodType = 'rolling30';

  function clearTimer() {
    if (timerHandle) {
      clearIntervalFn(timerHandle);
      timerHandle = null;
    }
  }

  function disposePanelSubscriptions() {
    panelSubscriptions.forEach((subscription) => subscription.dispose());
    panelSubscriptions = [];
  }

  function handlePanelDisposed() {
    clearTimer();
    disposePanelSubscriptions();
    panel = null;
  }

  function registerPanelListeners(panelInstance) {
    disposePanelSubscriptions();
    panelSubscriptions = [
      panelInstance.onDidDispose(() => {
        handlePanelDisposed();
      }),
      panelInstance.webview.onDidReceiveMessage((message) => {
        if (message?.type === 'refresh-report') {
          if (typeof message.periodType === 'string') {
            selectedPeriodType = normalizePeriodType(message.periodType);
          }
          Promise.resolve(refreshReport({ shouldFlush: true })).catch((error) => options.logError('refreshReport', error));
          return;
        }
        if (message?.type !== 'export-report' || typeof options.exportReport !== 'function') {
          return;
        }
        Promise.resolve(handleExportRequest(message)).catch((error) => options.logError('exportReport', error));
      })
    ];
  }

  async function refreshReport(input = {}) {
    if (!panel) {
      return;
    }
    if (input.shouldFlush && options.shouldFlushBeforeReport()) {
      await options.tracker.flushAll();
    }
    const repoPaths = options.getReportRepoPaths();
    const data = await options.storage.readReportData({
      periodType: selectedPeriodType,
      repoPaths
    });
    const currentBranch = await resolveCurrentBranch(options, repoPaths);
    panel.webview.html = options.renderDailyReportHtml(data, {
      refreshIntervalMs: options.refreshIntervalMs,
      exportDefaults: buildExportDefaults(data, repoPaths, currentBranch)
    });
  }

  async function handleExportRequest(message) {
    if (options.shouldFlushBeforeReport()) {
      await options.tracker.flushAll();
    }
    const repoPaths = options.getReportRepoPaths();
    const currentBranch = await resolveCurrentBranch(options, repoPaths);
    const request = normalizeExportRequest(message, repoPaths, currentBranch);
    await options.exportReport(request);
  }

  function ensurePanel() {
    if (panel) {
      panel.reveal(options.vscode.ViewColumn.One);
      return panel;
    }

    panel = options.vscode.window.createWebviewPanel(
      options.reportViewType,
      'Minimalist Dev Tracker Report',
      options.vscode.ViewColumn.One,
      { enableScripts: true }
    );
    registerPanelListeners(panel);
    return panel;
  }

  function ensureTimer() {
    if (timerHandle) {
      return;
    }
    timerHandle = setIntervalFn(() => {
      Promise.resolve(refreshReport()).catch((error) => options.logError('refreshReport', error));
    }, options.refreshIntervalMs);
  }

  async function open() {
    ensurePanel();
    await refreshReport({ shouldFlush: true });
    ensureTimer();
  }

  function dispose() {
    clearTimer();
    panel?.dispose();
    disposePanelSubscriptions();
    panel = null;
  }

  return Object.freeze({
    open,
    dispose
  });
}

module.exports = {
  createReportPanelController
};
