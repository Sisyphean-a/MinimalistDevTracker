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
      startDate: '2026-04-14',
      endDate: '2026-05-13'
    },
    summary: {
      totalActiveTimeMs: 3_600_000,
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
        totalLocAdded: 8,
        totalLocDeleted: 2,
        totalLoc: 10
      }
    ],
    projects: [],
    branches: [],
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
        locDeleted: 2
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
  const script = await fs.readFile(path.join(outputDir, 'report-data.js'), 'utf8');
  const echarts = await fs.readFile(path.join(outputDir, 'assets', 'echarts.min.js'), 'utf8');

  assert.match(html, /assets\/echarts\.min\.js/);
  assert.match(html, /report-data\.js/);
  assert.match(script, /window\.__MINIMAL_TRACKER_EXPORT__/);
  assert.match(script, /"totalLoc":10/);
  assert.match(echarts, /window\.echarts/);

  await fs.rm(dir, { recursive: true, force: true });
});
