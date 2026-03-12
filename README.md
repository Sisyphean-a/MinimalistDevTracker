# Minimalist Dev Tracker

A privacy-first VS Code extension that tracks local coding activity by repository and renders a daily report from local JSON data.

## Features

- Tracks activity under configured `minimalTracker.trackedPaths`
- Includes both editor events and file system events
- Splits sessions on commit and records LOC changes
- Stores data locally in VS Code global storage
- Opens a built-in daily report webview

## Configuration

- `minimalTracker.trackedPaths`: repository/worktree roots to track
- `minimalTracker.fileWatch.excludeGlobs`: extra glob excludes for file watcher
- `minimalTracker.flushBeforeReport`: flush active sessions before opening report

## Command

- `Minimal Tracker: Open Daily Report`
