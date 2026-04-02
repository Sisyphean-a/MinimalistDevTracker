const vscode = require('vscode');

const { createPathRegistry } = require('./core/pathRegistry');
const { createTimeTracker } = require('./core/timeTracker');
const { createGitDiffProvider } = require('./core/gitDiffProvider');
const { createStorage } = require('./core/storage');
const { createWorktreeDiscovery } = require('./core/worktreeDiscovery');
const { createCommitWatcher } = require('./core/commitWatcher');
const { createRuntimeTracker } = require('./core/runtimeTracker');
const { createGitClient } = require('./core/gitClient');
const { createPathNormalizer } = require('./core/pathKey');
const { createFileActivityWatcher } = require('./core/fileActivityWatcher');
const { createTrackedRuntimeReloader } = require('./core/extensionRuntime');
const { renderDailyReportHtml } = require('./ui/dailyReportView');

const REPORT_VIEW_TYPE = 'minimalTracker.dailyReport';
const REPORT_COMMAND_ID = 'minimalTracker.openDailyReport';
const TRACKED_PATHS_KEY = 'minimalTracker.trackedPaths';
const EXCLUDE_GLOBS_KEY = 'minimalTracker.fileWatch.excludeGlobs';
const REFRESH_INTERVAL_MS = 30_000;
let runtime = null;

function reportRuntimeError(label, error) {
  console.error(`[minimal-tracker] ${label} failed`, error);
}

function getMinimalTrackerConfig() {
  return vscode.workspace.getConfiguration('minimalTracker');
}

function readStringArrayConfig(path, fallback = []) {
  const rawValue = getMinimalTrackerConfig().get(path, fallback);
  if (!Array.isArray(rawValue)) {
    return fallback;
  }
  return rawValue.filter((value) => typeof value === 'string' && value.trim());
}

function getTrackedPaths() {
  return readStringArrayConfig('trackedPaths', []);
}

function getExcludeGlobs() {
  return readStringArrayConfig('fileWatch.excludeGlobs', []);
}

function shouldFlushBeforeReport() {
  const config = vscode.workspace.getConfiguration('minimalTracker');
  return config.get('flushBeforeReport', true);
}

function createTracker(storage, gitDiffProvider) {
  return createTimeTracker({
    now: () => Date.now(),
    getDiff: (repoPath) => gitDiffProvider.getDiff(repoPath),
    getBranch: (repoPath) => gitDiffProvider.getCurrentBranch(repoPath),
    onSessionFinalized: async (session) => {
      try {
        await storage.appendSession(session);
      } catch (error) {
        console.error('[minimal-tracker] failed to persist session', error);
      }
    }
  });
}

function createReportPanelController(context, input) {
  let panel = null;
  let timerHandle = null;

  function clearTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  async function refreshReport() {
    if (!panel) {
      return;
    }
    if (shouldFlushBeforeReport()) {
      await input.tracker.flushAll();
    }
    const [data, trendData] = await Promise.all([
      input.storage.readLatestDaily(),
      input.storage.readTrendData([7, 30])
    ]);
    panel.webview.html = renderDailyReportHtml(data, {
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      trendData
    });
  }

  function ensurePanel() {
    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      return panel;
    }

    panel = vscode.window.createWebviewPanel(
      REPORT_VIEW_TYPE,
      'Minimalist Dev Tracker Report',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.onDidDispose(() => {
      clearTimer();
      panel = null;
    }, null, context.subscriptions);
    panel.webview.onDidReceiveMessage((message) => {
      if (message?.type !== 'refresh-report') {
        return;
      }
      Promise.resolve(refreshReport()).catch((error) => reportRuntimeError('refreshReport', error));
    }, null, context.subscriptions);
    return panel;
  }

  function ensureTimer() {
    if (timerHandle) {
      return;
    }
    timerHandle = setInterval(() => {
      Promise.resolve(refreshReport()).catch((error) => reportRuntimeError('refreshReport', error));
    }, REFRESH_INTERVAL_MS);
  }

  async function open() {
    ensurePanel();
    await refreshReport();
    ensureTimer();
  }

  function dispose() {
    clearTimer();
    panel?.dispose();
    panel = null;
  }

  return Object.freeze({
    open,
    dispose
  });
}

function registerEditorListeners(context, runtimeTracker) {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => runtimeTracker.recordEditorActivity(event.document)),
    vscode.window.onDidChangeActiveTextEditor((editor) => editor && runtimeTracker.recordEditorActivity(editor.document)),
    vscode.window.onDidChangeTextEditorSelection((event) => runtimeTracker.recordEditorActivity(event.textEditor.document))
  );
}

async function wireGitIntegration(context, runtimeTracker) {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    return;
  }

  const git = gitExtension.isActive ? gitExtension.exports.getAPI(1) : (await gitExtension.activate()).getAPI(1);
  git.repositories.forEach((repo) => runtimeTracker.registerRepository({
    repo,
    subscriptions: context.subscriptions
  }));
  context.subscriptions.push(git.onDidOpenRepository((repo) => {
    runtimeTracker.registerRepository({
      repo,
      subscriptions: context.subscriptions
    });
  }));
}

async function buildPathRegistry(trackedPaths, input) {
  const discovery = createWorktreeDiscovery({
    execGit: (args) => input.gitClient.run(args),
    normalizer: input.normalizer
  });
  const result = await discovery.resolveAllowedPaths(trackedPaths);
  result.errors.forEach((error) => {
    console.error('[minimal-tracker] tracked path resolve error', error);
  });
  return createPathRegistry(result.allowedPaths, {
    normalizer: input.normalizer
  });
}

function registerCommands(context, input) {
  const disposable = vscode.commands.registerCommand(REPORT_COMMAND_ID, async () => {
    await input.reportPanelController.open();
  });
  context.subscriptions.push(disposable);
}

function registerConfigurationReload(context, input) {
  const reloadTrackedRuntime = createTrackedRuntimeReloader({
    loadTrackedPaths: getTrackedPaths,
    loadExcludeGlobs: getExcludeGlobs,
    buildPathRegistry: (trackedPaths) => buildPathRegistry(trackedPaths, input.pathRegistryDeps),
    runtimeTracker: input.runtimeTracker,
    fileActivityWatcher: input.fileActivityWatcher
  });
  const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration(TRACKED_PATHS_KEY) && !event.affectsConfiguration(EXCLUDE_GLOBS_KEY)) {
      return;
    }
    Promise.resolve()
      .then(() => reloadTrackedRuntime())
      .catch((error) => reportRuntimeError('reloadTrackedRuntime', error));
  });
  context.subscriptions.push(disposable);
}

async function activate(context) {
  const normalizer = createPathNormalizer();
  const gitClient = createGitClient();
  const trackedPaths = getTrackedPaths();
  const pathRegistryDeps = { gitClient, normalizer };
  const pathRegistry = await buildPathRegistry(trackedPaths, pathRegistryDeps);
  const storage = createStorage(context.globalStorageUri.fsPath);
  const gitDiffProvider = createGitDiffProvider(vscode, { gitClient, normalizer });
  const tracker = createTracker(storage, gitDiffProvider);
  const reportPanelController = createReportPanelController(context, { tracker, storage });
  let runtimeTrackerRef = null;
  const commitWatcher = createCommitWatcher({
    normalizer,
    onCommit: (repoPath, commitHash) => {
      if (!runtimeTrackerRef) {
        throw new Error('runtime tracker not initialized before commit callback');
      }
      runtimeTrackerRef.handleCommit(repoPath, commitHash);
    }
  });
  runtimeTrackerRef = createRuntimeTracker({
    pathRegistry,
    activityTracker: tracker,
    gitDiffProvider,
    commitWatcher,
    logError: reportRuntimeError
  });
  const fileActivityWatcher = createFileActivityWatcher({
    vscode,
    roots: pathRegistry.getAllowedRoots(),
    excludeGlobs: getExcludeGlobs(),
    onFileActivity: (fsPath) => runtimeTrackerRef.recordPathActivity(fsPath),
    logError: reportRuntimeError
  });

  registerCommands(context, { reportPanelController });
  await wireGitIntegration(context, runtimeTrackerRef);
  registerEditorListeners(context, runtimeTrackerRef);
  registerConfigurationReload(context, {
    runtimeTracker: runtimeTrackerRef,
    fileActivityWatcher,
    pathRegistryDeps
  });
  context.subscriptions.push(fileActivityWatcher);
  runtime = Object.freeze({ tracker, reportPanelController });
}

async function deactivate() {
  if (!runtime) {
    return;
  }
  runtime.reportPanelController.dispose();
  await runtime.tracker.flushAll();
  runtime = null;
}

module.exports = {
  activate,
  deactivate
};


