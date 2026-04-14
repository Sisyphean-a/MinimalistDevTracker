# Workspace Auto Tracking And Report Polish Design

## Context

The extension still requires manual `minimalTracker.trackedPaths` configuration before any repository is tracked. That is redundant in the common case where VS Code already knows which folders are open in the current window. The report view also needs a more explicit explanation of untracked metrics and a finer-grained top heat band.

The desired outcome is:

- track repositories/worktrees from the current window automatically
- keep each window report scoped to its own workspace repositories
- render the top trend as hour-sized heat segments for smoother transitions
- show per-day change detail as `+added/-deleted`
- clarify that "untracked" metrics represent lines in files not yet added to Git
- remove avoidable refresh duplication

## Goals

- Eliminate manual repository path setup for normal workspace usage.
- Rebuild runtime tracking when workspace folders change.
- Preserve shared SQLite storage while isolating report scope per VS Code window.
- Improve report readability without changing persisted session semantics.
- Reduce unnecessary report refresh work.

## Non-Goals

- Tracking repositories that are not open in the current VS Code window.
- Changing SQLite schema or session persistence format.
- Adding fallback tracking for invalid/non-git workspace folders.

## Recommended Approach

### Option A: Workspace folders as the single source of truth

Derive tracked roots from `vscode.workspace.workspaceFolders`, resolve each folder to its repository root + worktrees, and rebuild runtime state on workspace-folder changes.

Pros:

- matches the user workflow directly
- removes manual configuration
- keeps report scope and tracking scope aligned

Cons:

- a non-git workspace folder now logs an explicit resolve error instead of being silently ignored

### Option B: Merge workspace folders with legacy configured paths

Keep `trackedPaths` and add workspace folders on top.

Pros:

- backward compatible

Cons:

- user explicitly asked to remove manual setup
- tracking scope and report scope can drift again

### Option C: Track repositories from Git extension API only

Use opened Git repositories as the tracking source.

Pros:

- naturally repository-oriented

Cons:

- arrives later than workspace data and is less direct for file watchers
- adds coupling to Git extension activation timing

## Recommendation

Choose Option A. The current window workspace folders are the clearest boundary for both activity tracking and report scoping, and the extension already uses them when filtering report data.

## Design

### Tracking source

- Replace `trackedPaths` loading with a workspace-folder reader in `src/extension.js`.
- Keep repository-root resolution in `src/core/worktreeDiscovery.js`.
- Rebuild `pathRegistry` and `fileActivityWatcher` when workspace folders change.
- Keep `excludeGlobs` reload support, but stop depending on `trackedPaths`.

### Report scope

- Continue passing the current window repo paths into `storage.readReportData()`.
- Add tests to prove workspace-scoped filtering survives shared storage with multiple repositories.

### Heat band

- Derive hour buckets from session start/end/duration in the UI layer.
- Split each session across overlapping hour slots proportionally by elapsed milliseconds.
- Render the top strip as many narrow cells instead of one day-level gradient.

### Daily stats table

- Add a fourth column: `变更行数`
- Format as `+added/-deleted` using existing day totals.

### Untracked wording

- Rename labels from “未跟踪新文件” to a clearer Git-oriented phrase.
- Add short helper copy explaining the metric source and meaning.

### Performance cleanup

- Remove duplicate timed refresh from the webview script and keep a single refresh scheduler.
- Keep manual refresh button and period switch message flow unchanged.

## Testing

- extension/runtime tests for workspace-folder-driven reload
- report scope tests for current-window filtering
- report UI tests for hour buckets, daily change column, and clearer untracked text
- full regression via `npm test`
