# Minimalist Dev Tracker 稳定性重构设计

## 1. 背景与目标

当前实现通过测试，但在真实 VS Code 运行场景仍存在 6 类风险：

1. `registerRepository` 使用未定义 `context`，Git 集成路径会在运行时抛错。
2. `storage.appendSession` 采用读改写，存在并发写覆盖风险。
3. 日期归档使用 UTC，和本地自然日不一致。
4. 事件处理链未统一兜底，异步异常可见性不稳定。
5. 路径统一转小写，跨平台大小写语义不一致。
6. Git shortstat 解析依赖本地语言输出，非英文环境可能统计失真。

本次重构目标：

- 修复以上 6 类问题，并保持现有功能行为可解释、可测试、可回归。
- 通过模块边界重整降低后续演进成本。
- 严格遵循项目工程约束：无静默降级、暴露真实错误、函数/文件复杂度可控。

非目标：

- 不改变插件核心产品行为（仍是本地隐私优先、基于 Git diff 的统计逻辑）。
- 不引入远程服务、数据库、或重型依赖。

## 2. 重构方案对比

### 方案 A：最小补丁式修复

做法：在现有文件里点修 6 个问题，不改结构。

优点：

- 变更量最小，上线快。

缺点：

- 责任继续耦合在 `extension.js` 与 `storage.js`。
- 下次新增行为仍会重复踩同类坑（并发/错误传播/平台差异）。

### 方案 B：模块化可靠性重构（推荐）

做法：保留核心业务模型，新增“基础设施层”与“运行时编排层”，把不稳定点集中治理。

优点：

- 风险点集中收敛，后续新增功能成本更低。
- 每个问题都能通过独立测试验证。
- 不改变外部命令与数据格式。

缺点：

- 需要一次性补齐更多测试与文件拆分。

### 方案 C：事件流水线重写

做法：把编辑事件、Git 事件、持久化全改为消息总线。

优点：

- 扩展性最强。

缺点：

- 对当前项目明显过度设计，迁移成本高，回归风险高。

推荐结论：采用方案 B，在 2~3 个小阶段内完成，保持可回滚。

## 3. 目标架构

### 3.1 模块分层

`extension.js` 仅做装配，不直接承载复杂逻辑。新增/调整模块：

- `src/core/runtimeTracker.js`：运行时编排（编辑器事件 + Git 事件绑定 + 安全调用）。
- `src/core/pathKey.js`：路径归一化与 repo key 生成（显式处理大小写语义）。
- `src/core/gitClient.js`：统一执行 Git 命令（超时、环境变量、错误上下文）。
- `src/core/dateKey.js`：本地日期 key 生成。
- `src/core/storageWriter.js`：按文件粒度串行写入，消除并发覆盖。

保留并复用：

- `timeTracker.js`（业务状态机）
- `worktreeDiscovery.js`
- `gitDiffProvider.js`
- `storage.js`

其中 `worktreeDiscovery` 与 `gitDiffProvider` 改为依赖注入 `gitClient`，避免各自散落子进程调用。

### 3.2 数据与调用流

1. 编辑器事件进入 `runtimeTracker.recordEditorActivity`。
2. `runtimeTracker` 通过 `pathKey` 解析 repo key。
3. repo key 传给 `timeTracker.recordActivity`。
4. `timeTracker` 会在 finalize 时回调 `storage.appendSession`。
5. `storage.appendSession` 先使用 `dateKey` 计算“本地日”，再通过 `storageWriter` 串行写入 `YYYY-MM-DD.json`。
6. Git commit 事件由 `runtimeTracker` 路由到 `timeTracker.handleCommit`，形成会话切段。

### 3.3 错误处理策略

原则：不做静默吞错，不做 mock 成功路径。

- 所有事件入口通过 `safeInvokeAsync(label, fn)` 包装。
- `safeInvokeAsync` 只负责记录上下文并暴露错误，不改变业务结果。
- 存储层、Git 层错误都包含 repoPath/command 维度上下文，便于定位。

## 4. 六类问题的对应改造

### 4.1 运行时 `context` 未定义

改造：

- 把 `registerRepository` 改为纯依赖注入函数：
  - 输入：`{ repo, gitDiffProvider, commitWatcher, subscriptions }`
  - 由调用方显式传入 `context.subscriptions`。
- 从根源移除闭包依赖未定义变量的可能。

### 4.2 并发写覆盖

改造：

- `storageWriter` 维护 `Map<filePath, Promise>` 写链。
- `appendSession` 对同一文件写入排队执行：
  - 读取最新文件
  - 应用会话
  - 原子写回（同路径覆写）
- 前一个任务失败时，后续任务仍继续，但失败会显式抛出并记录日志。

### 4.3 UTC 归档偏移

改造：

- 新增 `toLocalDateKey(timestamp)`，使用本地时区计算 `YYYY-MM-DD`。
- `storage.appendSession` 全量替换为本地日归档。
- 测试覆盖“UTC 跨天但本地未跨天”与“本地跨天”场景。

### 4.4 异步异常可见性

改造：

- `extension` 事件监听不再直接 `void tracker.xxx()`。
- 统一调用 `safeInvokeAsync('recordActivity', () => tracker.recordActivity(repoPath))`。
- `onCommit` 同理。

### 4.5 路径大小写语义

改造：

- `pathKey` 提供 `createPathNormalizer({ caseSensitive })`。
- 默认策略：
  - Windows：`caseSensitive = false`
  - 其他平台：`true`
- 所有路径 key 生成复用同一 normalizer，避免模块间不一致。

### 4.6 Git 输出语言依赖

改造：

- `gitClient` 执行 Git 时强制环境变量：
  - `LC_ALL=C`
  - `LANG=C`
- `gitDiffProvider` 仅解析标准英文 `--shortstat` 输出。
- 保留失败抛错，避免错误统计被默默当作 0。

## 5. 测试设计

### 5.1 新增测试

- `test/runtimeTracker.test.js`
  - 验证 repo 注册时 subscription 注入正确。
  - 验证事件包装器遇到 rejected promise 时会记录错误并不中断后续监听。
- `test/storageConcurrency.test.js`
  - `Promise.all` 并发写同一天，断言 session 总数与聚合值正确。
- `test/dateKey.test.js`
  - 本地日 key 计算边界（跨时区/跨天）。
- `test/pathKey.test.js`
  - 区分大小写配置下的 key 行为。
- `test/gitClient.test.js`
  - 校验执行参数包含 `LC_ALL=C`、`LANG=C`。

### 5.2 修改测试

- `test/storage.test.js`：从“顺序聚合”扩展为“顺序 + 并发”验证。
- `test/pathRegistry.test.js`：改用共享 normalizer。
- `test/commitWatcher.test.js`：加入路径 key 归一化一致性断言。

## 6. 迁移步骤

阶段 1（基础设施）：

1. 引入 `pathKey/dateKey/gitClient/storageWriter` 与对应测试。
2. 保持 `extension.js` 行为不变，仅替换底层依赖。

阶段 2（运行时编排）：

1. 提炼 `runtimeTracker`，修复 `context` 注入问题。
2. 全量改为 `safeInvokeAsync` 事件入口。

阶段 3（回归）：

1. 运行全量单测。
2. 在 VS Code 扩展宿主做最小冒烟：编辑、提交、查看日报。

## 7. 验收标准

1. 不再出现 `context is not defined` 运行时错误。
2. 并发 `appendSession` 不丢会话、不丢聚合值。
3. 日报文件按本地自然日归档。
4. 编辑器事件与提交事件的异步异常可被清晰观测。
5. 路径匹配在不同平台上语义可预测且一致。
6. Git shortstat 在非英文系统环境仍稳定解析。
