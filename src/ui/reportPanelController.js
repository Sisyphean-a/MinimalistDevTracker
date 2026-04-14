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
        if (message?.type !== 'refresh-report') {
          return;
        }
        if (typeof message.periodType === 'string') {
          selectedPeriodType = message.periodType === 'month' ? 'month' : 'rolling30';
        }
        Promise.resolve(refreshReport({ shouldFlush: true })).catch((error) => options.logError('refreshReport', error));
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
    const data = await options.storage.readReportData({
      periodType: selectedPeriodType,
      repoPaths: options.getReportRepoPaths()
    });
    panel.webview.html = options.renderDailyReportHtml(data, {
      refreshIntervalMs: options.refreshIntervalMs
    });
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
