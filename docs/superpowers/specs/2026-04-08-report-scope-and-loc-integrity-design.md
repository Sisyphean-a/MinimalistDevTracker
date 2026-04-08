# Report Scope And LOC Integrity Design

## Goal

修复当前统计口径混乱的问题，确保日报只展示当前 VS Code 工作区对应仓库的数据，并且避免把 `git pull`、历史零 LOC 项目、以及与当前会话无关的外部变更计入 LOC 统计。

## Problems

1. 任意 `HEAD` 变化都会触发提交补偿，导致 `pull`、切分支、rebase 等外部变化可能进入会话统计。
2. 日报读取共享存储中的最新日文件，但未按当前工作区过滤，多个项目的数据会混在同一视图里。
3. 趋势重建会把零 LOC 历史项目的活跃时长混入趋势图，导致趋势图和日报主表口径不一致。
4. LOC 统计按整个仓库工作区 diff 的起止差值计算，会把当前会话未触达文件上的外部变化算进来。

## Design

### 1. 会话只统计“本会话触达文件”

- `runtimeTracker` 在编辑器事件和文件系统事件中，除了 repoPath，还向 `timeTracker` 传递实际触达的 `fsPath`。
- `timeTracker` 为每个活跃会话维护 `touchedFiles` 集合。
- 会话结束和 `HEAD` 变化结算时，只对 `touchedFiles` 对应的文件求 diff。
- 这样 `pull`、批量生成、外部脚本修改等没有被当前会话触达的文件，不会进入 LOC 统计。

### 2. 提交补偿只基于触达文件

- 保留 `HEAD` 变化触发“切段”的行为，但 `getCommitDiff()` 增加文件过滤参数。
- 若会话没有触达文件，则不读取 commit diff。
- 即使发生 `pull` 或分支切换，只有当前会话真实触达过且 commit diff 涉及的文件才可能进入补偿，避免把整个外部提交算给当前会话。

### 3. 日报只展示当前工作区仓库

- 以当前 `workspaceFolders` 为输入，利用 `pathRegistry.resolveRepoPath()` 解析出当前工作区命中的 tracked repo roots。
- 打开日报时：
  - 最新日报按这些 repo roots 过滤项目；
  - 趋势数据也按这些 repo roots 聚合。
- 没有命中 tracked repo 时，直接展示空报表。

### 4. 趋势与日报统一口径

- 提取共享的“项目是否有有效 LOC”判断逻辑。
- 趋势重建时忽略零 LOC 项目，和日报主表保持一致。
- repo 过滤后的趋势数据不再依赖全局 `trend-index.json`，而是按日文件为目标 repo roots 重算，保证当前项目趋势准确。

## Modules

- `src/core/runtimeTracker.js`
  - 传递会话触达文件路径。
- `src/core/timeTracker.js`
  - 维护 `touchedFiles`，会话结算按触达文件过滤 diff。
- `src/core/gitDiffProvider.js`
  - 支持按文件列表读取工作区 diff 和 commit diff。
- `src/core/storage.js`
  - 提供按 repo roots 过滤的日报/趋势读取。
- `src/core/reportScope.js`
  - 负责“当前工作区 repo roots 解析”和“项目有效性判断/过滤”。
- `src/extension.js`
  - 打开日报时计算当前工作区范围并传给存储读取。

## Error Handling

- repo roots 解析失败或当前工作区未命中 tracked roots 时，不做静默伪成功，直接渲染空报表。
- 文件过滤后的 diff 查询如果 Git 命令失败，继续显式抛错并记录上下文。

## Testing

- `test/runtimeTracker.test.js`
  - 验证活动事件会把 `fsPath` 传给 tracker。
- `test/timeTracker.test.js`
  - 验证会话只统计触达文件的 diff 增量。
- `test/gitDiffProvider.test.js`
  - 验证 `getDiff/getCommitDiff` 支持按文件过滤。
- `test/storage.test.js`
  - 验证 repo 过滤后的日报/趋势读取，以及趋势重建忽略零 LOC 项目。
- `test/extension.reportFlush.test.js`
  - 验证日报打开时只请求当前工作区 repo roots 的数据。
