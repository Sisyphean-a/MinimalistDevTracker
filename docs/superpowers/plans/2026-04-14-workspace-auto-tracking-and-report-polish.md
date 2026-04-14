# Workspace Auto Tracking And Report Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove manual tracked-path setup, scope reports to the current VS Code window, refine the report UI, and cut duplicate refresh work.

**Architecture:** Use workspace folders as the runtime tracking source, keep storage/report filtering repo-path based, and implement report polish in the webview rendering layer without changing SQLite persistence. Rebuild path registration when workspace roots change and keep only one periodic report refresh loop.

**Tech Stack:** Node.js, VS Code extension API, node:test, plain HTML/CSS/JS webview

---

## File Structure

- Modify: `src/extension.js`
- Modify: `src/core/extensionRuntime.js`
- Modify: `src/ui/dailyReportView.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `test/extension.configReload.test.js`
- Modify: `test/reportScope.test.js`
- Modify: `test/dailyReportView.test.js`

## Chunk 1: Workspace Tracking

### Task 1: Switch runtime tracking to workspace folders

**Files:**
- Modify: `src/extension.js`
- Modify: `src/core/extensionRuntime.js`
- Modify: `test/extension.configReload.test.js`

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Replace `trackedPaths` loading with workspace-folder discovery and workspace-change reload**
- [ ] **Step 4: Run targeted tests to verify pass**
- [ ] **Step 5: Commit**

## Chunk 2: Report Scope Contract

### Task 2: Lock report data to current-window repositories

**Files:**
- Modify: `test/reportScope.test.js`
- Modify: `src/extension.js` (if wiring needs adjustment)

- [ ] **Step 1: Write failing tests for repo-path resolution and filtering**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Adjust implementation only if scope logic is incomplete**
- [ ] **Step 4: Run targeted tests to verify pass**
- [ ] **Step 5: Commit**

## Chunk 3: Report UI Refinement

### Task 3: Add hour-level heat band, daily change column, and clearer untracked copy

**Files:**
- Modify: `src/ui/dailyReportView.js`
- Modify: `test/dailyReportView.test.js`

- [ ] **Step 1: Write failing UI tests**
- [ ] **Step 2: Run targeted tests to verify failure**
- [ ] **Step 3: Implement hour-bucket derivation, new table column, and copy updates**
- [ ] **Step 4: Run targeted tests to verify pass**
- [ ] **Step 5: Commit**

## Chunk 4: Docs And Refresh Cleanup

### Task 4: Remove duplicate auto-refresh and update user-facing docs

**Files:**
- Modify: `src/ui/dailyReportView.js`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add/adjust tests that prove only one refresh scheduler is used where testable**
- [ ] **Step 2: Implement refresh cleanup and docs/config updates**
- [ ] **Step 3: Run focused tests**
- [ ] **Step 4: Run full regression**
- [ ] **Step 5: Commit**
