# Report Heatline and Recents Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current boxed heat section with a continuous timeline heatline, add a non-zero daily stats table, and limit session details to recent entries only.

**Architecture:** Keep the data contract unchanged and implement the redesign entirely in the report UI layer. Derive both the heatline gradient and the compact tables from the existing `readReportData` payload so the storage layer stays stable.

**Tech Stack:** Node.js, VS Code webview HTML/CSS/JS, node:test

---

## File Structure

- Modify: `src/ui/dailyReportView.js`
  - Replace heat cell grid rendering with a continuous heatline helper.
  - Add non-zero day stats table helper.
  - Limit session rows to recent entries only.
- Modify: `test/dailyReportView.test.js`
  - Update rendering assertions to match the new UI behavior.

## Chunk 1: Heatline

### Task 1: Replace boxed heat cells with a continuous timeline heatline

**Files:**
- Modify: `src/ui/dailyReportView.js`
- Test: `test/dailyReportView.test.js`

- [ ] **Step 1: Write failing heatline rendering tests**

Cover:
- section renders as a single heatline
- start/end labels are present
- numeric values are not rendered inside the heatline itself

- [ ] **Step 2: Run the targeted test to verify failure**

Run: `node --test test/dailyReportView.test.js`
Expected: FAIL because the UI still renders boxed heat cells

- [ ] **Step 3: Implement the heatline helper**

Requirements:
- build a `linear-gradient` from `dailyData.days`
- render one connected band
- remove the old heat-cell grid structure

- [ ] **Step 4: Run the targeted test to verify pass**

Run: `node --test test/dailyReportView.test.js`
Expected: PASS for heatline coverage

## Chunk 2: Daily Stats Table

### Task 2: Add a non-zero day-level stats table

**Files:**
- Modify: `src/ui/dailyReportView.js`
- Test: `test/dailyReportView.test.js`

- [ ] **Step 1: Write failing tests for active-day table behavior**

Cover:
- table has exactly three columns: `日期`, `总时长`, `总行数`
- only non-zero days appear
- newest active day sorts first

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `node --test test/dailyReportView.test.js`
Expected: FAIL because no such table exists yet

- [ ] **Step 3: Implement the active-day table**

Requirements:
- filter `dailyData.days` to active rows only
- sort descending by date
- format duration using existing duration formatter

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `node --test test/dailyReportView.test.js`
Expected: PASS for new table coverage

## Chunk 3: Recent Sessions

### Task 3: Limit session detail rows to recent entries

**Files:**
- Modify: `src/ui/dailyReportView.js`
- Test: `test/dailyReportView.test.js`

- [ ] **Step 1: Write failing tests for recent-session limiting**

Cover:
- rows are sorted by `endTime` descending
- only the most recent N entries render
- older entries outside the limit do not render

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `node --test test/dailyReportView.test.js`
Expected: FAIL because all sessions still render

- [ ] **Step 3: Implement the limit**

Requirements:
- flatten all project sessions
- sort descending by `endTime`
- slice to `RECENT_SESSION_LIMIT = 20`

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `node --test test/dailyReportView.test.js`
Expected: PASS for recent-session coverage

## Chunk 4: Final Verification

### Task 4: Verify the full report UI regression set

**Files:**
- Review: `src/ui/dailyReportView.js`
- Review: `test/dailyReportView.test.js`

- [ ] **Step 1: Run the targeted UI test file**

Run: `node --test test/dailyReportView.test.js`
Expected: PASS

- [ ] **Step 2: Run full project tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/dailyReportView.js test/dailyReportView.test.js
git commit -m "feat(report): 优化热力线与最近会话展示"
```
