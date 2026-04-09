const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const SCHEMA_VERSION = 1;
let sqlPromise = null;

function ensureParentDirectory(databasePath) {
  const dirPath = path.dirname(databasePath);
  fs.mkdirSync(dirPath, { recursive: true });
}

function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile(fileName) {
        return require.resolve(`sql.js/dist/${fileName}`);
      }
    });
  }
  return sqlPromise;
}

function createStatement(database, sql, flush) {
  return {
    all(...params) {
      const statement = database.prepare(sql);
      try {
        statement.bind(params);
        const rows = [];
        while (statement.step()) {
          rows.push(statement.getAsObject());
        }
        return rows;
      } finally {
        statement.free();
      }
    },
    get(...params) {
      const rows = this.all(...params);
      return rows[0];
    },
    run(...params) {
      database.run(sql, params);
      flush();
    }
  };
}

function ensureSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_key TEXT NOT NULL UNIQUE,
      date_key TEXT NOT NULL,
      repo_path TEXT NOT NULL,
      branch TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      tracked_loc_added INTEGER NOT NULL,
      tracked_loc_deleted INTEGER NOT NULL,
      untracked_loc_added INTEGER NOT NULL,
      untracked_loc_deleted INTEGER NOT NULL,
      total_loc_added INTEGER NOT NULL,
      total_loc_deleted INTEGER NOT NULL,
      tracked_loc_by_file_type TEXT NOT NULL,
      untracked_loc_by_file_type TEXT NOT NULL,
      loc_by_file_type TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_date_key
      ON sessions (date_key);

    CREATE INDEX IF NOT EXISTS idx_sessions_repo_date
      ON sessions (repo_path, date_key);

    CREATE INDEX IF NOT EXISTS idx_sessions_date_repo_branch
      ON sessions (date_key, repo_path, branch);
  `);
}

async function openDatabase(databasePath) {
  if (typeof databasePath !== 'string' || databasePath.trim() === '') {
    throw new Error('databasePath must be a non-empty string');
  }

  ensureParentDirectory(databasePath);
  const SQL = await getSql();
  const buffer = fs.existsSync(databasePath) ? fs.readFileSync(databasePath) : null;
  const database = buffer ? new SQL.Database(buffer) : new SQL.Database();
  let transactionDepth = 0;

  ensureSchema(database);

  function flush() {
    if (transactionDepth > 0) {
      return;
    }
    const data = database.export();
    fs.writeFileSync(databasePath, Buffer.from(data));
  }

  const getMetaStatement = createStatement(database, 'SELECT value FROM meta WHERE key = ?', flush);
  const setMetaStatement = createStatement(database, `
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `, flush);

  const api = {
    databasePath,
    prepare(sql) {
      return createStatement(database, sql, flush);
    },
    exec(sql) {
      const result = database.exec(sql);
      flush();
      return result;
    },
    transaction(fn) {
      return (...args) => {
        transactionDepth += 1;
        database.run('BEGIN');
        try {
          const result = fn(...args);
          database.run('COMMIT');
          transactionDepth -= 1;
          flush();
          return result;
        } catch (error) {
          database.run('ROLLBACK');
          transactionDepth -= 1;
          throw error;
        }
      };
    },
    getMeta(key) {
      const row = getMetaStatement.get(key);
      return row ? row.value : null;
    },
    setMeta(key, value) {
      setMetaStatement.run(key, String(value));
      flush();
    },
    close() {
      flush();
      database.close();
    }
  };

  if (api.getMeta('schema_version') === null) {
    api.setMeta('schema_version', String(SCHEMA_VERSION));
  }

  return Object.freeze(api);
}

module.exports = {
  openDatabase,
  SCHEMA_VERSION
};
