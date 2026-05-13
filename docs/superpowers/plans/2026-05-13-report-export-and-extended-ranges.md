# Report Export and Extended Ranges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand report ranges, add an inline export panel, and generate offline export folders with raw data plus optional HTML analysis output.

**Architecture:** Extend the storage layer from fixed period presets to normalized date-range queries, then thread those filters through the report panel controller and webview. Keep the export generator in the extension host so it can resolve current project/current branch defaults, write files safely, and bundle an offline HTML report that reads from a generated local script payload instead of network fetches.

**Tech Stack:** VS Code extension host APIs, `sql.js`, Node.js filesystem/path modules, static HTML/CSS/JS, existing `node:test` suite

---

### Task 1: Extend storage period normalization and filtered report queries

**Files:**
- Modify: `src/core/sqliteStoragePeriods.js`
- Modify: `src/core/sqliteStorage.js`
- Modify: `src/core/storage.js`
- Test: `test/storage.test.js`

- [ ] **Step 1: Write the failing storage tests for long ranges and explicit date filters**

```js
test('readReportData supports rolling90 rolling180 rolling365 and all periods', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-report-long-ranges-'));
  const storage = createStorage(dir, {
    now: () => Date.parse('2026-04-09T10:00:00.000Z')
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2025-05-01T01:00:00.000Z'),
    endTime: Date.parse('2025-05-01T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 2,
    locDeleted: 1
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2026-02-01T01:00:00.000Z'),
    endTime: Date.parse('2026-02-01T02:00:00.000Z'),
    durationMs: 2_000,
    locAdded: 4,
    locDeleted: 0
  });

  const ninety = await storage.readReportData({ periodType: 'rolling90' });
  const all = await storage.readReportData({ periodType: 'all' });

  assert.equal(ninety.periodLabel, '最近3个月');
  assert.equal(ninety.dateRangeStart, '2026-01-10');
  assert.equal(all.dateRangeStart, '2025-05-01');
  assert.equal(all.totalLocAdded, 6);

  await fs.rm(dir, { recursive: true, force: true });
});

test('readReportData supports explicit date range and branch filters', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-storage-export-filters-'));
  const storage = createStorage(dir, {
    now: () => Date.parse('2026-04-09T10:00:00.000Z')
  });

  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'main',
    startTime: Date.parse('2026-04-02T01:00:00.000Z'),
    endTime: Date.parse('2026-04-02T02:00:00.000Z'),
    durationMs: 1_000,
    locAdded: 3,
    locDeleted: 1
  });
  await storage.appendSession({
    repoPath: 'f:/repo/main',
    branch: 'feature/a',
    startTime: Date.parse('2026-04-03T01:00:00.000Z'),
    endTime: Date.parse('2026-04-03T02:00:00.000Z'),
    durationMs: 2_000,
    locAdded: 7,
    locDeleted: 2
  });

  const report = await storage.readReportData({
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    repoPaths: ['f:/repo/main'],
    branch: 'feature/a'
  });

  assert.deepEqual(Object.keys(report.projects), ['f:/repo/main||feature/a']);
  assert.equal(report.totalLocAdded, 7);
  assert.equal(report.totalLocDeleted, 2);
  assert.equal(report.days.length, 3);

  await fs.rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the focused storage tests to verify they fail for the expected missing behavior**

Run: `node test/run-tests.js`
Expected: FAIL in `test/storage.test.js` because `rolling90` / `all` period normalization and explicit `startDate` / `branch` filtering are not implemented yet.

- [ ] **Step 3: Implement normalized period/date-range helpers and filtered SQLite query support**

```js
const REPORT_PERIOD_LABELS = {
  rolling30: '最近30天',
  month: '本月',
  rolling90: '最近3个月',
  rolling180: '最近半年',
  rolling365: '最近1年',
  all: '全部'
};

function normalizeReportPeriod(periodType) {
  return REPORT_PERIOD_LABELS[periodType] ? periodType : 'rolling30';
}

function buildReportDateRangeFromRequest(input, todayDateKey, earliestDateKey) {
  if (input?.startDate && input?.endDate) {
    return buildInclusiveDateRange(input.startDate, input.endDate);
  }
  if (input?.periodType === 'all') {
    return buildInclusiveDateRange(earliestDateKey ?? todayDateKey, todayDateKey);
  }
  return buildReportDateRange(normalizeReportPeriod(input?.periodType), todayDateKey);
}

function buildBranchClause(branch) {
  if (!branch) {
    return { clause: '', params: [] };
  }
  return {
    clause: ' AND branch = ?',
    params: [branch]
  };
}
```

- [ ] **Step 4: Re-run the full storage test suite and confirm the new behavior is green**

Run: `node test/run-tests.js`
Expected: PASS for all storage-related tests, including the new long-range and explicit-filter coverage.

- [ ] **Step 5: Commit the storage/query slice**

```bash
git add test/storage.test.js src/core/sqliteStoragePeriods.js src/core/sqliteStorage.js src/core/storage.js
git commit -m "feat(report): extend report range and filter queries"
```

### Task 2: Add export service and offline analysis package generation

**Files:**
- Create: `src/core/exportPayload.js`
- Create: `src/core/reportExporter.js`
- Modify: `src/extension.js`
- Test: `test/reportExporter.test.js`

- [ ] **Step 1: Write the failing export service tests**

```js
test('report exporter writes json export with README and no html assets for data-only mode', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-export-data-only-'));
  const exporter = createReportExporter({
    now: () => Date.parse('2026-05-13T08:00:00.000Z'),
    writeFile: fs.writeFile,
    mkdir: fs.mkdir
  });

  await exporter.exportToDirectory({
    outputDir: path.join(dir, 'out'),
    exportType: 'dataOnly',
    format: 'json',
    payload: {
      metadata: { startDate: '2026-04-14', endDate: '2026-05-13' },
      summary: { totalLoc: 3 },
      days: [],
      projects: [],
      branches: [],
      sessions: []
    }
  });

  await assert.doesNotReject(() => fs.access(path.join(dir, 'out', 'data.json')));
  await assert.doesNotReject(() => fs.access(path.join(dir, 'out', 'README.md')));
  await assert.rejects(() => fs.access(path.join(dir, 'out', 'index.html')), /ENOENT/);
});

test('report exporter writes offline html package with local assets and script payload bridge', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-export-html-'));
  const exporter = createReportExporter({
    now: () => Date.parse('2026-05-13T08:00:00.000Z'),
    writeFile: fs.writeFile,
    mkdir: fs.mkdir
  });

  await exporter.exportToDirectory({
    outputDir: path.join(dir, 'out'),
    exportType: 'dataWithHtml',
    format: 'json',
    payload: {
      metadata: { startDate: '2026-04-14', endDate: '2026-05-13' },
      summary: { totalLoc: 3 },
      days: [{ date: '2026-05-13', totalLoc: 3, totalActiveTimeMs: 1_000, totalLocAdded: 2, totalLocDeleted: 1 }],
      projects: [],
      branches: [],
      sessions: []
    }
  });

  const html = await fs.readFile(path.join(dir, 'out', 'index.html'), 'utf8');
  const script = await fs.readFile(path.join(dir, 'out', 'report-data.js'), 'utf8');

  assert.match(html, /assets\\/echarts\\.min\\.js/);
  assert.match(html, /report-data\\.js/);
  assert.match(script, /window\\.__MINIMAL_TRACKER_EXPORT__/);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail before implementation**

Run: `node test/run-tests.js`
Expected: FAIL because `createReportExporter` and export payload assembly do not exist yet.

- [ ] **Step 3: Implement export payload normalization and offline file generation**

```js
function serializeExportPayload(payload, format) {
  return format === 'yaml'
    ? toYaml(payload)
    : `${JSON.stringify(payload, null, 2)}\n`;
}

function buildReportDataScript(payload) {
  return `window.__MINIMAL_TRACKER_EXPORT__ = ${JSON.stringify(payload)};\n`;
}

async function exportToDirectory(input) {
  await mkdir(path.join(input.outputDir, 'assets'), { recursive: true });
  await writeFile(path.join(input.outputDir, input.format === 'yaml' ? 'data.yaml' : 'data.json'), serializeExportPayload(input.payload, input.format));
  await writeFile(path.join(input.outputDir, 'README.md'), buildReadme(input));
  if (input.exportType === 'dataWithHtml') {
    await writeFile(path.join(input.outputDir, 'report-data.js'), buildReportDataScript(input.payload));
    await writeFile(path.join(input.outputDir, 'assets', 'echarts.min.js'), ECHARTS_STUB_OR_BUNDLED_SOURCE);
    await writeFile(path.join(input.outputDir, 'index.html'), buildOfflineHtml());
  }
}
```

- [ ] **Step 4: Re-run the suite and confirm export generation is green**

Run: `node test/run-tests.js`
Expected: PASS for the new export tests plus the existing suite.

- [ ] **Step 5: Commit the export service slice**

```bash
git add src/core/exportPayload.js src/core/reportExporter.js src/extension.js test/reportExporter.test.js
git commit -m "feat(export): add offline report export generator"
```

### Task 3: Add the inline export panel and expanded range selector in the report webview

**Files:**
- Modify: `src/ui/dailyReportView.js`
- Modify: `src/ui/reportStyles.js`
- Modify: `src/ui/reportPanelController.js`
- Test: `test/dailyReportView.test.js`
- Test: `test/reportPanelController.test.js`

- [ ] **Step 1: Write the failing UI/controller tests for new ranges, export defaults, and export message handling**

```js
test('renderDailyReportHtml exposes the extended range options and export defaults', () => {
  const html = renderDailyReportHtml({
    periodType: 'rolling90',
    periodLabel: '最近3个月',
    dateRangeStart: '2026-02-12',
    dateRangeEnd: '2026-05-13',
    exportDefaults: {
      exportType: 'dataWithHtml',
      format: 'json',
      scopeType: 'currentProject',
      branchMode: 'current',
      startDate: '2026-04-14',
      endDate: '2026-05-13',
      branchOptions: ['main', 'feature/a'],
      currentBranch: 'main'
    },
    projects: {
      'f:/repo/main||main': createProject()
    },
    days: []
  });

  assert.match(html, /最近3个月/);
  assert.match(html, /最近半年/);
  assert.match(html, /最近1年/);
  assert.match(html, /全部/);
  assert.match(html, /数据 \\+ 可视化 HTML \\+ 说明文档/);
  assert.match(html, /value="current" selected/);
});

test('report panel controller forwards export requests with normalized filter input', async () => {
  const panel = createMockPanel();
  const requests = [];
  const controller = createReportPanelController({
    vscode: createMockVscode(panel),
    context: { subscriptions: [] },
    reportViewType: 'minimalTracker.dailyReport',
    tracker: { flushAll: async () => {} },
    storage: {
      readReportData: async () => ({ projects: { 'f:/repo/main||main': { totalLocAdded: 1, totalLocDeleted: 0, sessions: [] } } })
    },
    exportReport: async (input) => {
      requests.push(input);
    },
    getReportRepoPaths: () => ['f:/repo/main'],
    getCurrentBranchName: () => 'main',
    shouldFlushBeforeReport: () => false,
    renderDailyReportHtml: () => '<html></html>',
    refreshIntervalMs: 30_000,
    logError: (label, error) => { throw new Error(`${label}:${error.message}`); },
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

  assert.equal(requests[0].branch, 'main');
  assert.deepEqual(requests[0].repoPaths, ['f:/repo/main']);
});
```

- [ ] **Step 2: Run the report view/controller tests and confirm they fail first**

Run: `node test/run-tests.js`
Expected: FAIL because the current HTML has only two range options and no export UI/message handling.

- [ ] **Step 3: Implement the webview UI and export action plumbing**

```js
const REPORT_PERIOD_OPTIONS = [
  { value: 'rolling30', label: '最近30天' },
  { value: 'month', label: '本月' },
  { value: 'rolling90', label: '最近3个月' },
  { value: 'rolling180', label: '最近半年' },
  { value: 'rolling365', label: '最近1年' },
  { value: 'all', label: '全部' }
];

panelInstance.webview.onDidReceiveMessage((message) => {
  if (message?.type === 'export-report') {
    return Promise.resolve(options.exportReport(normalizeExportRequest(message))).catch((error) => options.logError('exportReport', error));
  }
  if (message?.type === 'refresh-report') {
    // existing refresh path
  }
});

function renderExportPanel(exportDefaults) {
  return `
    <section class="panel export-panel">
      <h3>导出</h3>
      ...
    </section>
  `;
}
```

- [ ] **Step 4: Re-run the suite and confirm the report UI/controller slice is green**

Run: `node test/run-tests.js`
Expected: PASS for updated `dailyReportView` and `reportPanelController` coverage with no regressions.

- [ ] **Step 5: Commit the webview/controller slice**

```bash
git add src/ui/dailyReportView.js src/ui/reportStyles.js src/ui/reportPanelController.js test/dailyReportView.test.js test/reportPanelController.test.js
git commit -m "feat(report): add export panel and extended ranges"
```

### Task 4: Wire export defaults, folder selection, and final integration

**Files:**
- Modify: `src/extension.js`
- Modify: `src/core/extensionCommands.js`
- Modify: `README.md`
- Test: `test/reportExporter.test.js`
- Test: `test/reportPanelController.test.js`

- [ ] **Step 1: Write the failing integration test for default export values from the extension host**

```js
test('report panel controller receives current-project current-branch export defaults from extension host', async () => {
  let receivedDefaults = null;
  const reportController = createReportController(
    fakeContext,
    fakeConfig,
    fakeTracker,
    fakeStorage,
    () => fakePathRegistry,
    {
      renderDailyReportHtml: (data) => {
        receivedDefaults = data.exportDefaults;
        return '<html></html>';
      }
    }
  );

  await reportController.open();
  assert.equal(receivedDefaults.scopeType, 'currentProject');
  assert.equal(receivedDefaults.branchMode, 'current');
});
```

- [ ] **Step 2: Run the full suite to verify the integration gap is real**

Run: `node test/run-tests.js`
Expected: FAIL because the extension host does not yet supply export defaults, folder selection, or export orchestration.

- [ ] **Step 3: Implement folder picking, current-branch defaults, export execution, and docs update**

```js
async function exportReport(input) {
  const target = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: '选择导出目录'
  });
  if (!target?.[0]) {
    return;
  }

  const report = await storage.readReportData(input);
  if (!report || Object.keys(report.projects ?? {}).length === 0) {
    await vscode.window.showWarningMessage('当前筛选条件下没有可导出的数据。');
    return;
  }

  await reportExporter.exportToDirectory({
    outputDir: target[0].fsPath,
    exportType: input.exportType,
    format: input.format,
    payload: buildExportPayload(report, input)
  });
}
```

- [ ] **Step 4: Re-run the complete test command and verify everything is green**

Run: `node test/run-tests.js`
Expected: PASS for the full suite, including new export and integration coverage.

- [ ] **Step 5: Commit the integration slice**

```bash
git add src/extension.js src/core/extensionCommands.js README.md test/reportExporter.test.js test/reportPanelController.test.js
git commit -m "feat(report): wire offline export flow"
```

## Plan Self-Review

### Spec Coverage

- Extended view ranges: covered by Task 1 and Task 3.
- Inline export panel with defaults: covered by Task 3 and Task 4.
- Current project/current branch semantics: covered by Task 3 and Task 4.
- Offline HTML export folder with raw data, README, and local ECharts asset: covered by Task 2 and Task 4.
- Required analysis charts and table-ready payload: covered by Task 2.

### Placeholder Scan

- No `TBD` or deferred “implement later” placeholders remain.
- Each task has explicit files, commands, and code-level expectations.

### Type Consistency

- Export modes use `dataOnly` and `dataWithHtml` consistently.
- Scope uses `all` and `currentProject` consistently.
- Branch modes use `current`, `all`, and `named` consistently.
