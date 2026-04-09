# SQLite Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace runtime JSON storage with SQLite-only persistence and migrate existing legacy JSON data into the database safely and idempotently.

**Architecture:** Add a focused SQLite database layer plus a SQLite-backed storage service that preserves the current storage API. Move legacy migration from file copying to transactional JSON import with deterministic source keys, then remove JSON runtime reads and writes from the main storage path.

**Tech Stack:** Node.js, VS Code extension API, `better-sqlite3`, node:test

---

## File Structure

- Create: `src/core/sqliteDatabase.js`
  - Open `storage.db`, initialize schema, manage metadata and transactions.
- Create: `src/core/sqliteStorage.js`
  - Implement the storage API against SQLite and keep response shapes compatible.
- Modify: `src/core/storage.js`
  - Replace JSON-file persistence orchestration with SQLite storage composition.
- Modify: `src/core/storageMigration.js`
  - Replace file-copy migration with legacy JSON import into SQLite.
- Modify: `src/extension.js`
  - Ensure database init and auto-import run before tracker startup.
- Modify: `package.json`
  - Add SQLite dependency and any packaging metadata required by the chosen driver.
- Modify: `test/storage.test.js`
  - Move storage behavior tests to the SQLite backend.
- Modify: `test/storageMigration.test.js`
  - Add import-idempotency and failure-path coverage.
- Create: `test/sqliteDatabase.test.js`
  - Verify schema initialization and metadata behavior.
- Optional delete or reduce: `src/core/storageWriter.js`, `test/storageWriter.test.js`
  - Keep only if some queueing logic still has a real runtime use after the migration.

## Chunk 1: Database Foundation

### Task 1: Add SQLite dependency and schema bootstrap

**Files:**
- Modify: `package.json`
- Create: `src/core/sqliteDatabase.js`
- Test: `test/sqliteDatabase.test.js`

- [ ] **Step 1: Write the failing database initialization tests**

Add tests that assert:
- opening a fresh database creates `meta` and `sessions`
- schema version metadata is written
- repeated initialization is safe

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `node --test test/sqliteDatabase.test.js`  
Expected: FAIL because `sqliteDatabase.js` does not exist yet

- [ ] **Step 3: Add the SQLite dependency**

Update `package.json` to include `better-sqlite3` and keep scripts unchanged unless packaging demands a minimal update.

- [ ] **Step 4: Implement `sqliteDatabase.js`**

Include:
- database open helper
- `ensureSchema()`
- transaction wrapper
- `getMeta(key)`
- `setMeta(key, value)`
- prepared statement creation where useful

- [ ] **Step 5: Run targeted tests to verify they pass**

Run: `node --test test/sqliteDatabase.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json src/core/sqliteDatabase.js test/sqliteDatabase.test.js
git commit -m "feat(storage): 引入 SQLite 数据库基础设施"
```

## Chunk 2: Runtime Storage Replacement

### Task 2: Port append and read APIs to SQLite

**Files:**
- Create: `src/core/sqliteStorage.js`
- Modify: `src/core/storage.js`
- Modify: `test/storage.test.js`

- [ ] **Step 1: Write failing storage regression tests for SQLite-backed behavior**

Cover:
- append session persists one row
- latest daily aggregation
- rolling trend windows
- report range aggregation
- repo filtering and branch split

- [ ] **Step 2: Run targeted tests to verify failures**

Run: `node --test test/storage.test.js`  
Expected: FAIL because storage implementation still expects JSON files

- [ ] **Step 3: Implement SQLite-backed storage**

`sqliteStorage.js` should:
- insert runtime sessions with deterministic runtime `source_key`
- aggregate rows into the current output contracts
- merge file-type JSON maps in JavaScript when needed

- [ ] **Step 4: Rewire `src/core/storage.js`**

Make `createStorage(storageRootPath, options)` open `storage.db` and return the SQLite-backed API while preserving existing method names and input contracts.

- [ ] **Step 5: Run targeted tests to verify they pass**

Run: `node --test test/storage.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/sqliteStorage.js src/core/storage.js test/storage.test.js
git commit -m "feat(storage): 切换运行时存储到 SQLite"
```

## Chunk 3: Legacy Import Migration

### Task 3: Replace copy migration with idempotent JSON import

**Files:**
- Modify: `src/core/storageMigration.js`
- Modify: `test/storageMigration.test.js`
- Reference: `src/core/reportScope.js`

- [ ] **Step 1: Write failing migration tests**

Add coverage for:
- importing legacy daily JSON into SQLite
- rerunning import without duplicates
- invalid JSON file causing failure without completion marker
- skipped malformed session rows counted in summary

- [ ] **Step 2: Run targeted tests to verify failures**

Run: `node --test test/storageMigration.test.js`  
Expected: FAIL because migration still copies files only

- [ ] **Step 3: Implement deterministic legacy import**

Requirements:
- scan `YYYY-MM-DD.json`
- ignore `trend-index.json`
- flatten legacy projects and sessions
- build deterministic `source_key`
- use transaction + `INSERT OR IGNORE`
- write `legacy_import_completed_at` only after success

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `node --test test/storageMigration.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/storageMigration.js test/storageMigration.test.js
git commit -m "feat(storage): 支持旧 JSON 数据导入 SQLite"
```

## Chunk 4: Activation Flow Integration

### Task 4: Run auto-import during extension startup

**Files:**
- Modify: `src/extension.js`
- Modify: `src/core/extensionCommands.js`
- Test: existing extension tests plus any new targeted startup test if needed

- [ ] **Step 1: Add or update failing tests for activation behavior**

Cover:
- activation initializes storage before tracker use
- auto-import runs when legacy import marker is missing
- manual migration command reports import summary from SQLite importer

- [ ] **Step 2: Run targeted tests to verify failures**

Run: `node test/run-tests.js`  
Expected: FAIL in extension or migration related assertions until wiring is complete

- [ ] **Step 3: Implement startup migration orchestration**

Requirements:
- create storage root if missing
- initialize database
- run importer before tracker starts recording
- preserve current command IDs and settings behavior

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `node test/run-tests.js`  
Expected: PASS for the updated extension and migration coverage

- [ ] **Step 5: Commit**

```bash
git add src/extension.js src/core/extensionCommands.js
git commit -m "feat(extension): 启动时自动迁移旧存储"
```

## Chunk 5: Remove JSON Runtime Dependencies

### Task 5: Retire file-based runtime paths cleanly

**Files:**
- Modify: `src/core/storage.js`
- Modify: `src/core/storageWriter.js`
- Modify: `test/storageWriter.test.js`
- Search: JSON daily file and trend-index references across `src/` and `test/`

- [ ] **Step 1: Write or update tests to reflect final runtime behavior**

Verify:
- runtime no longer depends on daily JSON writes
- no trend-index rebuild path remains in active storage reads
- any retained `storageWriter` coverage still matches a real use case

- [ ] **Step 2: Run targeted tests to verify failures where cleanup is incomplete**

Run: `node test/run-tests.js`  
Expected: FAIL only if stale JSON-runtime assumptions remain

- [ ] **Step 3: Remove or reduce obsolete file-storage code**

Search and delete or isolate:
- daily file write helpers
- trend index read/write helpers
- stale migration-copy logic
- unused writer queue code

- [ ] **Step 4: Run full tests**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/storage.js src/core/storageWriter.js test/storageWriter.test.js
git commit -m "refactor(storage): 移除 JSON 运行时存储路径"
```

## Chunk 6: Final Verification and Packaging Sanity

### Task 6: Verify end-to-end behavior and document residual risk

**Files:**
- Review: `package.json`
- Review: storage and migration modules
- Optional docs update: `README.md` if storage description changes

- [ ] **Step 1: Re-read the approved spec and implementation diff**

Confirm the delivered work still matches:
- SQLite-only runtime storage
- automatic and manual idempotent import
- preserved storage API

- [ ] **Step 2: Run full verification**

Run: `npm test`  
Expected: PASS with zero failures

- [ ] **Step 3: Run one focused manual migration smoke test if feasible**

Suggested:
- create temp legacy JSON
- run importer twice
- verify row count unchanged on second run

- [ ] **Step 4: Update `README.md` if storage behavior has changed materially**

Document:
- SQLite runtime storage
- legacy JSON auto-migration

- [ ] **Step 5: Commit final polish**

```bash
git add README.md package.json src test
git commit -m "docs(storage): 更新 SQLite 存储说明"
```
