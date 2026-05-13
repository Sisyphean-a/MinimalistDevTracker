const vscode = require('vscode');
const os = require('node:os');
const path = require('node:path');

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
const { createTrackedRuntimeReloader, createStorageBootstrapper } = require('./core/extensionRuntime');
const { resolveReportRepoPaths } = require('./core/reportScope');
const { resolveStorageRootPath } = require('./core/storagePathResolver');
const { migrateLegacyStorageData } = require('./core/storageMigration');
const { registerExtensionCommands } = require('./core/extensionCommands');
const { openDatabase } = require('./core/sqliteDatabase');
const { createTrackerConfigReader } = require('./core/trackerConfig');
const { createReportExporter } = require('./core/reportExporter');
const { createExportReportRunner } = require('./core/exportRunner');
const { createReportPanelController } = require('./ui/reportPanelController');
const { listWorkspaceFolderPaths, resolveWorkspaceAllowedPaths } = require('./core/workspaceTracking');
const { renderDailyReportHtml } = require('./ui/dailyReportView');
const REPORT_VIEW_TYPE = 'minimalTracker.dailyReport';
const REPORT_COMMAND_ID = 'minimalTracker.openDailyReport';
const MIGRATE_STORAGE_COMMAND_ID = 'minimalTracker.migrateLegacyStorageData';
const EXCLUDE_GLOBS_KEY = 'minimalTracker.fileWatch.excludeGlobs';
const DEFAULT_SHARED_STORAGE_DIR_NAME = '.minimalist-dev-tracker';
const REFRESH_INTERVAL_MS = 30_000;
let runtime = null;
function reportRuntimeError(label, error) {
  console.error(`[minimal-tracker] ${label} failed`, error);
}
function createTracker(storage, gitDiffProvider) {
  return createTimeTracker({
    now: () => Date.now(),
    getDiff: (repoPath, input) => gitDiffProvider.getDiff(repoPath, input),
    getCommitDiff: (repoPath, commitHash, input) => gitDiffProvider.getCommitDiff(repoPath, commitHash, input),
    getBranch: (repoPath) => gitDiffProvider.getCurrentBranch(repoPath),
    isUntrackedFile: (repoPath, fsPath) => gitDiffProvider.isUntrackedFile(repoPath, fsPath),
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
  const result = await resolveWorkspaceAllowedPaths(trackedPaths, discovery);
  result.errors.forEach((error) => {
    console.error('[minimal-tracker] tracked path resolve error', error);
  });
  return createPathRegistry(result.allowedPaths, {
    normalizer: input.normalizer
  });
}

function registerConfigurationReload(context, input) {
  const reloadTrackedRuntime = createTrackedRuntimeReloader({
    loadTrackingRoots: () => listWorkspaceFolderPaths(vscode.workspace.workspaceFolders),
    loadExcludeGlobs: input.getExcludeGlobs,
    buildPathRegistry: (trackingRoots) => buildPathRegistry(trackingRoots, input.pathRegistryDeps),
    onPathRegistryUpdated: input.onPathRegistryUpdated,
    runtimeTracker: input.runtimeTracker,
    fileActivityWatcher: input.fileActivityWatcher
  });
  const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration(EXCLUDE_GLOBS_KEY)) {
      return;
    }
    Promise.resolve()
      .then(() => reloadTrackedRuntime())
      .catch((error) => reportRuntimeError('reloadTrackedRuntime', error));
  });
  const workspaceDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    Promise.resolve()
      .then(() => reloadTrackedRuntime())
      .catch((error) => reportRuntimeError('reloadTrackedRuntime', error));
  });
  context.subscriptions.push(disposable, workspaceDisposable);
}

function createLegacyMigrationRunner(storageRootPath, legacyStoragePath) {
  const sourceDirs = [...new Set([storageRootPath, legacyStoragePath].filter(Boolean))];
  return async function runLegacyMigration() {
    const summary = {
      importedSessions: 0,
      skippedSessions: 0,
      ignoredExistingSessions: 0
    };

    for (const sourceDir of sourceDirs) {
      const current = await migrateLegacyStorageData({
        sourceDir,
        targetDir: storageRootPath
      });
      summary.importedSessions += current.importedSessions;
      summary.skippedSessions += current.skippedSessions;
      summary.ignoredExistingSessions += current.ignoredExistingSessions;
    }

    return summary;
  };
}

async function readStorageSnapshot(storageRootPath) {
  const database = await openDatabase(path.join(storageRootPath, 'storage.db'));
  const snapshot = {
    legacyImportCompletedAt: database.getMeta('legacy_import_completed_at'),
    sessionCount: database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count
  };
  database.close();
  return snapshot;
}

async function createStorageRuntime(context, config) {
  const defaultSharedStoragePath = path.join(os.homedir(), DEFAULT_SHARED_STORAGE_DIR_NAME);
  const storageRootPath = resolveStorageRootPath({
    sharedStoragePath: config.getSharedStoragePath(),
    defaultStoragePath: context.globalStorageUri.fsPath,
    defaultSharedStoragePath
  });
  const legacyStoragePath = context.globalStorageUri.fsPath;
  const runLegacyMigration = createLegacyMigrationRunner(storageRootPath, legacyStoragePath);
  const bootstrapStorage = createStorageBootstrapper({
    storageRootPath,
    legacyStoragePath,
    migrationSourceDirs: [storageRootPath, legacyStoragePath],
    readStorageSnapshot: () => readStorageSnapshot(storageRootPath),
    migrateLegacyStorageData,
    createStorage
  });
  return {
    legacyStoragePath,
    runLegacyMigration,
    storage: await bootstrapStorage(),
    storageRootPath
  };
}

function createFolderSelector(windowApi) {
  return async function selectFolder() {
    const uris = await windowApi.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: '选择导出目录'
    });
    return uris?.[0]?.fsPath ?? null;
  };
}

function createReportController(context, config, tracker, storage, gitDiffProvider, getCurrentPathRegistry) {
  const reportExporter = createReportExporter();
  const selectFolder = createFolderSelector(vscode.window);
  const exportReport = createExportReportRunner({
    now: () => Date.now(),
    selectFolder,
    storage,
    reportExporter,
    showInfoMessage: (message) => vscode.window.showInformationMessage(message),
    showWarningMessage: (message) => vscode.window.showWarningMessage(message)
  });

  return createReportPanelController({
    vscode,
    context,
    reportViewType: REPORT_VIEW_TYPE,
    tracker,
    storage,
    exportReport,
    getCurrentBranchName: async (repoPath) => {
      try {
        return await gitDiffProvider.getCurrentBranch(repoPath);
      } catch (error) {
        reportRuntimeError('getCurrentBranch', error);
        return null;
      }
    },
    shouldFlushBeforeReport: config.shouldFlushBeforeReport,
    getReportRepoPaths: () => resolveReportRepoPaths(vscode.workspace.workspaceFolders, getCurrentPathRegistry()),
    renderDailyReportHtml,
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    logError: reportRuntimeError
  });
}

function createRuntimeTracking(config, tracker, gitDiffProvider, pathRegistry, normalizer) {
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
  return {
    fileActivityWatcher: createFileActivityWatcher({
      vscode,
      roots: pathRegistry.getAllowedRoots(),
      excludeGlobs: config.getExcludeGlobs(),
      onFileActivity: (fsPath) => runtimeTrackerRef.recordPathActivity(fsPath),
      logError: reportRuntimeError
    }),
    runtimeTracker: runtimeTrackerRef
  };
}

async function activate(context) {
  const config = createTrackerConfigReader(vscode);
  const normalizer = createPathNormalizer();
  const gitClient = createGitClient();
  const pathRegistryDeps = { gitClient, normalizer };
  const pathRegistry = await buildPathRegistry(listWorkspaceFolderPaths(vscode.workspace.workspaceFolders), pathRegistryDeps);
  let currentPathRegistry = pathRegistry;
  const storageRuntime = await createStorageRuntime(context, config);
  const gitDiffProvider = createGitDiffProvider(vscode, { gitClient, normalizer });
  const tracker = createTracker(storageRuntime.storage, gitDiffProvider);
  const reportPanelController = createReportController(context, config, tracker, storageRuntime.storage, gitDiffProvider, () => currentPathRegistry);
  const { runtimeTracker, fileActivityWatcher } = createRuntimeTracking(config, tracker, gitDiffProvider, pathRegistry, normalizer);

  registerExtensionCommands({
    vscode,
    context,
    reportCommandId: REPORT_COMMAND_ID,
    migrateCommandId: MIGRATE_STORAGE_COMMAND_ID,
    reportPanelController,
    migrateLegacyStorageData: storageRuntime.runLegacyMigration,
    storageRootPath: storageRuntime.storageRootPath,
    legacyStoragePath: storageRuntime.legacyStoragePath
  });
  await wireGitIntegration(context, runtimeTracker);
  registerEditorListeners(context, runtimeTracker);
  registerConfigurationReload(context, {
    getExcludeGlobs: config.getExcludeGlobs,
    runtimeTracker,
    fileActivityWatcher,
    pathRegistryDeps,
    onPathRegistryUpdated: (nextPathRegistry) => {
      currentPathRegistry = nextPathRegistry;
    }
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


