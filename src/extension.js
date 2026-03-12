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
const { createOpenDailyReportHandler, createTrackedRuntimeReloader } = require('./core/extensionRuntime');
const { renderDailyReportHtml } = require('./ui/dailyReportView');

const REPORT_VIEW_TYPE = 'minimalTracker.dailyReport';
const REPORT_COMMAND_ID = 'minimalTracker.openDailyReport';
const TRACKED_PATHS_KEY = 'minimalTracker.trackedPaths';
const EXCLUDE_GLOBS_KEY = 'minimalTracker.fileWatch.excludeGlobs';
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
    onSessionFinalized: async (session) => {
      try {
        await storage.appendSession(session);
      } catch (error) {
        console.error('[minimal-tracker] failed to persist session', error);
      }
    }
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

async function showDailyReport(storage) {
  const data = await storage.readLatestDaily();
  const panel = vscode.window.createWebviewPanel(
    REPORT_VIEW_TYPE,
    'Minimalist Dev Tracker Report',
    vscode.ViewColumn.One,
    { enableScripts: false }
  );
  panel.webview.html = renderDailyReportHtml(data);
}

function registerCommands(context, input) {
  const openDailyReport = createOpenDailyReportHandler({
    shouldFlushBeforeReport,
    tracker: input.tracker,
    showDailyReport: () => showDailyReport(input.storage)
  });
  const disposable = vscode.commands.registerCommand(REPORT_COMMAND_ID, async () => {
    await openDailyReport();
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
  let runtimeTrackerRef = null;
  const commitWatcher = createCommitWatcher({
    normalizer,
    onCommit: (repoPath) => {
      if (!runtimeTrackerRef) {
        throw new Error('runtime tracker not initialized before commit callback');
      }
      runtimeTrackerRef.handleCommit(repoPath);
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

  registerCommands(context, { storage, tracker });
  await wireGitIntegration(context, runtimeTrackerRef);
  registerEditorListeners(context, runtimeTrackerRef);
  registerConfigurationReload(context, {
    runtimeTracker: runtimeTrackerRef,
    fileActivityWatcher,
    pathRegistryDeps
  });
  context.subscriptions.push(fileActivityWatcher);
  runtime = Object.freeze({ tracker });
}

async function deactivate() {
  if (!runtime) {
    return;
  }
  await runtime.tracker.flushAll();
  runtime = null;
}

module.exports = {
  activate,
  deactivate
};


