# Minimalist Dev Tracker

A privacy-first VS Code extension that tracks local coding activity by repository and renders a daily report from local SQLite data.

## Features

- Tracks activity under configured `minimalTracker.trackedPaths`
- Includes both editor events and file system events
- Splits sessions on commit and records LOC changes
- Stores runtime data in a local SQLite database under the resolved storage root
- Automatically migrates existing legacy JSON session files into SQLite
- Opens a built-in daily report webview

## Configuration

- `minimalTracker.trackedPaths`: repository/worktree roots to track
- `minimalTracker.fileWatch.excludeGlobs`: extra glob excludes for file watcher
- `minimalTracker.flushBeforeReport`: flush active sessions before opening report

## Command

- `Minimal Tracker: Open Daily Report`
