const test = require('node:test');
const assert = require('node:assert/strict');

const { createReportPanelController } = require('../src/ui/reportPanelController');

function createMockPanel() {
  let disposeHandler = null;
  let messageHandler = null;

  return {
    webview: {
      html: '',
      onDidReceiveMessage: (handler) => {
        messageHandler = handler;
        return { dispose() {} };
      }
    },
    onDidDispose: (handler) => {
      disposeHandler = handler;
      return { dispose() {} };
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
