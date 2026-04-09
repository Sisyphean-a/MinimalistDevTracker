# SQLite Storage Migration Design

## Context

The extension currently persists activity to daily JSON files and a global trend index under the resolved storage root. That design is simple, but it requires full-file read/modify/write cycles for every session append and repeated JSON scans for report generation. The user wants a full migration to SQLite as the only runtime storage, with safe import of existing JSON data and no duplicate imports.

## Goals

- Replace runtime JSON storage with SQLite-only persistence.
- Preserve the public storage API used by the extension entry and report UI.
- Import existing legacy JSON data into SQLite automatically and safely.
- Make legacy import idempotent so reruns do not duplicate data.
- Keep report outputs and filtering semantics consistent with current behavior.

## Non-Goals

- Supporting dual-write or dual-read JSON compatibility after migration.
- Adding remote sync, multi-user sharing, or cloud storage.
- Reworking the report UI beyond what is required to preserve existing behavior.
- Adding aggressive pre-aggregated summary tables in the first SQLite version.

## Current State Summary

- Runtime writes sessions into `YYYY-MM-DD.json` files in `src/core/storage.js`.
- Trend reads partially rely on `trend-index.json`, with rebuild logic from daily files.
- Manual migration currently copies missing daily files between directories instead of importing records.
- Report consumers call `createStorage(...).appendSession/readLatestDaily/readTrendData/readReportData`.

This means the migration can stay bounded if the external storage API remains stable while the persistence internals are swapped out.

## Approach Options

### Option 1: Single `sessions` table, aggregate on demand

Store one row per session in SQLite and build report outputs through SQL plus lightweight JavaScript aggregation for file-type maps. This minimizes write complexity and keeps the design close to the current session-oriented model.

Pros:
- Lowest migration complexity
- Simple write path
- Easy idempotent import strategy
- No dual-write consistency problems

Cons:
- Some report aggregation remains in JavaScript
- File-type trend comparison is not purely SQL-driven

### Option 2: `sessions` plus normalized file-type detail table

Split file-type metrics into a child table per session and push more aggregation into SQL.

Pros:
- Stronger query model for file-type analytics
- Cleaner SQL for type-based reports

Cons:
- Higher write complexity
- More migration code
- More moving parts than current requirements need

### Option 3: `sessions` plus pre-aggregated daily summaries

Persist summary tables for fast reads and rebuild them during migration.

Pros:
- Fastest reads

Cons:
- Highest implementation and consistency risk
- Most expensive migration path
- Unnecessary before runtime evidence shows query bottlenecks

## Recommended Design

Adopt Option 1. Store one row per session in SQLite and derive report outputs at read time. This directly addresses the JSON bottleneck while keeping the model close to the current code. It is the smallest coherent change that satisfies the requirement to fully replace JSON storage and safely migrate existing data.

## Runtime Architecture

The runtime storage root will contain a single SQLite database file:

- `storage.db`

The extension activation flow becomes:

1. Resolve `storageRootPath`
2. Open or initialize `storage.db`
3. Ensure schema and metadata exist
4. Run legacy JSON import if needed
5. Create the storage service used by tracking and reports

The storage API remains:

- `appendSession(session)`
- `readLatestDaily(input?)`
- `readTrendData(input?)`
- `readReportData(input?)`

The internal storage implementation changes from file-based JSON logic to SQLite-backed queries and aggregation helpers.

## Database Schema

### `meta`

Stores schema and migration metadata.

Columns:

- `key TEXT PRIMARY KEY`
- `value TEXT NOT NULL`

Keys:

- `schema_version`
- `legacy_import_completed_at`
- `legacy_import_source`

### `sessions`

Stores one row per tracked session.

Columns:

- `id INTEGER PRIMARY KEY`
- `source_type TEXT NOT NULL`
- `source_key TEXT NOT NULL UNIQUE`
- `date_key TEXT NOT NULL`
- `repo_path TEXT NOT NULL`
- `branch TEXT NOT NULL`
- `start_time INTEGER NOT NULL`
- `end_time INTEGER NOT NULL`
- `duration_ms INTEGER NOT NULL`
- `tracked_loc_added INTEGER NOT NULL`
- `tracked_loc_deleted INTEGER NOT NULL`
- `untracked_loc_added INTEGER NOT NULL`
- `untracked_loc_deleted INTEGER NOT NULL`
- `total_loc_added INTEGER NOT NULL`
- `total_loc_deleted INTEGER NOT NULL`
- `tracked_loc_by_file_type TEXT NOT NULL`
- `untracked_loc_by_file_type TEXT NOT NULL`
- `loc_by_file_type TEXT NOT NULL`

Indexes:

- `idx_sessions_date_key(date_key)`
- `idx_sessions_repo_date(repo_path, date_key)`
- `idx_sessions_date_repo_branch(date_key, repo_path, branch)`

The file-type columns remain JSON-encoded strings. This avoids over-designing the first SQLite version while preserving the current shape of report outputs.

## Data Flow

### Append Session

1. Normalize incoming session data
2. Compute `date_key` from local day
3. Generate a runtime `source_key`
4. Insert one row into `sessions`
5. Return without updating any JSON files or trend index

### Read Latest Daily

1. Query the latest `date_key`
2. Load sessions for that day, optionally filtered by repo paths
3. Aggregate rows into the current daily response shape
4. Return the same project/session structure expected by callers

### Read Trend Data

1. Build the target windows from `now()`
2. Query day-level totals grouped by `date_key`
3. Zero-fill missing days
4. Compute current and previous window totals
5. Merge file-type JSON from matching sessions in JavaScript to keep share-delta behavior

### Read Report Data

1. Resolve requested period (`rolling30` or `month`)
2. Query sessions within the date range, optionally filtered by repo paths
3. Aggregate rows into:
   - per-day totals
   - per-project totals
   - report summary totals
4. Zero-fill missing days in the selected range

## Legacy JSON Migration

### Source

Legacy input files remain:

- `YYYY-MM-DD.json`
- optionally stale `trend-index.json`

Only daily files are import sources. `trend-index.json` is ignored during migration because it is derived data.

### Import Strategy

Import occurs from legacy JSON into SQLite, not by copying files.

Each imported session gets a deterministic `source_key`:

`legacy-json:<dateKey>:<projectKey>:<sessionIndex>:<startTime>:<endTime>:<durationMs>:<locAdded>:<locDeleted>`

This guarantees that rerunning the importer against the same source produces the same identity for the same session. The importer uses `INSERT OR IGNORE`, making the import idempotent even if it is rerun after interruption.

### Migration Rules

- If the database has no `legacy_import_completed_at`, attempt auto-import during activation.
- Manual migration command triggers the same importer and returns a structured summary.
- Import writes occur inside a transaction.
- The completion marker is written only after the import transaction succeeds.
- Existing legacy JSON files are not deleted automatically.

### Bad Data Handling

- Invalid JSON file: fail the import and do not mark completion
- Missing required session fields: skip the row and record it in the summary
- Missing `sessions` array: treat as no importable session rows for that project
- Legacy projects with zero LOC and no valid session activity remain excluded by the same report filtering semantics already in use

### Import Summary

The importer returns:

- `sourceDir`
- `databasePath`
- `scannedFiles`
- `importedSessions`
- `skippedSessions`
- `ignoredExistingSessions`
- `failedFiles`

## Module Boundaries

### `src/core/sqliteDatabase.js`

Responsibilities:

- open database
- initialize schema
- manage transactions
- expose prepared statement helpers
- read/write `meta`

### `src/core/sqliteStorage.js`

Responsibilities:

- implement `appendSession`
- implement read queries and aggregation
- convert raw rows into current storage API outputs

### `src/core/storageMigration.js`

Responsibilities:

- scan legacy JSON files
- convert legacy records into session rows
- run idempotent import into SQLite
- return migration summaries

### `src/core/storage.js`

Responsibilities:

- compose the SQLite-backed storage object
- preserve the external storage API

### Existing modules expected to stay mostly unchanged

- `src/core/storagePathResolver.js`
- `src/core/reportScope.js`
- `src/extension.js`
- `src/ui/dailyReportView.js`

`src/extension.js` changes only to ensure database initialization and legacy import happen before runtime tracking starts.

## Error Handling

- Database open/init failure aborts activation with an explicit error.
- Import failure aborts the automatic migration path and surfaces a clear runtime error.
- Manual migration reports import counts and failure counts to the command caller.
- Read methods return empty-but-valid report structures when the database contains no data.

## Testing Strategy

### Unit and integration coverage

- schema initialization creates required tables and indexes
- runtime `appendSession` inserts expected rows
- `readLatestDaily` preserves branch split and repo filtering semantics
- `readTrendData` preserves rolling window and file-type share delta behavior
- `readReportData` preserves `rolling30` and `month` behaviors
- legacy import migrates valid JSON sessions into SQLite
- repeating import does not duplicate sessions
- interrupted or partial import can be safely rerun
- invalid JSON fails clearly without writing completion metadata

### Regression focus

- zero-LOC legacy projects must not reappear in scoped reports
- project key behavior stays aligned with `repoPath + branch`
- date-key logic remains based on local calendar day, not UTC day

## Risks and Mitigations

### Native dependency packaging

Risk:

- `better-sqlite3` is a native dependency and may complicate VSIX packaging.

Mitigation:

- validate install and test flow on the current development platform first
- update packaging expectations before release

### Data migration correctness

Risk:

- malformed legacy JSON or inconsistent records could create silent data loss.

Mitigation:

- fail fast on invalid files
- count skipped rows explicitly
- keep legacy files untouched after import

### API drift

Risk:

- report UI may break if aggregated output changes shape.

Mitigation:

- preserve the current storage API contract
- keep existing report tests and adapt them only where the storage backend changes

## Acceptance Criteria

- Runtime only writes to `storage.db`
- No new `YYYY-MM-DD.json` or `trend-index.json` files are created after migration
- Existing legacy JSON sessions are imported into SQLite automatically
- Repeating automatic or manual import does not create duplicates
- Report and trend APIs preserve current behavior for callers
- Test coverage exists for import idempotency, report filtering, branch split, date ranges, and restart-safe migration
