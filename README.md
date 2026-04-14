# Minimalist Dev Tracker

A privacy-first VS Code extension that tracks local coding activity by repository and renders a daily report from local SQLite data.

## Features

- Tracks repositories/worktrees from the folders currently open in the VS Code window
- Includes both editor events and file system events
- Splits sessions on commit and records LOC changes
- Stores runtime data in a local SQLite database under the resolved storage root
- Automatically migrates existing legacy JSON session files into SQLite
- Opens a built-in daily report webview

## Configuration

- `minimalTracker.fileWatch.excludeGlobs`: extra glob excludes for file watcher
- `minimalTracker.flushBeforeReport`: flush active sessions before opening report
- `minimalTracker.sharedStoragePath`: optional shared SQLite storage root across IDE windows

## Command

- `Minimal Tracker: Open Daily Report`
