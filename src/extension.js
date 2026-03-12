const { execFile } = require('node:child_process');
const vscode = require('vscode');

const { createPathRegistry } = require('./core/pathRegistry');
const { createTimeTracker } = require('./core/timeTracker');
const { createGitDiffProvider } = require('./core/gitDiffProvider');
const { createStorage } = require('./core/storage');
const { createWorktreeDiscovery } = require('./core/worktreeDiscovery');
const { createCommitWatcher } = require('./core/commitWatcher');
const { renderDailyReportHtml } = require('./ui/dailyReportView');

const GIT_TIMEOUT_MS = 3_000;
const REPORT_VIEW_TYPE = 'minimalTracker.dailyReport';
const REPORT_COMMAND_ID = 'minimalTracker.openDailyReport';
let runtime = null;

function getTrackedPaths() {
  const config = vscode.workspace.getConfiguration('minimalTracker');
  const list = config.get('trackedPaths', []);
  return list.filter((value) => typeof value === 'string' && value.trim());
}

function execGit(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { timeout: GIT_TIMEOUT_MS }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
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

function isDocumentTracked(pathRegistry, document) {
  const isFile = document?.uri?.scheme === 'file';
  return Boolean(isFile && pathRegistry.isAllowed(document.uri.fsPath));
}

function registerEditorListeners(context, pathRegistry, tracker) {
  function onEditorSignal(document) {
    if (!isDocumentTracked(pathRegistry, document)) {
      return;
    }

    const repoPath = pathRegistry.resolveRepoPath(document.uri.fsPath);
    if (!repoPath) {
      return;
    }

    void tracker.recordActivity(repoPath);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => onEditorSignal(event.document)),
    vscode.window.onDidChangeActiveTextEditor((editor) => editor && onEditorSignal(editor.document)),
    vscode.window.onDidChangeTextEditorSelection((event) => onEditorSignal(event.textEditor.document))
  );
}

function registerRepository(input) {
  input.gitDiffProvider.bindRepository(input.repo);
  const disposable = input.commitWatcher.trackRepository(input.repo);
  context.subscriptions.push(disposable);
}

async function wireGitIntegration(context, gitDiffProvider, tracker) {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    return;
  }

  const git = gitExtension.isActive ? gitExtension.exports.getAPI(1) : (await gitExtension.activate()).getAPI(1);
  const commitWatcher = createCommitWatcher({
    onCommit: (repoPath) => {
      void tracker.handleCommit(repoPath);
    }
  });

  git.repositories.forEach((repo) => registerRepository({ repo, gitDiffProvider, commitWatcher, context }));
  context.subscriptions.push(git.onDidOpenRepository((repo) => {
    registerRepository({ repo, gitDiffProvider, commitWatcher, context });
  }));
}

async function buildPathRegistry(trackedPaths) {
  const discovery = createWorktreeDiscovery({ execGit });
  const result = await discovery.resolveAllowedPaths(trackedPaths);
  result.errors.forEach((error) => {
    console.error('[minimal-tracker] tracked path resolve error', error);
  });
  return createPathRegistry(result.allowedPaths);
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
  const trackedPaths = getTrackedPaths();
  const pathRegistry = await buildPathRegistry(trackedPaths);
  const storage = createStorage(context.globalStorageUri.fsPath);
  const gitDiffProvider = createGitDiffProvider(vscode);
  const tracker = createTracker(storage, gitDiffProvider);

  registerCommands(context, storage);
  await wireGitIntegration(context, gitDiffProvider, tracker);
  registerEditorListeners(context, pathRegistry, tracker);
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


