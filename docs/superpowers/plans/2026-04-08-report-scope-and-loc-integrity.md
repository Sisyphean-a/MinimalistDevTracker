# Report Scope And LOC Integrity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复会话 LOC 统计被外部变更污染的问题，并让日报与趋势只展示当前工作区仓库的数据。

**Architecture:** 扩展运行时记录会话触达文件；时间跟踪器只对触达文件结算工作区 diff 和提交补偿；存储读取按当前工作区 repo roots 过滤，并在趋势重建时排除零 LOC 历史项目。

**Tech Stack:** Node.js, VS Code extension API, 本地 JSON 存储, node:test

---

## Chunk 1: 会话触达文件与 Git 过滤

### Task 1: 为运行时和时间跟踪器补充触达文件输入

**Files:**
- Modify: `src/core/runtimeTracker.js`
- Modify: `src/core/timeTracker.js`
- Test: `test/runtimeTracker.test.js`
- Test: `test/timeTracker.test.js`

- [ ] **Step 1: 写失败测试，断言活动事件会把 `fsPath` 传给 tracker**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 最小实现 `recordActivity(repoPath, fsPath)` 和会话 `touchedFiles`**
- [ ] **Step 4: 运行定向测试确认通过**

### Task 2: Git diff 支持按文件过滤

**Files:**
- Modify: `src/core/gitDiffProvider.js`
- Test: `test/gitDiffProvider.test.js`

- [ ] **Step 1: 写失败测试，断言 `getDiff/getCommitDiff` 可按文件列表过滤**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 最小实现文件过滤参数**
- [ ] **Step 4: 运行定向测试确认通过**

### Task 3: 会话结算只统计触达文件

**Files:**
- Modify: `src/core/timeTracker.js`
- Test: `test/timeTracker.test.js`

- [ ] **Step 1: 写失败测试，复现未触达文件上的外部变化不会进入会话统计**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 最小实现按触达文件过滤 `getDiff/getCommitDiff`**
- [ ] **Step 4: 运行定向测试确认通过**

## Chunk 2: 当前工作区日报范围与趋势口径

### Task 4: 提取当前工作区 repo roots 和项目过滤逻辑

**Files:**
- Create: `src/core/reportScope.js`
- Test: `test/storage.test.js`
- Test: `test/extension.reportFlush.test.js`

- [ ] **Step 1: 写失败测试，断言只返回当前工作区命中的 repo roots，且零 LOC 项目会被排除**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 最小实现 repo roots 解析与项目过滤 helper**
- [ ] **Step 4: 运行定向测试确认通过**

### Task 5: 存储读取支持按 repo roots 过滤，并统一趋势重建口径

**Files:**
- Modify: `src/core/storage.js`
- Modify: `src/ui/dailyReportView.js`
- Test: `test/storage.test.js`
- Test: `test/dailyReportView.test.js`

- [ ] **Step 1: 写失败测试，断言最新日报和趋势都只返回目标 repo roots，且趋势忽略零 LOC 项目**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 最小实现 repo 过滤读取与趋势重建修正**
- [ ] **Step 4: 运行定向测试确认通过**

### Task 6: 扩展层按当前工作区打开日报

**Files:**
- Modify: `src/extension.js`
- Test: `test/extension.reportFlush.test.js`

- [ ] **Step 1: 写失败测试，断言打开日报时传入当前工作区 repo roots**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 最小实现打开日报时的范围解析和数据传递**
- [ ] **Step 4: 运行定向测试确认通过**

## Chunk 3: 回归验证

### Task 7: 全量回归

**Files:**
- 无新增

- [ ] **Step 1: 运行 `npm test`（60s 内）**
- [ ] **Step 2: 检查结果，修复回归**
