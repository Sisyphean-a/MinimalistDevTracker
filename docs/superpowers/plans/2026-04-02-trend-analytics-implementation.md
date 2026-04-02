# Trend Analytics Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在日报中新增滚动 7/30 天趋势统计（活跃时长、变更行）和文件类型分布变化（按总变更行占比）。

**Architecture:** 采用混合模式：存储层新增趋势索引读写（`trend-index.json`）与历史回填能力；日报渲染优先使用趋势索引并提供空数据显式降级。扩展层在写入会话后更新索引，打开日报时读取趋势并渲染两个窗口。

**Tech Stack:** Node.js, VS Code extension API, 本地 JSON 存储, node:test

---

## Chunk 1: 存储层趋势能力

### Task 1: 定义趋势索引数据结构与纯函数聚合

**Files:**
- Modify: `src/core/storage.js`
- Test: `test/storage.test.js`

- [ ] **Step 1: 写失败测试（趋势聚合和文件类型占比变化）**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 实现最小聚合逻辑**
- [ ] **Step 4: 再跑定向测试确认通过**

### Task 2: 新增 readTrendData(days) 与索引回填

**Files:**
- Modify: `src/core/storage.js`
- Test: `test/storage.test.js`

- [ ] **Step 1: 写失败测试（读取 7/30 窗口 + 对比上一窗口）**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 最小实现 readTrendData + 回填逻辑**
- [ ] **Step 4: 运行测试确认通过**

## Chunk 2: 日报 UI 趋势展示

### Task 3: 报表渲染新增趋势区块

**Files:**
- Modify: `src/ui/dailyReportView.js`
- Test: `test/dailyReportView.test.js`

- [ ] **Step 1: 写失败测试（出现 7/30 趋势、无数据隐藏）**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 实现趋势区块（条状/占比/变化）**
- [ ] **Step 4: 运行测试确认通过**

## Chunk 3: 扩展接线与回归

### Task 4: 扩展层读取趋势并传入渲染

**Files:**
- Modify: `src/extension.js`
- Test: `test/extension.reportFlush.test.js`（必要时）

- [ ] **Step 1: 写失败测试或补现有测试断言（趋势参数传递）**
- [ ] **Step 2: 运行定向测试确认失败**
- [ ] **Step 3: 实现最小接线**
- [ ] **Step 4: 运行测试确认通过**

### Task 5: 全量回归

**Files:**
- 无新增

- [ ] **Step 1: 运行 `npm test`（60s 内）**
- [ ] **Step 2: 记录结果并修复回归**
