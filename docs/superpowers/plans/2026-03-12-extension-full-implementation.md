# Minimalist Dev Tracker Full Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a usable VS Code extension with tracked-path + worktree discovery, accurate per-repo time/LOC tracking, commit-aware LOC segmentation, and a daily report UI.

**Architecture:** Keep business logic in focused core modules with injected dependencies. Extension entry only wires VS Code events, commands, and module collaboration. Persist sessions to daily JSON and render a local Webview report from persisted data.

**Tech Stack:** Node.js (CommonJS), VS Code Extension API, Git CLI (`git worktree list`, `git diff --shortstat`), Node built-in test runner.

---

### Task 1: Worktree Discovery + Path Resolution

**Files:**
- Create: `src/core/worktreeDiscovery.js`
- Modify: `src/core/pathRegistry.js`
- Test: `test/worktreeDiscovery.test.js`, `test/pathRegistry.test.js`

- [ ] **Step 1: Write failing tests for porcelain worktree parsing and tracked root expansion**
- [ ] **Step 2: Run tests to verify failures**
- [ ] **Step 3: Implement minimal parser and discovery flow**
- [ ] **Step 4: Re-run tests to verify pass**

### Task 2: Commit Detection Accuracy

**Files:**
- Create: `src/core/commitWatcher.js`
- Modify: `src/extension.js`, `src/core/timeTracker.js` (if needed)
- Test: `test/commitWatcher.test.js`, `test/timeTracker.test.js`

- [ ] **Step 1: Write failing tests for HEAD-change-only commit trigger**
- [ ] **Step 2: Run tests to verify failures**
- [ ] **Step 3: Implement watcher and wire it to tracker.handleCommit**
- [ ] **Step 4: Re-run tests to verify pass**

### Task 3: Daily Report UI

**Files:**
- Create: `src/ui/dailyReportView.js`
- Modify: `src/core/storage.js`, `src/extension.js`, `package.json`
- Test: `test/dailyReportView.test.js`, `test/storage.test.js`

- [ ] **Step 1: Write failing tests for report summary rendering and latest daily load**
- [ ] **Step 2: Run tests to verify failures**
- [ ] **Step 3: Implement report HTML generator and VS Code command wiring**
- [ ] **Step 4: Re-run tests to verify pass**

### Task 4: Integration & Verification

**Files:**
- Modify: `test/run-tests.js`

- [ ] **Step 1: Include all new tests in runner**
- [ ] **Step 2: Run full test suite**
- [ ] **Step 3: Fix regressions**
- [ ] **Step 4: Commit final changes**
