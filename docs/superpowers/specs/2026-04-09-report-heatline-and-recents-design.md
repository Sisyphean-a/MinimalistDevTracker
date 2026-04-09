# Report Heatline and Recents Design

## Context

The current report view renders daily activity as a grid of per-day heat cells. That presentation is too blocky, duplicates numeric information visually, and does a poor job of separating "ambient trend" from "exact values". The session detail table also renders the full set of sessions in the selected range, which makes the report noisy and harder to scan.

The desired redesign is:

- Replace the current block-based heat section with a true single-axis heatline.
- Move exact day-level values into a concise table that only shows dates with non-zero activity.
- Show only recent session entries by default instead of the full session history.

## Goals

- Make the top trend area feel like a continuous timeline rather than a grid of cards.
- Use visual trend and exact numbers for different purposes instead of mixing them into the same component.
- Reduce report noise by defaulting session details to the most recent items only.
- Preserve the current report periods (`rolling30`, `month`) and existing data semantics.

## Non-Goals

- Changing the underlying storage or report aggregation model.
- Adding drill-down charts, pagination, or filter builders in this pass.
- Adding hover tooltips, sparkline point markers, or advanced animation unless needed to support clarity.

## Recommended Structure

The report should render these sections in order:

1. Header and summary cards
2. Continuous heatline
3. Non-zero daily statistics table
4. Project summary table
5. File type summary table
6. Recent sessions table

This keeps the eye flow simple:

- overall impression first
- precise day-level numbers second
- aggregated project/file-type context third
- raw recent session detail last

## Section 1: Continuous Heatline

### Purpose

This section is intentionally visual-first and data-light. It should not display exact values. Its job is to show rhythm, density, and contrast across the selected date range.

### Layout

- Render a single horizontal timeline strip across the container width.
- Map the full selected date range from left to right.
- Use a continuous background gradient that changes color intensity according to daily total active time.
- Do not split the strip into boxed cells.
- Do not render numeric labels inside the strip.

### Supporting Labels

Keep labels minimal:

- range start at the left edge
- range end at the right edge
- optional small caption such as "活跃趋势"

Do not label every day inside this section.

### Visual Rules

- Base track uses a very light neutral background.
- Active segments blend into a darker accent through a continuous gradient.
- Zero-value days remain near the base tone.
- High-activity days become visually saturated.
- The strip should have rounded ends and read as one connected band.

### Data Mapping

Input:

- `dailyData.days`

Metric:

- `totalActiveTimeMs`

Normalization:

- compute max active time within the selected range
- each day maps to `0..1`
- each segment contributes one color stop pair to the final gradient

This section intentionally ignores LOC values to keep the visual encoding singular and easy to parse.

## Section 2: Non-Zero Daily Statistics Table

### Purpose

This table replaces the current attempt to encode both trend and values in the heat area. It provides exact values only for meaningful days.

### Rows

Only include days where either:

- `totalActiveTimeMs > 0`, or
- `totalLoc > 0`

Since the tracker already skips zero-LOC sessions, the active day list will naturally stay compact.

### Columns

- `日期`
- `总时长`
- `总行数`

Definitions:

- `总时长` = day-level `totalActiveTimeMs`
- `总行数` = `totalLocAdded + totalLocDeleted`

### Sorting

- Sort rows by date descending so the newest active day appears first.

### Empty State

If no days have values:

- render a single-row empty state like `当前范围内暂无活跃日期数据`

## Section 3: Recent Sessions Table

### Purpose

Session details should help answer "what happened recently", not dump the full raw history.

### Behavior

- Sort sessions by `endTime` descending.
- Show only the most recent N rows.
- Default N = `20`

This keeps the section useful while preventing the report from becoming a long scroll.

### Scope

- Only consider sessions already included in the selected report range.
- Do not reach outside the selected period.

### Optional Future Extension

If more history is needed later, add an explicit "查看更多" action. Do not add that in this pass.

## Data Contract Changes

The existing `readReportData` response shape is already sufficient for the redesign. No storage contract expansion is required.

The UI layer should derive:

- `activeDays = dailyData.days.filter(...)`
- `recentSessions = flattened sessions sorted by `endTime` descending, then sliced to N`

Suggested new UI constants:

- `RECENT_SESSION_LIMIT = 20`

## Rendering Details

### Heatline Implementation

Build the CSS gradient from `dailyData.days`:

- compute one stop range per day across the full width
- each day contributes a color determined by normalized active time
- join all stops into a single `linear-gradient(90deg, ...)`

Example visual direction:

- zero: `#edf3f1`
- low: `#d4e8df`
- medium: `#8ecdb6`
- high: `#2fa17f`
- peak: `#0f7b62`

The exact palette can be tuned, but the structure should remain a continuous band.

### Daily Stats Table Formatting

- `日期`: keep ISO date key display as-is
- `总时长`: use current duration formatter, but optimize for readability at day scale
- `总行数`: plain integer total

### Recent Sessions Table Formatting

Keep the current columns unless a column is clearly redundant:

- 仓库
- 分支
- 开始
- 结束
- 时长
- 已跟踪变更
- 未跟踪新文件
- 总变更行

Only the row count changes in this pass.

## File Impact

### `src/ui/dailyReportView.js`

Primary change area.

Responsibilities:

- remove current heat-cell grid rendering
- add continuous heatline rendering helper
- add non-zero daily stats table helper
- limit session rows to recent items

### `test/dailyReportView.test.js`

Update coverage for:

- heatline renders as a single timeline-style section
- non-zero daily stats table only shows active days
- zero-value days are absent from the stats table
- recent sessions are limited to the newest entries

### `src/core/storage.js` / SQLite storage modules

No data contract change required unless helper fields are added purely for convenience. This redesign should primarily stay in the UI layer.

## Risks

### Risk: Heatline becomes too abstract

Mitigation:

- keep the exact-value table directly under it
- include start/end labels and a short caption

### Risk: Recent-only sessions hide older entries users care about

Mitigation:

- choose a conservative default limit like `20`
- keep the period selector visible so users can change scope first

### Risk: Too many active days still create a tall table

Mitigation:

- only show non-zero rows
- sort newest first
- keep the table compact and visually secondary to the heatline

## Acceptance Criteria

- The top activity section is rendered as one continuous heatline, not boxed daily cells.
- The heatline does not display exact numeric values inside the band.
- A day-level table exists with exactly three columns: `日期`, `总时长`, `总行数`.
- The day-level table only shows dates with non-zero values.
- Session details are sorted by recency and limited to recent entries by default.
- Existing report period switching still works for both `rolling30` and `month`.
