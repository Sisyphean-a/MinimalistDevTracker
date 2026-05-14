const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createReportExporter } = require('../src/core/reportExporter');

function createPayload() {
  return {
    metadata: {
      exportedAt: Date.parse('2026-05-13T08:00:00.000Z'),
      exportedAtIso: '2026-05-13T08:00:00.000Z',
      exportType: 'dataWithHtml',
      format: 'json',
      scopeType: 'currentProject',
      repoPaths: ['f:/repo/main'],
      branchMode: 'current',
      branchName: 'main',
      requestedStartDate: '2026-02-01',
      requestedEndDate: '2026-05-13',
      startDate: '2026-04-14',
      endDate: '2026-05-13',
      sessionSizeThreshold: 50,
      showProjectContribution: false,
      showBranchContribution: false
    },
    summary: {
      totalActiveTimeMs: 3_600_000,
      totalTrackedLoc: 9,
      totalUntrackedLoc: 1,
      totalTrackedLocAdded: 7,
      totalTrackedLocDeleted: 2,
      totalUntrackedLocAdded: 1,
      totalUntrackedLocDeleted: 0,
      totalLocAdded: 8,
      totalLocDeleted: 2,
      totalLoc: 10,
      sessionCount: 1,
      projectCount: 1,
      branchCount: 1,
      activeDayCount: 1
    },
    days: [
      {
        date: '2026-05-13',
        totalActiveTimeMs: 3_600_000,
        trackedLocAdded: 7,
        trackedLocDeleted: 2,
        untrackedLocAdded: 1,
        untrackedLocDeleted: 0,
        totalLocAdded: 8,
        totalLocDeleted: 2,
        totalLoc: 10
      }
    ],
    projects: [
      {
        repoPath: 'f:/repo/main',
        totalActiveTimeMs: 3_600_000,
        trackedLocAdded: 7,
        trackedLocDeleted: 2,
        untrackedLocAdded: 1,
        untrackedLocDeleted: 0,
        totalLocAdded: 8,
        totalLocDeleted: 2,
        trackedTotalLoc: 9,
        untrackedTotalLoc: 1,
        totalLoc: 10
      }
    ],
    branches: [
      {
        branch: 'main',
        totalActiveTimeMs: 3_600_000,
        trackedLocAdded: 7,
        trackedLocDeleted: 2,
        untrackedLocAdded: 1,
        untrackedLocDeleted: 0,
        totalLocAdded: 8,
        totalLocDeleted: 2,
        trackedTotalLoc: 9,
        untrackedTotalLoc: 1,
        totalLoc: 10
      }
    ],
    fileTypes: [
      {
        fileType: 'js',
        trackedLocAdded: 7,
        trackedLocDeleted: 2,
        untrackedLocAdded: 0,
        untrackedLocDeleted: 0,
        locAdded: 7,
        locDeleted: 2
      },
      {
        fileType: 'md',
        trackedLocAdded: 0,
        trackedLocDeleted: 0,
        untrackedLocAdded: 1,
        untrackedLocDeleted: 0,
        locAdded: 1,
        locDeleted: 0
      }
    ],
    sessions: [
      {
        repoPath: 'f:/repo/main',
        branch: 'main',
        startTime: Date.parse('2026-05-13T01:00:00.000Z'),
        endTime: Date.parse('2026-05-13T02:00:00.000Z'),
        durationMs: 3_600_000,
        trackedLocAdded: 7,
        trackedLocDeleted: 2,
        untrackedLocAdded: 1,
        untrackedLocDeleted: 0,
        locAdded: 8,
        locDeleted: 2,
        trackedTotalLoc: 9,
        untrackedTotalLoc: 1,
        totalLoc: 10
      },
      {
        repoPath: 'f:/repo/main',
        branch: 'main',
        startTime: Date.parse('2026-05-12T01:00:00.000Z'),
        endTime: Date.parse('2026-05-12T02:00:00.000Z'),
        durationMs: 3_600_000,
        trackedLocAdded: 60,
        trackedLocDeleted: 0,
        untrackedLocAdded: 0,
        untrackedLocDeleted: 0,
        locAdded: 60,
        locDeleted: 0,
        trackedTotalLoc: 60,
        untrackedTotalLoc: 0,
        totalLoc: 60
      }
    ]
  };
}

test('report exporter writes json export with README and no html assets for data-only mode', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-export-data-only-'));
  const outputDir = path.join(dir, 'out');
  const exporter = createReportExporter();

  await exporter.exportToDirectory({
    outputDir,
    exportType: 'dataOnly',
    format: 'json',
    payload: createPayload()
  });

  const data = JSON.parse(await fs.readFile(path.join(outputDir, 'data.json'), 'utf8'));
  const readme = await fs.readFile(path.join(outputDir, 'README.md'), 'utf8');

  assert.equal(data.summary.totalLoc, 10);
  assert.match(readme, /导出范围/);
  await assert.rejects(() => fs.access(path.join(outputDir, 'index.html')), /ENOENT/);
  await assert.rejects(() => fs.access(path.join(outputDir, 'report-data.js')), /ENOENT/);

  await fs.rm(dir, { recursive: true, force: true });
});

test('report exporter writes yaml export when requested', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-export-yaml-'));
  const outputDir = path.join(dir, 'out');
  const exporter = createReportExporter();

  await exporter.exportToDirectory({
    outputDir,
    exportType: 'dataOnly',
    format: 'yaml',
    payload: createPayload()
  });

  const yaml = await fs.readFile(path.join(outputDir, 'data.yaml'), 'utf8');
  assert.match(yaml, /metadata:/);
  assert.match(yaml, /summary:/);
  assert.match(yaml, /totalLoc: 10/);

  await fs.rm(dir, { recursive: true, force: true });
});

test('report exporter writes offline html package with local assets and script payload bridge', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-export-html-'));
  const outputDir = path.join(dir, 'out');
  const exporter = createReportExporter({
    echartsSource: 'window.echarts = { init: function(){ return { setOption: function(){} }; } };\n'
  });

  await exporter.exportToDirectory({
    outputDir,
    exportType: 'dataWithHtml',
    format: 'json',
    payload: createPayload()
  });

  const html = await fs.readFile(path.join(outputDir, 'index.html'), 'utf8');
  const trackedHtml = await fs.readFile(path.join(outputDir, 'report-git-tracked.html'), 'utf8');
  const totalHtml = await fs.readFile(path.join(outputDir, 'report-total.html'), 'utf8');
  const script = await fs.readFile(path.join(outputDir, 'report-data.js'), 'utf8');
  const echarts = await fs.readFile(path.join(outputDir, 'assets', 'echarts.min.js'), 'utf8');
  const css = await fs.readFile(path.join(outputDir, 'assets', 'report.css'), 'utf8');

  assert.match(html, /report-git-tracked\.html/);
  assert.match(html, /report-total\.html/);
  assert.match(trackedHtml, /纯 Git 跟踪口径/);
  assert.match(totalHtml, /包含未跟踪文件总量口径/);
  assert.equal((trackedHtml.match(/<h2>Git 已跟踪总变更<\/h2>/g) ?? []).length, 1);
  assert.match(trackedHtml, /单次代码改动行数分布（区间次数）/);
  assert.match(trackedHtml, /单次代码改动行数分布（区间总代码行数）/);
  assert.match(trackedHtml, /单次代码改动行数分布（区间总花费时间）/);
  assert.doesNotMatch(trackedHtml, /单次改动规模占比/);
  assert.doesNotMatch(trackedHtml, /treemap/);
  assert.doesNotMatch(trackedHtml, /id="project-main-chart"/);
  assert.doesNotMatch(trackedHtml, /id="branch-main-chart"/);
  assert.ok(trackedHtml.indexOf('id="weekday-main-chart"') < trackedHtml.indexOf('id="hour-main-chart"'));
  assert.match(trackedHtml, /chart-row/);
  assert.match(script, /window\.__MINIMAL_TRACKER_EXPORT__/);
  assert.match(script, /"totalLoc":10/);
  assert.match(echarts, /window\.echarts/);
  assert.match(css, /\.panel-stack/);
  assert.match(css, /grid-template-columns:1fr 1fr/);

  await fs.rm(dir, { recursive: true, force: true });
});
