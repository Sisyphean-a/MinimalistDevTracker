const test = require('node:test');
const assert = require('node:assert/strict');

const { createReportPanelController } = require('../src/ui/reportPanelController');

function createDisposable() {
  return {
    disposed: false,
    dispose() {
      this.disposed = true;
    }
  };
}

function createMockPanel() {
  let disposeHandler = null;
  let messageHandler = null;

  return {
    webview: {
      html: '',
      onDidReceiveMessage: (handler, _thisArg, subscriptions) => {
        messageHandler = handler;
        const disposable = createDisposable();
        subscriptions?.push(disposable);
        return disposable;
      }
    },
    onDidDispose: (handler, _thisArg, subscriptions) => {
      disposeHandler = handler;
      const disposable = createDisposable();
      subscriptions?.push(disposable);
      return disposable;
    },
    revealCalls: [],
    reveal(column) {
      this.revealCalls.push(column);
    },
    emitMessage(message) {
      messageHandler?.(message);
    },
    dispose() {
      disposeHandler?.();
    }
  };
}

function createMockVscode(panel) {
  return {
    ViewColumn: {
      One: 1
    },
    window: {
      createWebviewPanel: () => panel
    }
  };
}

test('report panel controller opens report and refreshes selected period from webview messages', async () => {
  const panel = createMockPanel();
  const requests = [];
  const controller = createReportPanelController({
    vscode: createMockVscode(panel),
    context: { subscriptions: [] },
    reportViewType: 'minimalTracker.dailyReport',
    tracker: {
      flushAll: async () => {
        requests.push('flush');
      }
    },
    storage: {
      readReportData: async (input) => {
        requests.push(input);
        return { periodType: input.periodType, projects: { 'f:/repo/main||main': { totalLocAdded: 1, totalLocDeleted: 0, sessions: [] } } };
      }
    },
    getReportRepoPaths: () => ['f:/repo/main'],
    shouldFlushBeforeReport: () => true,
    renderDailyReportHtml: (data) => `<html>${data.periodType}</html>`,
    refreshIntervalMs: 30_000,
    logError: (label, error) => {
      throw new Error(`${label}:${error.message}`);
    },
    setIntervalFn: () => ({ id: 'timer' }),
    clearIntervalFn: () => {}
  });

  await controller.open();
  assert.equal(panel.webview.html, '<html>rolling30</html>');
  assert.deepEqual(requests, [
    'flush',
    { periodType: 'rolling30', repoPaths: ['f:/repo/main'] }
  ]);

  panel.emitMessage({ type: 'refresh-report', periodType: 'month' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(panel.webview.html, '<html>month</html>');
  assert.deepEqual(requests.slice(-2), [
    'flush',
    { periodType: 'month', repoPaths: ['f:/repo/main'] }
  ]);
});

test('report panel controller clears refresh timer on dispose', async () => {
  const panel = createMockPanel();
  const cleared = [];
  const controller = createReportPanelController({
    vscode: createMockVscode(panel),
    context: { subscriptions: [] },
    reportViewType: 'minimalTracker.dailyReport',
    tracker: { flushAll: async () => {} },
    storage: {
      readReportData: async () => ({ projects: { 'f:/repo/main||main': { totalLocAdded: 1, totalLocDeleted: 0, sessions: [] } } })
    },
    getReportRepoPaths: () => ['f:/repo/main'],
    shouldFlushBeforeReport: () => false,
    renderDailyReportHtml: () => '<html></html>',
    refreshIntervalMs: 30_000,
    logError: (label, error) => {
      throw new Error(`${label}:${error.message}`);
    },
    setIntervalFn: () => 'timer-handle',
    clearIntervalFn: (handle) => {
      cleared.push(handle);
    }
  });

  await controller.open();
  controller.dispose();

  assert.deepEqual(cleared, ['timer-handle']);
});

test('report panel controller auto refreshes without flushing active sessions again', async () => {
  const panel = createMockPanel();
  const requests = [];
  let timerCallback = null;
  const controller = createReportPanelController({
    vscode: createMockVscode(panel),
    context: { subscriptions: [] },
    reportViewType: 'minimalTracker.dailyReport',
    tracker: {
      flushAll: async () => {
        requests.push('flush');
      }
    },
    storage: {
      readReportData: async (input) => {
        requests.push(input);
        return { periodType: input.periodType, projects: { 'f:/repo/main||main': { totalLocAdded: 1, totalLocDeleted: 0, sessions: [] } } };
      }
    },
    getReportRepoPaths: () => ['f:/repo/main'],
    shouldFlushBeforeReport: () => true,
    renderDailyReportHtml: (data) => `<html>${data.periodType}</html>`,
    refreshIntervalMs: 30_000,
    logError: (label, error) => {
      throw new Error(`${label}:${error.message}`);
    },
    setIntervalFn: (callback) => {
      timerCallback = callback;
      return 'timer-handle';
    },
    clearIntervalFn: () => {}
  });

  await controller.open();
  await timerCallback();

  assert.deepEqual(requests, [
    'flush',
    { periodType: 'rolling30', repoPaths: ['f:/repo/main'] },
    { periodType: 'rolling30', repoPaths: ['f:/repo/main'] }
  ]);
});

test('report panel controller does not accumulate panel listeners in global subscriptions across reopen', async () => {
  const panels = [];
  const context = { subscriptions: [] };
  const controller = createReportPanelController({
    vscode: {
      ViewColumn: { One: 1 },
      window: {
        createWebviewPanel: () => {
          const panel = createMockPanel();
          panels.push(panel);
          return panel;
        }
      }
    },
    context,
    reportViewType: 'minimalTracker.dailyReport',
    tracker: { flushAll: async () => {} },
    storage: {
      readReportData: async () => ({ projects: { 'f:/repo/main||main': { totalLocAdded: 1, totalLocDeleted: 0, sessions: [] } } })
    },
    getReportRepoPaths: () => ['f:/repo/main'],
    shouldFlushBeforeReport: () => false,
    renderDailyReportHtml: () => '<html></html>',
    refreshIntervalMs: 30_000,
    logError: (label, error) => {
      throw new Error(`${label}:${error.message}`);
    },
    setIntervalFn: () => 'timer-handle',
    clearIntervalFn: () => {}
  });

  await controller.open();
  panels[0].dispose();
  await controller.open();
  panels[1].dispose();

  assert.deepEqual(context.subscriptions, []);
});

test('report panel controller accepts extended period selections from webview messages', async () => {
  const panel = createMockPanel();
  const requests = [];
  const controller = createReportPanelController({
    vscode: createMockVscode(panel),
    context: { subscriptions: [] },
    reportViewType: 'minimalTracker.dailyReport',
    tracker: { flushAll: async () => {} },
    storage: {
      readReportData: async (input) => {
        requests.push(input);
        return { periodType: input.periodType, projects: { 'f:/repo/main||main': { totalLocAdded: 1, totalLocDeleted: 0, sessions: [] } } };
      }
    },
    getReportRepoPaths: () => ['f:/repo/main'],
    shouldFlushBeforeReport: () => false,
    renderDailyReportHtml: (data) => `<html>${data.periodType}</html>`,
    refreshIntervalMs: 30_000,
    logError: (label, error) => {
      throw new Error(`${label}:${error.message}`);
    },
    setIntervalFn: () => 'timer',
    clearIntervalFn: () => {}
  });

  await controller.open();
  panel.emitMessage({ type: 'refresh-report', periodType: 'rolling365' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(panel.webview.html, '<html>rolling365</html>');
  assert.deepEqual(requests.at(-1), { periodType: 'rolling365', repoPaths: ['f:/repo/main'] });
});

test('report panel controller forwards export requests with normalized current-branch filters', async () => {
  const panel = createMockPanel();
  const exports = [];
  let lastRenderOptions = null;
  const controller = createReportPanelController({
    vscode: createMockVscode(panel),
    context: { subscriptions: [] },
    reportViewType: 'minimalTracker.dailyReport',
    tracker: { flushAll: async () => {} },
    storage: {
      readReportData: async () => ({
        periodType: 'rolling30',
        periodLabel: '最近30天',
        dateRangeStart: '2026-04-14',
        dateRangeEnd: '2026-05-13',
        projects: { 'f:/repo/main||main': { repoPath: 'f:/repo/main', branch: 'main', totalLocAdded: 1, totalLocDeleted: 0, sessions: [] } },
        days: []
      })
    },
    getReportRepoPaths: () => ['f:/repo/main'],
    getCurrentBranchName: () => 'main',
    exportReport: async (input) => {
      exports.push(input);
    },
    shouldFlushBeforeReport: () => false,
    renderDailyReportHtml: (_data, viewOptions) => {
      lastRenderOptions = viewOptions;
      return '<html></html>';
    },
    refreshIntervalMs: 30_000,
    logError: (label, error) => {
      throw new Error(`${label}:${error.message}`);
    },
    setIntervalFn: () => 'timer',
    clearIntervalFn: () => {}
  });

  await controller.open();
  panel.emitMessage({
    type: 'export-report',
    exportType: 'dataWithHtml',
    format: 'json',
    scopeType: 'currentProject',
    branchMode: 'current',
    startDate: '2026-04-14',
    endDate: '2026-05-13'
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(lastRenderOptions.exportDefaults.branchMode, 'current');
  assert.equal(lastRenderOptions.exportDefaults.currentBranch, 'main');
  assert.deepEqual(exports[0], {
    exportType: 'dataWithHtml',
    format: 'json',
    scopeType: 'currentProject',
    repoPaths: ['f:/repo/main'],
    branchMode: 'current',
    branch: 'main',
    startDate: '2026-04-14',
    endDate: '2026-05-13'
  });
});
