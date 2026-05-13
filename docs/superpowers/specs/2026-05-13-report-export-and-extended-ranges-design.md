# Report Export and Extended Ranges Design

## Context

The current report experience is optimized for short-term viewing only:

- report periods only support `最近30天` and `本月`
- there is no export workflow
- the current top heatline is built from hour buckets across the whole visible range

The requested expansion introduces two connected capabilities:

1. richer viewing ranges:
   - `最近30天`
   - `本月`
   - `最近3个月`
   - `最近半年`
   - `最近1年`
   - `全部`
2. a new export workflow with two modes:
   - `纯数据`
   - `数据 + 可视化 HTML + 说明文档`

The user also confirmed these product decisions:

- export result should primarily be a folder, not a single file
- export HTML must open offline by double-click on Windows
- export date uses explicit start and end dates
- export target `当前项目` means the currently tracked repository/worktree in the current VS Code window
- export format excludes database and keeps only `JSON` and `YAML`
- export panel fields must have defaults:
  - export type default: `数据 + 可视化 HTML + 说明文档`
  - export format default: `JSON`
  - export target default: `当前项目`
  - export branch default: `当前分支`
  - export date default: `最近一个月`

## Goals

- Expand report viewing ranges without breaking the current report workflow.
- Add a guided export flow inside the report webview instead of forcing a separate command-first experience.
- Keep the export result directly usable on Windows with no local server requirement.
- Reuse one filtering model across report view and export as much as possible.
- Generate an analysis package that contains raw data, readable narrative guidance, and offline charts.

## Non-Goals

- Exporting SQLite or other database files.
- Adding remote upload, cloud sync, or sharing links.
- Building a separate desktop app or standalone executable viewer.
- Adding Excel output in this pass.
- Reworking the underlying tracking model or session storage schema.

## Recommended Product Shape

Use **方案 1** as the approved direction:

1. enhance the existing report page
2. add an inline export panel inside the existing webview
3. generate an offline export folder

This keeps three things aligned:

- what the user is currently looking at
- what the export form defaults to
- what the storage layer can query efficiently

## Report Range Expansion

### Supported View Ranges

The report header period selector should support:

- `rolling30` -> `最近30天`
- `month` -> `本月`
- `rolling90` -> `最近3个月`
- `rolling180` -> `最近半年`
- `rolling365` -> `最近1年`
- `all` -> `全部`

### Semantics

- `最近30天`: today inclusive, previous 29 days
- `本月`: first day of the current month through today
- `最近3个月`: today inclusive, previous 89 days
- `最近半年`: today inclusive, previous 179 days
- `最近1年`: today inclusive, previous 364 days
- `全部`: earliest tracked `date_key` through today

### Important UI Adjustment

The current hour-bucket heatline should not be stretched unchanged into very long ranges.

For long ranges:

- the main report trend section should move toward day-level trend reading
- hour-of-day analysis should become its own chart
- the export HTML should carry the richer analytical visualizations

This avoids rendering thousands of hour cells for `最近1年` or `全部`.

## Export Entry and Panel

### Entry

Add an `导出` button to the report header beside the current period selector and refresh button.

Clicking the button opens an inline export panel within the current webview. The panel should not navigate away from the report and should be closable without losing the current report state.

### Fields

The export panel must include:

- `导出类型`
- `导出格式`
- `导出目标`
- `导出分支`
- `导出日期`

### Field Rules

#### `导出类型`

Options:

- `纯数据`
- `数据 + 可视化 HTML + 说明文档`

Default:

- `数据 + 可视化 HTML + 说明文档`

#### `导出格式`

Options:

- `JSON`
- `YAML`

Default:

- `JSON`

#### `导出目标`

Options:

- `全部`
- `当前项目`

Default:

- `当前项目`

Meaning of `当前项目`:

- the repository or worktree currently tracked in the active VS Code window scope

#### `导出分支`

Visibility and enablement:

- only enabled when `导出目标 = 当前项目`
- disabled and cleared when `导出目标 = 全部`

Options when enabled:

- `当前分支`
- `全部分支`
- every recorded branch under the current project

Default:

- `当前分支`

Fallback if current branch cannot be resolved:

- use `全部分支`

#### `导出日期`

Shape:

- `开始日期`
- `结束日期`

Default:

- a rolling last-month range ending today

Equivalent default:

- today inclusive and previous 29 days

Validation:

- start date required
- end date required
- start date must be `<=` end date
- end date cannot be later than today

### Default Behavior Notes

The panel should open prefilled with the approved defaults every time it is launched in this pass.

Do not add persistence of prior export selections yet. Resetting to known defaults keeps the first version predictable.

## Unified Query Model

Viewing and exporting should be driven by one normalized filter object.

Suggested shape:

```js
{
  scopeType: 'all' | 'currentProject',
  repoPaths: string[] | null,
  branchMode: 'current' | 'all' | 'named',
  branchName: string | null,
  startDate: 'YYYY-MM-DD',
  endDate: 'YYYY-MM-DD'
}
```

### Why Unify

This prevents divergence between:

- report period selection
- export form values
- storage query conditions

The report view can still start from quick range options, but those options should normalize into the same `startDate` and `endDate` pair used by export.

## Storage and Query Changes

### Current Strengths

The current storage already records:

- `date_key`
- `repo_path`
- `branch`
- session timestamps
- LOC metrics

That is enough to support the requested filters.

### Required Additions

Add a generalized report/export query entry point that supports:

- explicit `startDate`
- explicit `endDate`
- optional repo path filter
- optional branch filter

This query should return:

- summary totals
- day-level aggregates
- project aggregates
- branch aggregates where relevant
- session-level rows

### `全部` Range Resolution

For `全部`, query the minimum available `date_key` from the database and use it as the normalized start date.

If no data exists:

- keep the current empty-state behavior
- disable or no-op export with a clear empty-state message

## Export Output Shapes

### Mode 1: `纯数据`

Output folder contents:

- `data.json` or `data.yaml`
- `README.md`

Purpose:

- raw structured export
- easy to inspect
- easy to reuse in scripts

### Mode 2: `数据 + 可视化 HTML + 说明文档`

Output folder contents:

- `index.html`
- `data.json` or `data.yaml`
- `report-data.js`
- `README.md`
- `assets/echarts.min.js`
- optional small local stylesheet such as `assets/report.css`

Purpose:

- offline interactive report
- raw export copy
- human-readable documentation

## Why `report-data.js` Is Required

The exported HTML is expected to open by double-click via `file://`.

To keep that reliable:

- do not rely on `fetch('data.json')` from the exported HTML
- instead generate `report-data.js` that assigns the normalized export payload onto a known global

Suggested shape:

```js
window.__MINIMAL_TRACKER_EXPORT__ = { /* normalized export payload */ };
```

This preserves both goals:

- raw JSON or YAML remains available as a real exported data file
- the HTML can render immediately offline without local web server assumptions

## Data Contract for Export

Use one canonical export payload regardless of JSON or YAML target.

Suggested top-level shape:

```js
{
  metadata: {
    exportedAt: number,
    exportedAtIso: string,
    exportType: 'dataOnly' | 'dataWithHtml',
    format: 'json' | 'yaml',
    scopeType: 'all' | 'currentProject',
    repoPaths: string[] | null,
    branchMode: 'current' | 'all' | 'named',
    branchName: string | null,
    startDate: string,
    endDate: string
  },
  summary: {
    totalActiveTimeMs: number,
    totalTrackedLocAdded: number,
    totalTrackedLocDeleted: number,
    totalUntrackedLocAdded: number,
    totalUntrackedLocDeleted: number,
    totalLocAdded: number,
    totalLocDeleted: number,
    totalLoc: number,
    sessionCount: number,
    projectCount: number,
    branchCount: number,
    activeDayCount: number
  },
  days: [],
  projects: [],
  branches: [],
  sessions: []
}
```

### Notes

- `days` should contain one row per date in the selected range, including zero-filled days
- `projects` should contain aggregate rows for the filtered export scope
- `branches` should contain aggregate rows only for the included scope
- `sessions` should preserve exact session-level details for the selected range

## Analysis HTML Design

### Delivery Choice

Keep the analysis report as `HTML`.

Reason:

- direct double-click open on Windows
- easiest container for tables, narrative sections, and charts together
- lowest friction compared with requiring Markdown preview or separate tooling

### Chart Library Recommendation

Use `ECharts` bundled locally into the export folder.

Reason:

- strong line, bar, scatter, pie, and heatmap support
- fits the requested analytical charts
- works well in a static offline HTML when the script is copied locally

Do not use CDN loading for the exported report.

## Required Charts and Tables

### 1. Daily LOC Trend

Purpose:

- show code change intensity over time

Recommended chart:

- combined bar + line chart

Series:

- daily total LOC changed
- daily LOC added
- daily LOC deleted
- optional daily active duration line on secondary axis

X-axis:

- `days[].date`

### 2. Hour-of-Day Activity Distribution

Purpose:

- answer “usually what time periods am I coding”

Recommended chart:

- 24-bucket bar chart

Buckets:

- `00:00-00:59`
- ...
- `23:00-23:59`

Metric options:

- total active duration per hour bucket
- optional session count per hour bucket

This should aggregate across all included data in the export range, not per day.

### 3. Session Change Detail Table

Purpose:

- list each tracked change session and its change size

Columns:

- `仓库`
- `分支`
- `开始时间`
- `结束时间`
- `时长`
- `已跟踪新增`
- `已跟踪删除`
- `未纳入 Git 新增`
- `未纳入 Git 删除`
- `总变更行数`
- `变更量级区间`

Suggested `变更量级区间` buckets:

- `0-49`
- `50-199`
- `200-499`
- `500-999`
- `1000+`

### 4. Project Contribution Chart

Purpose:

- show which repositories dominate the selected range

Recommended chart:

- bar chart for top projects

Metric:

- total LOC changed

If export scope is `当前项目`, this chart can be hidden or replaced by a compact summary note.

### 5. Branch Contribution Chart

Purpose:

- show branch distribution inside current-project exports

Recommended chart:

- horizontal bar chart

Metric:

- total LOC changed or total active duration

Visibility:

- only when export scope is `当前项目` and branch mode includes multiple branches

### 6. File Type Distribution

Purpose:

- show which file types dominate edits

Recommended chart:

- stacked bar or donut chart

Metric:

- total LOC by file type

### 7. Weekday Distribution

Purpose:

- show which weekdays are most active

Recommended chart:

- seven-bar chart

Metric:

- total active duration or total LOC by weekday

## Documentation File

Generate `README.md` in the export folder.

It should explain:

- what was exported
- export filter conditions
- generated time
- how to open `index.html`
- what each chart means
- limitations of the metrics

This README is not just a technical manifest. It should serve as the “说明文档” the user requested.

## Report Page Updates

### Header

Add:

- expanded range selector
- export button

Keep:

- refresh button

### Main Trend Section

Keep the report webview lightweight compared with the export HTML.

Recommended direction:

- use a day-level trend visualization in the report for long ranges
- reserve multi-chart analysis for export output

This keeps the in-editor report fast and readable.

## Validation and Empty States

### Form Validation

Export submit should block with a visible error if:

- date range is invalid
- current project cannot be resolved for `当前项目`
- no current branch can be resolved and the branch mode demands a branch-specific export

### Empty Result

If the final filter matches no sessions:

- do not emit an empty-looking folder silently
- show a clear message in VS Code
- optionally allow user to confirm empty export later, but not in this pass

## YAML Strategy

To avoid unnecessary root dependency changes in the first implementation:

- use JSON as the canonical internal export payload
- generate YAML from the same in-memory object
- prefer a minimal deterministic serializer or a tightly scoped helper

Do not redesign the whole project around YAML parsing concerns.

## File Impact

### UI Layer

- `src/ui/dailyReportView.js`
- `src/ui/reportStyles.js`
- `src/ui/reportPanelController.js`

Primary responsibilities:

- render expanded range options
- render export button and export panel
- post export actions/messages back to the extension host

### Storage Layer

- `src/core/sqliteStorage.js`
- `src/core/sqliteStoragePeriods.js`
- possibly a new focused export/query helper module

Primary responsibilities:

- support explicit start/end date queries
- support branch filtering
- support `all` range resolution

### Extension Host Layer

- `src/extension.js`
- `src/core/extensionCommands.js` if export command surface grows
- likely a new export service module

Primary responsibilities:

- resolve current project/current branch defaults
- open folder picker
- create export directory
- write output files

### Tests

- `test/dailyReportView.test.js`
- `test/reportPanelController.test.js`
- `test/storage.test.js`
- new export-focused tests for filter normalization and file generation helpers

## Risks

### Risk: Long-range report view becomes slow or noisy

Mitigation:

- do not reuse the current hour-grid visualization for long ranges
- keep report webview lighter than export HTML

### Risk: Offline HTML opens but charts fail to load

Mitigation:

- ship local `echarts.min.js`
- avoid network dependencies
- avoid runtime `fetch` reliance for local data loading

### Risk: Export defaults confuse users if they expect current-view mirroring

Mitigation:

- make defaults explicit in the panel UI
- display the effective filter summary before confirm

### Risk: Branch filtering becomes ambiguous for all-project exports

Mitigation:

- only enable branch selection for `当前项目`
- disable and clear it for `全部`

## Acceptance Criteria

- Report range selector supports `最近30天`、`本月`、`最近3个月`、`最近半年`、`最近1年`、`全部`.
- Report header includes an inline export entry.
- Export panel includes `导出类型`、`导出格式`、`导出目标`、`导出分支`、`导出日期`.
- Export panel defaults are:
  - `数据 + 可视化 HTML + 说明文档`
  - `JSON`
  - `当前项目`
  - `当前分支`
  - `最近一个月`
- Branch selector is only enabled for `当前项目`.
- Pure-data export generates raw JSON or YAML plus README.
- Analysis export generates an offline-openable folder with HTML, raw data, README, and local chart assets.
- Exported HTML renders without requiring a local server.
- Export analysis includes:
  - daily LOC trend
  - hour-of-day activity distribution
  - session-level change detail table
  - at least the recommended supporting charts that fit the selected scope
- Empty exports are blocked with a clear message instead of silently writing unusable output.
