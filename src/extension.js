const vscode = require('vscode');

const { createPathRegistry, normalizePath } = require('./core/pathRegistry');
const { createTimeTracker } = require('./core/timeTracker');
const { createGitDiffProvider } = require('./core/gitDiffProvider');
const { createStorage } = require('./core/storage');

let runtime = null;

function isDocumentTracked(registry, document) {
  const fsPath = document?.uri?.scheme === 'file' ? document.uri.fsPath : null;
  if (!fsPath) {
    return false;
  }
  return registry.isAllowed(fsPath);
}

function pickRepoPath(documentPath, allowedRoots) {
  const target = normalizePath(documentPath);
  const hit = allowedRoots.find((rootPath) => target.startsWith(rootPath));
  return hit ? hit.slice(0, -1) : null;
}

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

async function wireGitIntegration(context, gitDiffProvider, tracker) {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    return;
  }

  const git = gitExtension.isActive ? gitExtension.exports.getAPI(1) : (await gitExtension.activate()).getAPI(1);
  git.repositories.forEach((repo) => gitDiffProvider.bindRepository(repo));
  context.subscriptions.push(git.onDidOpenRepository((repo) => gitDiffProvider.bindRepository(repo)));

  git.repositories.forEach((repo) => {
    context.subscriptions.push(repo.state.onDidChange(() => {
      void tracker.handleCommit(repo.rootUri.fsPath);
    }));
  });
}

function registerEditorListeners(context, pathRegistry, normalizedTracked, tracker) {
  function onEditorSignal(document) {
    if (!isDocumentTracked(pathRegistry, document)) {
      return;
    }

    const repoPath = pickRepoPath(document.uri.fsPath, normalizedTracked);
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

async function activate(context) {
  const trackedPaths = getTrackedPaths();
  const normalizedTracked = trackedPaths.map((item) => normalizePath(item));
  const pathRegistry = createPathRegistry(trackedPaths);
  const storage = createStorage(context.globalStorageUri.fsPath);
  const gitDiffProvider = createGitDiffProvider(vscode);
  const tracker = createTracker(storage, gitDiffProvider);

  await wireGitIntegration(context, gitDiffProvider, tracker);
  registerEditorListeners(context, pathRegistry, normalizedTracked, tracker);
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
