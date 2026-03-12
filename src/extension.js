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
const { renderDailyReportHtml } = require('./ui/dailyReportView');

const REPORT_VIEW_TYPE = 'minimalTracker.dailyReport';
const REPORT_COMMAND_ID = 'minimalTracker.openDailyReport';
let runtime = null;

function getTrackedPaths() {
  const config = vscode.workspace.getConfiguration('minimalTracker');
  const list = config.get('trackedPaths', []);
  return list.filter((value) => typeof value === 'string' && value.trim());
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

function registerCommands(context, storage) {
  const disposable = vscode.commands.registerCommand(REPORT_COMMAND_ID, async () => {
    await showDailyReport(storage);
  });
  context.subscriptions.push(disposable);
}

async function activate(context) {
  const normalizer = createPathNormalizer();
  const gitClient = createGitClient();
  const trackedPaths = getTrackedPaths();
  const pathRegistry = await buildPathRegistry(trackedPaths, { gitClient, normalizer });
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
    logError: (label, error) => {
      console.error(`[minimal-tracker] ${label} failed`, error);
    }
  });

  registerCommands(context, storage);
  await wireGitIntegration(context, runtimeTrackerRef);
  registerEditorListeners(context, runtimeTrackerRef);
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


